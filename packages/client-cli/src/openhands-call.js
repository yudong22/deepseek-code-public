import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { parseYaml } from './yaml-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. 解析参数并且提供导出
export async function callAgent({ agent, promptVal, rulesPath, fixTarget, sandboxDir, rootDir }) {
  if (agent !== 'hermes' && agent !== 'opencode') {
    throw new Error('必须指定 agent 参数为 hermes 或 opencode');
  }

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

  // 2. 确定配置和 model
  let model = 'deepseek-chat';
  if (agent === 'hermes' && config.agent_routing?.primary_developer?.model) {
    model = config.agent_routing.primary_developer.model;
  } else if (agent === 'opencode' && config.agent_routing?.ci_healer?.model) {
    model = config.agent_routing.ci_healer.model;
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

  if (agent === 'hermes') {
    const hermesContent = `${systemRules}

## 【当前任务指令】
请根据以下需求进行开发：
> ${promptVal}

请注意遵守上述技术栈约束和边界规范。修改完成后直接退出。
`;
    fs.writeFileSync(agentsMdPath, hermesContent);
  } else if (agent === 'opencode') {
    let errorLog = '';
    if (fixTarget && fs.existsSync(fixTarget)) {
      errorLog = fs.readFileSync(fixTarget, 'utf-8');
    } else {
      errorLog = '未知验证错误，请检查项目状态。';
    }

    const opencodeContent = `${systemRules}

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
    fs.writeFileSync(agentsMdPath, opencodeContent);
  }

  // 4. 调用 Agent 进程
  if (agent === 'hermes') {
    // ─── 调用真实的 Nous Research hermes-agent CLI ─────────────────────
    let hermesCmd = 'hermes';
    const localHermes = path.join(os.homedir(), '.local/bin/hermes');
    if (fs.existsSync(localHermes)) {
      hermesCmd = localHermes;
    }
    
    // 组装命令行参数：一键非交互模式，开启 --yolo 自动审批
    const hermesArgs = ['chat', '-q', promptVal, '--yolo'];
    
    // 映射模型标识符
    if (model) {
      let finalModel = model;
      if (!finalModel.includes('/')) {
        if (finalModel === 'deepseek-chat') {
          finalModel = 'deepseek/deepseek-chat-v3.1'; // 映射为用户配置的 openrouter 格式
        } else {
          finalModel = `deepseek/${finalModel}`;
        }
      }
      hermesArgs.push('-m', finalModel);
    }
    
    console.log(`🤖 [openhands-call] 正在唤醒真实 Hermes Agent (Model: ${model})...`);
    
    return new Promise((resolve, reject) => {
      const child = spawn(hermesCmd, hermesArgs, {
        stdio: 'inherit',
        env: process.env,
        cwd: resolvedSandboxDir
      });
      
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Hermes Agent 异常退出，退出码: ${code}`));
        } else {
          console.log(`✅ [openhands-call] Hermes Agent 执行完成。`);
          resolve();
        }
      });
    });
    
  } else {
    // ─── 调用本地 opencode-sidecar 自愈消防员 ─────────────────────────────
    console.log(`🤖 [openhands-call] 正在唤醒本地 OpenCode CI 自愈消防员 (Model: ${model})...`);
    
    const sidecarTsPath = path.join(resolvedRootDir, 'packages/sidecar/src/index.ts');
    
    let errorLogContent = '';
    if (fixTarget && fs.existsSync(fixTarget)) {
      errorLogContent = fs.readFileSync(fixTarget, 'utf-8');
    }
    const sidecarPrompt = `请在当前工作区中修复编译/语法报错。报错内容：${errorLogContent || '详见 AGENTS.md'}`;
    
    const env = {
      ...process.env,
      OPENCODE_MODEL: model,
      WORKSPACE_PATH: resolvedSandboxDir,
      OPENCODE_SESSION_ID: `session-${agent}-${Date.now()}`
    };
    
    return new Promise((resolve, reject) => {
      const child = spawn('bun', ['run', sidecarTsPath], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env,
        cwd: resolvedSandboxDir
      });
      
      child.stdin.write(sidecarPrompt);
      child.stdin.end();
      
      let buffer = '';
      child.stdout.on('data', (data) => {
        buffer += data.toString();
        let lines = buffer.split('\n');
        buffer = lines.pop();
        
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          
          try {
            const event = JSON.parse(line);
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
        if (code !== 0) {
          reject(new Error(`Agent [${agent}] 异常退出，退出码: ${code}`));
        } else {
          console.log(`✅ [openhands-call] Agent [${agent}] 执行完成。`);
          resolve();
        }
      });
    });
  }
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
