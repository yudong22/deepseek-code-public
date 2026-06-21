import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { parseYaml } from './yaml-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. 解析参数并且提供导出
export async function callAgent({ promptVal, rulesPath, fixTarget, sandboxDir, rootDir, env, mode = 'code' }) {
  const resolvedRootDir = rootDir || path.resolve(__dirname, '../../..');
  const resolvedSandboxDir = sandboxDir || process.cwd();

  const configYamlPath = path.join(resolvedRootDir, '.agents/config.yaml');
  let config = {};
  try {
    if (fs.existsSync(configYamlPath)) {
      config = parseYaml(fs.readFileSync(configYamlPath, 'utf-8'));
    }
  } catch (e) {
    console.error(`⚠️ [openhands-call] 读取/解析 config.yaml 失败: ${e.message}`);
  }

  // 2. 确定模型（从配置或环境）
  let model = process.env.OPENCODE_MODEL || 'deepseek-chat';
  if (config.agent_routing?.default?.model) {
    model = config.agent_routing.default.model;
  }

  // 3. 生成 AGENTS.md
  const agentsMdPath = path.join(resolvedSandboxDir, 'AGENTS.md');

  let systemRules = '';
  if (rulesPath && fs.existsSync(rulesPath)) {
    systemRules = fs.readFileSync(rulesPath, 'utf-8');
  } else {
    systemRules = '# AI 执行行为准则\n';
  }

  // 渲染 template placeholders
  if (systemRules.includes('{{project_id}}') || systemRules.includes('{{components}}') || systemRules.includes('{{tech_rules}}')) {
    const projectId = config.project_id || path.basename(resolvedRootDir);

    // 构建 components 描述
    let componentsStr = '';
    const pipeline = config.verification_pipeline || {};
    for (const [name, rule] of Object.entries(pipeline)) {
      if (rule && typeof rule === 'object') {
        const matchPath = rule.match || '';
        let matchDir = matchPath;
        const globStart = matchPath.search(/[*?\[]/);
        if (globStart !== -1) {
          const lastSlashBeforeGlob = matchPath.lastIndexOf('/', globStart);
          if (lastSlashBeforeGlob !== -1) {
            matchDir = matchPath.substring(0, lastSlashBeforeGlob + 1);
          }
        }
        componentsStr += `- **${name}** (主要修改路径: \`${matchDir}\`)\n`;
      }
    }
    if (!componentsStr) {
      componentsStr = '- 默认核心工作区\n';
    }

    // 构建 tech_rules 描述
    let techRulesStr = '';
    const techRules = config.tech_rules || {};
    for (const [key, val] of Object.entries(techRules)) {
      techRulesStr += `- **${key}**：${val}\n`;
    }
    if (!techRulesStr) {
      techRulesStr = '- 暂无特定技术栈约束，请遵循通用最佳实践。\n';
    }

    systemRules = systemRules
      .replace(/\{\{project_id\}\}/g, projectId)
      .replace(/\{\{components\}\}/g, componentsStr.trim())
      .replace(/\{\{tech_rules\}\}/g, techRulesStr.trim());
  }

  // 根据 mode 构建 AGENTS.md 内容
  if (mode === 'code') {
    // 读取 --from-plan 提供的额外上下文
    let planContext = '';
    const planMdPath = path.join(resolvedSandboxDir, '.plan.md');
    if (fs.existsSync(planMdPath)) {
      planContext = fs.readFileSync(planMdPath, 'utf-8');
    }

    const codeContent = `${systemRules}

## 【当前任务指令】
请根据以下需求进行开发：
> ${promptVal}

${planContext ? `## 【前期技术方案参考】\n以下方案已通过审批，请参考实施：\n\n${planContext}\n` : ''}

请注意遵守上述技术栈约束和边界规范。修改完成后直接退出。
`;
    fs.writeFileSync(agentsMdPath, codeContent);
  } else {
    // heal 模式
    let errorLog = '';
    if (fixTarget && fs.existsSync(fixTarget)) {
      errorLog = fs.readFileSync(fixTarget, 'utf-8');
    } else {
      errorLog = '未知验证错误，请检查项目状态。';
    }

    const healContent = `${systemRules}

## 【CI 自愈专属指令】
你当前已被唤醒作为 **OpenCode CI 自愈急救员**。
工作区中刚刚发生了一次代码修改，但在极速验证管道运行时发生了以下编译或语法报错：

\`\`\`
${errorLog}
\`\`\`

**【你的核心任务】**
1. 仅针对上述报错日志中指出的错误进行快速修复（例如补全 import 引入、修复拼写错误、修复类型不匹配、处理语法格式问题等）。
2. **严禁擅自改动核心业务逻辑**。
3. 修复完毕后直接退出。
`;
    fs.writeFileSync(agentsMdPath, healContent);
  }

  // ─── 调用本地 opencode-sidecar ─────────────────────────────
  const modeLabel = mode === 'code' ? '开发' : '自愈';
  console.log(`🤖 [openhands-call] 正在唤醒 OpenCode 执行${modeLabel}任务 (Model: ${model})...`);

  const sidecarTsPath = path.join(resolvedRootDir, 'packages/sidecar/src/index.ts');

  // 构建 sidecar 侧车 prompt
  let sidecarPrompt = '';
  if (mode === 'code') {
    sidecarPrompt = promptVal;
  } else {
    let errorLogContent = '';
    if (fixTarget && fs.existsSync(fixTarget)) {
      errorLogContent = fs.readFileSync(fixTarget, 'utf-8');
    }
    sidecarPrompt = `请在当前工作区中修复编译/语法报错。报错内容：${errorLogContent || '详见 AGENTS.md'}`;
  }

  const spawnEnv = env || process.env;

  return new Promise((resolve, reject) => {
    const child = spawn('bun', ['run', sidecarTsPath], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: {
        ...spawnEnv,
        OPENCODE_MODEL: model,
        WORKSPACE_PATH: resolvedSandboxDir,
        OPENCODE_SESSION_ID: `session-opencode-${Date.now()}`
      },
      cwd: resolvedSandboxDir
    });

    // Read AGENTS.md content and send as JSON with system message
    const agentsMdContent = fs.existsSync(agentsMdPath)
      ? fs.readFileSync(agentsMdPath, 'utf-8')
      : '';
    const stdinInput = JSON.stringify({
      messages: [
        { role: "system", content: agentsMdContent },
        { role: "user", content: sidecarPrompt }
      ]
    });
    child.stdin.write(stdinInput);
    child.stdin.end();

    // Sidecar timeout handling
    const SIDECAR_TIMEOUT_MS = parseInt(process.env.SIDECAR_TIMEOUT_MS || "300000", 10);
    const IDLE_WARN_MS = parseInt(process.env.SIDECAR_IDLE_WARN_MS || "30000", 10);
    let lastEventTime = Date.now();
    let lastEventType = 'none';
    let idleWarnShown = false;

    // 空闲警告：长时间无事件时提示用户
    const idleWatcher = setInterval(() => {
      const elapsed = Date.now() - lastEventTime;
      if (elapsed > IDLE_WARN_MS && !idleWarnShown) {
        idleWarnShown = true;
        const elapsedSec = Math.round(elapsed / 1000);
        console.error(`\n⏳ [openhands-call] ${elapsedSec}s 未收到 Agent 事件 (最后事件: ${lastEventType})，仍在等待 API 响应...\n`);
      }
    }, 10000);

    const timeout = setTimeout(() => {
      clearInterval(idleWatcher);
      child.kill('SIGTERM');
      const elapsed = Math.round((Date.now() - lastEventTime) / 1000);
      reject(new Error(
        `OpenCode 侧车进程超时 (${SIDECAR_TIMEOUT_MS}ms，${elapsed}s 无事件)，已强制终止。` +
        `\n  最后事件: ${lastEventType}` +
        `\n  模型: ${model}` +
        `\n  提示: 可通过环境变量 SIDECAR_TIMEOUT_MS 调整超时时间（默认 180s）`
      ));
    }, SIDECAR_TIMEOUT_MS);

    let buffer = '';
    child.stdout.on('data', (data) => {
      lastEventTime = Date.now();
      buffer += data.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop();

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        try {
          const event = JSON.parse(line);
          lastEventType = event.type || 'unknown';
          switch (event.type) {
            case 'ThinkingStarted':
              process.stdout.write(`🤔 [Thinking] `);
              break;
            case 'Thinking':
              process.stdout.write(event.payload);
              break;
            case 'ThinkingEnded':
              process.stdout.write(`\n`);
              break;
            case 'TextStarted':
              process.stdout.write(`💬 [Response] `);
              break;
            case 'Text':
              process.stdout.write(event.payload);
              break;
            case 'TextEnded':
              process.stdout.write(`\n`);
              break;
            case 'ToolCall':
              console.log(`🛠️  [工具调用] ${event.payload.name}(${event.payload.args})`);
              break;
            case 'ToolStarted':
              break;
            case 'ToolSuccess':
              console.log(`✅ [工具成功] ${event.payload.name}`);
              break;
            case 'ToolFailed':
              console.log(`❌ [工具失败] ${event.payload.name}: ${event.payload.error}`);
              break;
            case 'Finished':
              console.log(`✨ [Agent] 任务完成`);
              break;
            case 'Error':
              console.error(`🚨 [Agent 错误] ${event.payload.message}`);
              break;
            case 'Usage':
              console.log(`📊 [Token 用量] 输入: ${event.payload.tokens_input}, 输出: ${event.payload.tokens_output}`);
              break;
            default:
              console.log(line);
          }
        } catch (e) {
          console.log(line);
        }
      }
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      clearInterval(idleWatcher);
      if (code !== 0) {
        reject(new Error(`OpenCode ${modeLabel}任务异常退出，退出码: ${code}`));
      } else {
        console.log(`✅ [openhands-call] OpenCode ${modeLabel}任务执行完成。`);
        resolve();
      }
    });

    child.on('error', () => clearTimeout(timeout));
  });
}

// 独立运行模式（用于调试）
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let promptVal = '';
  let rulesPath = '';
  let fixTarget = '';
  let mode = 'code';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--prompt=')) {
      promptVal = arg.split('=')[1];
    } else if (arg.startsWith('--rules=')) {
      rulesPath = arg.split('=')[1];
    } else if (arg.startsWith('--fix-target=')) {
      fixTarget = arg.split('=')[1];
    } else if (arg === '--heal') {
      mode = 'heal';
    }
  }

  callAgent({
    promptVal,
    rulesPath,
    fixTarget,
    mode,
    sandboxDir: process.cwd(),
    rootDir: path.resolve(__dirname, '../../..')
  }).then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(`❌ [openhands-call] 执行失败: ${err.message}`);
    process.exit(1);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let agent = '';
  let promptVal = '';
  let rulesPath = '';
  let fixTarget = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--agent=')) {
      agent = arg.split('=')[1];
    } else if (arg.startsWith('--prompt=')) {
      promptVal = arg.split('=')[1];
    } else if (arg.startsWith('--rules=')) {
      rulesPath = arg.split('=')[1];
    } else if (arg.startsWith('--fix-target=')) {
      fixTarget = arg.split('=')[1];
    }
  }

  callAgent({
    agent,
    promptVal,
    rulesPath,
    fixTarget,
    sandboxDir: process.cwd(),
    rootDir: path.resolve(__dirname, '../../..')
  }).then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(`❌ [openhands-call] 执行失败: ${err.message}`);
    process.exit(1);
  });
}
