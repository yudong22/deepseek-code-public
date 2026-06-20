import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseYaml(content) {
  const result = {};
  const lines = content.split('\n');
  const stack = [{ indent: -1, obj: result }];
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    
    const indent = line.search(/\S/);
    const key = line.substring(0, colonIdx).trim().replace(/['"]/g, '');
    let val = line.substring(colonIdx + 1).trim();
    
    const hashIdx = val.indexOf('#');
    if (hashIdx !== -1) {
      val = val.substring(0, hashIdx).trim();
    }
    val = val.replace(/['"]/g, '');
    
    if (val === '') {
      const newObj = {};
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      stack[stack.length - 1].obj[key] = newObj;
      stack.push({ indent, obj: newObj });
    } else {
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (!isNaN(val) && val !== '') val = Number(val);
      
      stack[stack.length - 1].obj[key] = val;
    }
  }
  return result;
}

// 1. 解析参数
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

if (!agent) {
  console.error('❌ [openhands-call] 必须指定 --agent 参数 (hermes 或 opencode)');
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const configYamlPath = path.join(rootDir, '.agents/config.yaml');
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
const sandboxDir = process.cwd();
const agentsMdPath = path.join(sandboxDir, 'AGENTS.md');

let systemRules = '';
if (rulesPath && fs.existsSync(rulesPath)) {
  systemRules = fs.readFileSync(rulesPath, 'utf-8');
} else {
  systemRules = '# AI 执行行为准则\n';
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
  
  const child = spawn(hermesCmd, hermesArgs, {
    stdio: 'inherit',
    env: process.env
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ [openhands-call] Hermes Agent 异常退出，退出码: ${code}`);
      process.exit(code || 1);
    } else {
      console.log(`✅ [openhands-call] Hermes Agent 执行完成。`);
      process.exit(0);
    }
  });
  
} else {
  // ─── 调用本地 opencode-sidecar 自愈消防员 ─────────────────────────────
  console.log(`🤖 [openhands-call] 正在唤醒本地 OpenCode CI 自愈消防员 (Model: ${model})...`);
  
  const sidecarTsPath = path.join(rootDir, 'src-sidecar/index.ts');
  const sidecarPrompt = `请在当前工作区中修复编译/语法报错。报错内容：${fs.existsSync(fixTarget) ? fs.readFileSync(fixTarget, 'utf-8') : '详见 AGENTS.md'}`;
  
  const env = {
    ...process.env,
    OPENCODE_MODEL: model,
    WORKSPACE_PATH: sandboxDir,
    OPENCODE_SESSION_ID: `session-${agent}-${Date.now()}`
  };
  
  const child = spawn('bun', ['run', sidecarTsPath], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env
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
      console.error(`❌ [openhands-call] Agent [${agent}] 异常退出，退出码: ${code}`);
      process.exit(code || 1);
    } else {
      console.log(`✅ [openhands-call] Agent [${agent}] 执行完成。`);
      process.exit(0);
    }
  });
}
