#!/usr/bin/env bun
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { callAgent } from './openhands-call.js';
import { fastValidate } from './fast-validate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configDir = path.join(os.homedir(), '.openhands');
const configPath = path.join(configDir, 'config.json');

// Helper to log with styling
function log(msg: string) {
  console.log(`\x1b[36m🚀 [OpenHands CLI]\x1b[0m ${msg}`);
}

function logError(msg: string) {
  console.error(`\x1b[31m❌ [OpenHands CLI]\x1b[0m ${msg}`);
}

// Load CLI Config
function loadConfig() {
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

// Save CLI Config
function saveConfig(cfg: any) {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

// Main CLI router
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case 'login':
        await handleLogin(args.slice(1));
        break;
      case 'doctor':
        await handleDoctor();
        break;
      case 'run':
        await handleRun(args.slice(1));
        break;
      case 'memory':
        if (args[1] === 'sync') {
          await handleMemorySync(args.slice(2));
        } else {
          logError("未知子命令。使用 'openhands memory sync'。");
        }
        break;
      default:
        logError(`未知命令: ${command}`);
        printHelp();
    }
  } catch (e: any) {
    logError(e.message);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
  \x1b[36mOpenHands C/S 自愈流水线客户端 CLI\x1b[0m
  
  \x1b[1m使用方式:\x1b[0m
    openhands <command> [options]
    
  \x1b[1m核心命令:\x1b[0m
    \x1b[32mlogin\x1b[0m       --server <url> --id <id> --secret <secret>   连接 Go 网关进行 JWT 授权登录
    \x1b[32mdoctor\x1b[0m      环境依赖健康度审计 (检查 Git/Bun/Hermes 以及项目编译器 SDK)
    \x1b[32mrun\x1b[0m         [task-desc] [--task-id <id>]              启动本地影子沙箱自愈开发流水线
    \x1b[32mmemory sync\x1b[0m --commit <commit_id>                      上报审核合并后的成功经验至向量记忆库
    
  \x1b[1m选项:\x1b[0m
    -h, --help    显示帮助信息
  `);
}

async function handleLogin(args: string[]) {
  let server = '';
  let id = '';
  let secret = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server') server = args[i + 1];
    else if (args[i] === '--id') id = args[i + 1];
    else if (args[i] === '--secret') secret = args[i + 1];
  }

  if (!server || !id || !secret) {
    throw new Error("登录失败: 必须指定 --server, --id 和 --secret 参数。");
  }

  log(`正在尝试连接网关 ${server} ...`);
  const loginURL = `${server.replace(/\/$/, '')}/login`;

  const resp = await fetch(loginURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: id, client_secret: secret })
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(`授权网关拒绝访问: ${errBody.error || resp.statusText}`);
  }

  const result = await resp.json();
  const cfg = {
    serverUrl: server.replace(/\/$/, ''),
    jwt: result.access_token,
    expiresAt: Date.now() + (result.expires_in * 1000)
  };

  saveConfig(cfg);
  log("\x1b[32m授权成功！已将凭证存入本地配置目录。\x1b[0m");
}

async function handleDoctor() {
  log("开始执行本地研发环境依赖审计...");
  let healthy = true;

  // 1. Git check
  try {
    const gitVer = execSync('git --version', { encoding: 'utf-8' }).trim();
    console.log(`  - [Git] \x1b[32m已安装\x1b[0m (${gitVer})`);
  } catch (e) {
    console.log("  - [Git] \x1b[31m未安装\x1b[0m (影子工作区依赖 git worktree)");
    healthy = false;
  }

  // 2. Hermes CLI check
  const localHermes = path.join(os.homedir(), '.local/bin/hermes');
  const hermesInstalled = fs.existsSync(localHermes);
  if (hermesInstalled) {
    console.log("  - [Hermes Agent] \x1b[32m已安装\x1b[0m (路径: ~/.local/bin/hermes)");
  } else {
    try {
      execSync('which hermes');
      console.log("  - [Hermes Agent] \x1b[32m已安装\x1b[0m (通过 PATH 查获)");
    } catch (e) {
      console.log("  - [Hermes Agent] \x1b[33m未检测到\x1b[0m (请配置 ~/.local/bin/hermes 或确保全局安装)");
      healthy = false;
    }
  }

  // 3. Project Config Toolchain Check
  const rootDir = path.resolve(__dirname, '../../..');
  const configYamlPath = path.join(rootDir, '.agents/config.yaml');
  if (fs.existsSync(configYamlPath)) {
    console.log("  - [项目配置] 成功加载 .agents/config.yaml");
    
    // Scan config for compiler requirements
    const configContent = fs.readFileSync(configYamlPath, 'utf-8');
    if (configContent.includes('go test') || configContent.includes('go fmt')) {
      try {
        execSync('go version');
        console.log("  - [Go SDK] \x1b[32m已安装\x1b[0m");
      } catch (e) {
        console.log("  - [Go SDK] \x1b[31m未安装\x1b[0m (项目门禁需要 go 工具链)");
        healthy = false;
      }
    }
    if (configContent.includes('flutter analyze')) {
      try {
        execSync('flutter --version');
        console.log("  - [Flutter SDK] \x1b[32m已安装\x1b[0m");
      } catch (e) {
        console.log("  - [Flutter SDK] \x1b[31m未安装\x1b[0m (项目门禁需要 flutter SDK)");
        healthy = false;
      }
    }
    if (configContent.includes('cargo check')) {
      try {
        execSync('cargo --version');
        console.log("  - [Rust/Cargo] \x1b[32m已安装\x1b[0m");
      } catch (e) {
        console.log("  - [Rust/Cargo] \x1b[31m未安装\x1b[0m (项目门禁需要 Rust 编译器)");
        healthy = false;
      }
    }
  } else {
    console.log("  - [项目配置] \x1b[33m警告: 未在当前工作区根目录检测到 .agents/config.yaml\x1b[0m");
  }

  if (healthy) {
    log("\x1b[32m环境检测通过！所有依赖均已就绪。\x1b[0m");
  } else {
    log("\x1b[31m环境检测存在缺失项，可能会导致自愈流水线失败，请根据提示安装依赖。\x1b[0m");
  }
}

async function handleRun(args: string[]) {
  const cfg = loadConfig();
  const hasGateway = cfg && cfg.jwt && Date.now() < cfg.expiresAt;

  if (!hasGateway) {
    log("未检测到网关凭证，将以离线模式直连 DeepSeek API（需要 DEEPSEEK_API_KEY 环境变量）...");
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error("离线模式需要设置环境变量 DEEPSEEK_API_KEY。请先 export DEEPSEEK_API_KEY=sk-...");
    }
  }

  let taskId = `task-${Date.now()}`;
  let taskDesc = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task-id') {
      taskId = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      taskDesc = args[i];
    }
  }

  if (!taskDesc) {
    throw new Error("必须指定任务描述参数。例如: openhands run \"修复类型错误\"");
  }

  const rootDir = path.resolve(__dirname, '../../..');
  const sandboxRoot = "/tmp/ai-workers";
  const sandboxDir = path.join(sandboxRoot, taskId);

  log(`初始化本地影子沙箱工作区隔离 [ai/${taskId}]...`);

  // 清理残留工作区
  if (fs.existsSync(sandboxDir)) {
    log(`发现残留工作区 ${sandboxDir}，正在清理...`);
    try {
      execSync(`git worktree remove ${sandboxDir} --force`, { cwd: rootDir, stdio: 'ignore' });
    } catch (_e) {}
    try {
      execSync(`git branch -D ai/${taskId} 2>/dev/null`, { cwd: rootDir });
    } catch (_e) {}
  }
  // 同时清理 24 小时前的过期工作区
  try {
    const worktreeList = execSync('git worktree list', { cwd: rootDir, encoding: 'utf-8' });
    const lines = worktreeList.split('\n').filter(l => l.includes('/tmp/ai-workers/'));
    for (const line of lines) {
      const wPath = line.split(/\s+/)[0];
      if (wPath && fs.existsSync(wPath)) {
        const stats = fs.statSync(wPath);
        if (Date.now() - stats.mtimeMs > 24 * 60 * 60 * 1000) {
          log(`清理过期工作区: ${wPath}`);
          execSync(`git worktree remove ${wPath} --force`, { cwd: rootDir, stdio: 'ignore' });
        }
      }
    }
  } catch (_e) {}

  if (!fs.existsSync(sandboxRoot)) {
    fs.mkdirSync(sandboxRoot, { recursive: true });
  }

  // 1. Create worktree
  execSync(`git worktree add -b ai/${taskId} ${sandboxDir} main`, { cwd: rootDir });
  log(`影子沙箱物理路径已建立: ${sandboxDir}`);

  process.chdir(sandboxDir);
  const sandboxAgentsDir = path.join(sandboxDir, '.agents');
  if (!fs.existsSync(sandboxAgentsDir)) {
    fs.mkdirSync(sandboxAgentsDir, { recursive: true });
  }

  try {
    // 2. Fetch memory from Go gateway (only when gateway available)
    let memoriesStr = '';
    if (hasGateway) {
      log("正在向网关拉取相关长期相似经验...");
      try {
        const searchResp = await fetch(`${cfg.serverUrl}/api/memory/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.jwt}`
          },
          body: JSON.stringify({ prompt: taskDesc })
        });
        if (searchResp.ok) {
          const searchResult = await searchResp.json();
          const memories = searchResult.memories || [];
          if (memories.length > 0) {
            memoriesStr += "\n## 💡 【网关历史推荐经验参考】\n";
            memories.forEach((m: any, idx: number) => {
              memoriesStr += `### 推荐案例 ${idx + 1} (相似度: ${(m.score * 100).toFixed(1)}%)\n`;
              memoriesStr += `- **任务描述**：${m.prompt}\n`;
              memoriesStr += `- **修改方案 (Git Diff)**：\n\`\`\`diff\n${m.git_diff}\n\`\`\`\n`;
              if (m.error_log) {
                memoriesStr += `- **前置报错**：\n\`\`\`\n${m.error_log}\n\`\`\`\n`;
              }
            });
          } else {
            log("未匹配到相关开发经验，启动全新探索模式。");
          }
        }
      } catch (e: any) {
        log(`连接网关记忆库失败: ${e.message}。将跳过检索。`);
      }
    } else {
      log("离线模式：跳过网关记忆检索。");
    }

    // 3. Setup rules and AGENTS.md
    // Build the env for agent spawn — no global process.env mutation
    const spawnEnv = hasGateway
      ? {
          ...process.env,
          OPENAI_BASE_URL: `${cfg.serverUrl}/v1`,
          OPENAI_API_KEY: cfg.jwt,
          DEEPSEEK_API_KEY: cfg.jwt,
          WORKSPACE_PATH: sandboxDir
        }
      : { ...process.env, WORKSPACE_PATH: sandboxDir };

    // Temporarily write the injected memory context to rules md
    const originalRulesPath = path.join(rootDir, '.agents/agent.md');
    let dynamicRulesPath = originalRulesPath;
    if (memoriesStr && fs.existsSync(originalRulesPath)) {
      const baseRules = fs.readFileSync(originalRulesPath, 'utf-8');
      dynamicRulesPath = path.join(sandboxAgentsDir, 'agent_injected.md');
      fs.writeFileSync(dynamicRulesPath, `${baseRules}\n${memoriesStr}`);
    }

    // 4. Spawn Hermes
    log("唤醒主力开发 Agent (Hermes) 开始写代码...");

    await callAgent({
      agent: 'hermes',
      promptVal: taskDesc,
      rulesPath: dynamicRulesPath,
      sandboxDir,
      rootDir,
      env: spawnEnv
    });

    // 5. Validation and OpenCode Heal loop
    let healCount = 0;
    const maxHeals = 3;
    let isPassed = false;

    while (!isPassed && healCount < maxHeals) {
      try {
        log("触发极速门禁验证验证...");
        await fastValidate({ rootDir, sandboxDir });
        isPassed = true;
      } catch (validationError: any) {
        healCount++;
        logError(`[验证失败] 第 ${healCount} 次唤醒 OpenCode CI 自愈...`);

        const errorLog = validationError.message;
        const lastErrorLogPath = path.join(sandboxAgentsDir, 'last_error.log');
        fs.writeFileSync(lastErrorLogPath, errorLog);

        try {
          await callAgent({
            agent: 'opencode',
            rulesPath: dynamicRulesPath,
            fixTarget: lastErrorLogPath,
            sandboxDir,
            rootDir,
            env: process.env  // 使用干净的环境变量（无网关代理）
          });
        } catch (e: any) {
          logError(`OpenCode 运行期间抛出异常: ${e.message}`);
        }
      }
    }

    if (!isPassed) {
      throw new Error(`OpenCode 自愈达到最大上限次数 (${maxHeals})，代码仍有错误！`);
    }

    // 6. Final Commit
    log("验证全部通过！正在生成本地原子提交...");
    execSync(`git add . && git commit -m "ai(${taskId}): ${taskDesc} (自愈次数: ${healCount})"`, { cwd: sandboxDir });

    // 6b. Auto-sync memory if gateway available
    if (hasGateway) {
      log("正在同步经验到网关记忆库...");
      try {
        await handleMemorySync(['--commit', 'HEAD']);
      } catch (e: any) {
        log(`记忆同步失败（非致命）: ${e.message}`);
      }
    }

    // Cleanup worktree
    process.chdir(rootDir);
    log("清理影子物理沙箱...");
    execSync(`git worktree remove ${sandboxDir}`, { cwd: rootDir });

    // Print local card notification
    console.log('\n┌──────────────────────────────────────────────────────────────────┐');
    console.log(`│ \x1b[32m🎉  AI 任务流水线自愈执行成功！\x1b[0m                                         │`);
    console.log(`│ \x1b[1m任务分支\x1b[0m : ai/${taskId.padEnd(49)} │`);
    console.log(`│ \x1b[1m状态\x1b[0m     : \x1b[32m极速校验已全部跑通。请切换分支 Review 并网！\x1b[0m          │`);
    console.log('└──────────────────────────────────────────────────────────────────┘\n');

  } catch (error: any) {
    logError(`流水线崩溃，正在执行安全回滚: ${error.message}`);
    process.chdir(rootDir);
    try {
      if (fs.existsSync(sandboxDir)) {
        execSync(`git worktree remove ${sandboxDir} --force`, { cwd: rootDir });
      }
      execSync(`git branch -D ai/${taskId}`, { cwd: rootDir });
    } catch (e: any) {
      logError(`清理工作区失败: ${e.message}`);
    }
    process.exit(1);
  }
}

async function handleMemorySync(args: string[]) {
  const cfg = loadConfig();
  if (!cfg || !cfg.jwt) {
    throw new Error("请先运行 'openhands login' 完成授权登录。");
  }

  let commitId = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--commit') {
      commitId = args[i + 1];
    }
  }

  if (!commitId) {
    throw new Error("必须指定 commit_id 参数。例如: openhands memory sync --commit HEAD");
  }

  log(`提取 Commit ${commitId} 数据并同步至远端记忆库...`);
  const rootDir = path.resolve(__dirname, '../../..');

  // Extract commit details
  let commitMsg = '';
  let gitDiff = '';
  try {
    commitMsg = execSync(`git log -1 --pretty=%B ${commitId}`, { cwd: rootDir, encoding: 'utf-8' }).trim();
    gitDiff = execSync(`git diff ${commitId}^ ${commitId}`, { cwd: rootDir, encoding: 'utf-8' }).trim();
  } catch (e: any) {
    throw new Error(`无法提取 commit ${commitId} 详情: ${e.message}`);
  }

  // Parse prompt from commit msg (usually matches ai(task-...): prompt)
  let prompt = commitMsg;
  const match = commitMsg.match(/ai\(.*?\):\s*(.*?)\s*\(/);
  if (match && match[1]) {
    prompt = match[1];
  }

  // Check config for project_id
  let projectId = 'unknown-project';
  const configYamlPath = path.join(rootDir, '.agents/config.yaml');
  if (fs.existsSync(configYamlPath)) {
    const configContent = fs.readFileSync(configYamlPath, 'utf-8');
    const projectMatch = configContent.match(/project_id:\s*["']?(.*?)["']?\s*\n/);
    if (projectMatch && projectMatch[1]) {
      projectId = projectMatch[1];
    }
  }

  const syncResp = await fetch(`${cfg.serverUrl}/api/memory/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.jwt}`
    },
    body: JSON.stringify({
      prompt: prompt,
      git_diff: gitDiff,
      error_log: '',
      heal_count: 0,
      project_id: projectId
    })
  });

  if (!syncResp.ok) {
    const errBody = await syncResp.json().catch(() => ({}));
    throw new Error(`网关上报记忆失败: ${errBody.error || syncResp.statusText}`);
  }

  log("\x1b[32m记忆成功同步并导入远端向量数据库！\x1b[0m");
}

main();
