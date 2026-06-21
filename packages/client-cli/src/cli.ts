#!/usr/bin/env bun
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { callAgent } from './openhands-call.js';
import { fastValidate } from './fast-validate.js';
import { renderStatusBar, clearStatusBar, formatDuration } from './ui-utils.ts';

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
export function loadConfig() {
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
      case 'plan':
        await handlePlan(args.slice(1));
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
  \x1b[36mOpenHands C/S 自愈流水线客户端 CLI (v0.4.0)\x1b[0m

  \x1b[1m使用方式:\x1b[0m
    openhands <command> [options]

  \x1b[1m核心命令:\x1b[0m
    \x1b[32mlogin\x1b[0m       --server <url> --id <id> --secret <secret>   连接 Go 网关进行 JWT 授权登录
    \x1b[32mdoctor\x1b[0m      环境依赖健康度审计 (检查 Bun/Git/项目编译器 SD金)
    \x1b[32mplan\x1b[0m         "<task-desc>"                               AI 分析需求并生成技术方案（前期讨论）
    \x1b[32mrun\x1b[0m         [task-desc] [--task-id <id>]                启动本地影子沙箱自愈开发流水线
    \x1b[32mrun\x1b[0m         --from-plan <path>                          基于 plan 生成的方案执行开发
    \x1b[32mmemory sync\x1b[0m --commit <commit_id>                        上报审核合并后的成功经验至向量记忆库

  \x1b[1mRun 选项:\x1b[0m
    --provider <name>   指定供应商 (deepseek/openai/anthropic，仅在离线模式生效)
    --model <name>      指定模型名（覆盖 config.yaml 中的默认模型）
    --task-id <id>      指定任务 ID（默认自动生成）

  \x1b[1m示例:\x1b[0m
    openhands plan "添加用户登录页面"
    openhands run --from-plan .plan.md "添加用户登录页面"
    DEEPSEEK_API_KEY=sk-xxx openhands run "修复类型错误"
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

  // 2. OpenCode Agent check (bundled sidecar)
  const sidecarPath = path.resolve(__dirname, '../../sidecar/src/index.ts');
  if (fs.existsSync(sidecarPath)) {
    console.log("  - [OpenCode Sidecar] \x1b[32m就绪\x1b[0m (内置, 路径: packages/sidecar/src/index.ts)");
  } else {
    console.log("  - [OpenCode Sidecar] \x1b[31m未找到\x1b[0m (预期路径: packages/sidecar/src/index.ts)");
    healthy = false;
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

// ─── 本地记忆管理 ─────────────────────────────────────
export function getMemoriesPath(): string {
  return process.env.OPENHANDS_MEMORIES_PATH || path.join(os.homedir(), '.openhands', 'memories.json');
}

export function loadLocalMemories(memoriesFile?: string): any[] {
  const file = memoriesFile || getMemoriesPath();
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

export function saveLocalMemories(memories: any[], memoriesFile?: string) {
  const file = memoriesFile || getMemoriesPath();
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(memories, null, 2));
  } catch (e) {}
}

export function searchLocalMemories(prompt: string, maxResults = 3, memoriesFile?: string): any[] {
  const memories = loadLocalMemories(memoriesFile);
  const promptTokens = tokenize(prompt);
  const scored = memories.map(m => {
    const memTokens = tokenize(m.prompt);
    const intersection = memTokens.filter(t => promptTokens.includes(t)).length;
    const union = new Set([...memTokens, ...promptTokens]).size;
    const score = union > 0 ? intersection / union : 0;
    return { ...m, score };
  });
  return scored.filter(m => m.score >= 0.10).sort((a, b) => b.score - a.score).slice(0, maxResults);
}

export function addLocalMemory(entry: any, memoriesFile?: string) {
  const memories = loadLocalMemories(memoriesFile);
  memories.push({ ...entry, timestamp: Date.now() });
  // 保留最近 100 条
  const trimmed = memories.slice(-100);
  saveLocalMemories(trimmed, memoriesFile);
}

export function tokenize(s: string): string[] {
  return s.toLowerCase().split(/\W+/).filter(Boolean);
}

// ─── AI 需求分析：生成技术方案 ───────────────────────
export async function handlePlan(args: string[]) {
  const taskDesc = args.filter(a => !a.startsWith('--')).join(' ') || '';
  if (!taskDesc) {
    throw new Error("请指定任务描述。例如: openhands plan \"添加用户登录页面\"");
  }

  log(`正在分析需求并生成技术方案...`);

  const cfg = loadConfig();

  // 解析计划模式使用的模型（默认用便宜模型）
  let planModel = process.env.OPENCODE_PLAN_MODEL || 'deepseek-chat';
  let apiKey = process.env.DEEPSEEK_API_KEY || '';
  let baseUrl = 'https://api.deepseek.com/v1';

  // 从配置中读取供应商信息
  if (cfg?.providers?.deepseek?.apiKey) {
    apiKey = cfg.providers.deepseek.apiKey;
  }
  if (cfg?.providers?.deepseek?.baseUrl) {
    baseUrl = cfg.providers.deepseek.baseUrl;
  }
  if (cfg?.planModel) {
    planModel = cfg.planModel;
  }

  if (!apiKey) {
    throw new Error("需要设置 API key（通过环境变量 DEEPSEEK_API_KEY 或配置 ~/.openhands/config.json 中的 providers）");
  }

  // 检查本地记忆
  const localMemories = searchLocalMemories(taskDesc);
  let memoriesContext = '';
  if (localMemories.length > 0) {
    memoriesContext = '\n\n## 【相关历史经验】\n';
    localMemories.forEach((m: any, i: number) => {
      memoriesContext += `### 经验 ${i + 1} (相似度: ${(m.score * 100).toFixed(0)}%)\n`;
      memoriesContext += `- **原任务**: ${m.prompt}\n`;
      if (m.git_diff) {
        memoriesContext += `- **修改**: \`\`\`diff\n${m.git_diff.slice(0, 500)}\n\`\`\`\n`;
      }
    });
  }

  const planPrompt = `你是一位资深架构师。请分析以下需求并输出详细的技术方案。

需求描述：
${taskDesc}
${memoriesContext}

请输出包含以下内容的 Markdown 方案：

## 1. 需求分析
- 核心功能点
- 技术难点
- 关键决策

## 2. 技术方案
- 架构设计
- 组件/文件选择
- API 接口设计（如适用）

## 3. 修改清单
- 需要创建的文件
- 需要修改的文件
- 每个文件的大致改动

## 4. 实施步骤
- 按顺序的关键步骤

## 5. 潜在风险
- 可能遇到的问题及应对

请确保方案具体、可执行。`;

  // 调用 LLM API
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: planModel,
      messages: [{ role: 'user', content: planPrompt }],
      temperature: 0.7,
      max_tokens: 4096
    })
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`AI 方案生成失败 (${resp.status}): ${errBody}`);
  }

  const result = await resp.json();
  const planContent = result.choices?.[0]?.message?.content || '';

  // 保存到 .plan.md
  const planPath = path.join(process.cwd(), '.plan.md');
  fs.writeFileSync(planPath, planContent);

  console.log('\n' + '='.repeat(60));
  console.log('📋 生成的技术方案:');
  console.log('='.repeat(60));
  console.log(planContent);
  console.log('='.repeat(60));
  console.log(`\n✅ 方案已保存到: ${planPath}`);
  console.log(`💡 确认后运行: openhands run --from-plan .plan.md "${taskDesc}"\n`);
}

async function handleRun(args: string[]) {
  const cfg = loadConfig();
  const hasGateway = cfg && cfg.jwt && Date.now() < cfg.expiresAt;

  if (!hasGateway) {
    log("未检测到网关凭证，将以离线模式直连 API（需要设置 API key）...");
  }

  let taskId = `task-${Date.now()}`;
  let taskDesc = '';
  let fromPlanPath = '';
  let cliProvider = '';
  let cliModel = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task-id') {
      taskId = args[i + 1];
      i++;
    } else if (args[i] === '--from-plan') {
      fromPlanPath = args[i + 1];
      i++;
    } else if (args[i] === '--provider') {
      cliProvider = args[i + 1];
      i++;
    } else if (args[i] === '--model') {
      cliModel = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      taskDesc = args[i];
    }
  }

  if (!taskDesc) {
    throw new Error("必须指定任务描述参数。例如: openhands run \"修复类型错误\"");
  }

  // ─── 底部状态仪表盘 ─────────────────────────
  const pipelineStartTime = Date.now();
  const STAGES = [
    { label: '影子沙箱隔离' },
    { label: '记忆检索' },
    { label: 'Agent 执行代码开发' },
    { label: '门禁验证与自愈' },
    { label: '提交与记忆同步' },
    { label: '清理沙箱' },
  ];
  let currentStage = 0;
  let currentToolName = '';
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  let statusLines = 0;

  function updateDashboard(stage: number, tool?: string) {
    currentStage = Math.max(stage, currentStage);
    if (tool) currentToolName = tool;
    if (statusTimer) return; // 定时器已经启动
  }

  function startDashboard() {
    if (statusTimer) return;
    statusTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - pipelineStartTime) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      const stage = STAGES[Math.min(currentStage, STAGES.length - 1)];

      // 清除旧状态栏
      if (statusLines > 0) process.stderr.write(clearStatusBar(statusLines));

      const bar = renderStatusBar({
        step: currentStage + 1,
        totalSteps: STAGES.length,
        label: stage.label,
        currentTool: currentToolName || undefined,
        model: cliModel || process.env.OPENCODE_MODEL || undefined,
        elapsed: `${mm}:${ss}`,
      });
      process.stderr.write(bar + '\n');
      statusLines = bar.split('\n').length;
    }, 200);
  }

  function stopDashboard() {
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    if (statusLines > 0) {
      process.stderr.write(clearStatusBar(statusLines));
      statusLines = 0;
    }
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

  startDashboard();
  updateDashboard(1);

  try {
    // 2. Copy .plan.md into sandbox if --from-plan provided
    if (fromPlanPath) {
      const srcPlan = path.resolve(process.cwd(), fromPlanPath);
      if (fs.existsSync(srcPlan)) {
        fs.copyFileSync(srcPlan, path.join(sandboxDir, '.plan.md'));
        log(`已加载前期技术方案: ${fromPlanPath}`);
      } else {
        log(`警告: --from-plan 文件不存在: ${fromPlanPath}`);
      }
    }

    // 3. Fetch memory
    updateDashboard(2);
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
      // 离线模式：从本地记忆检索
      log("离线模式：正在从本地记忆检索相关经验...");
      const localMemories = searchLocalMemories(taskDesc);
      if (localMemories.length > 0) {
        memoriesStr += "\n## 💡 【本地历史经验参考】\n";
        localMemories.forEach((m: any, idx: number) => {
          memoriesStr += `### 推荐案例 ${idx + 1} (相似度: ${(m.score * 100).toFixed(1)}%)\n`;
          memoriesStr += `- **任务描述**：${m.prompt}\n`;
          if (m.git_diff) {
            memoriesStr += `- **修改方案 (Git Diff)**：\n\`\`\`diff\n${m.git_diff}\n\`\`\`\n`;
          }
        });
        log(`从本地记忆找到 ${localMemories.length} 条相关经验`);
      } else {
        log("本地无相关经验，启动全新探索模式。");
      }
    }

    // 4. Setup rules and AGENTS.md
    let spawnEnv: Record<string, string> = { ...process.env, WORKSPACE_PATH: sandboxDir };

    if (hasGateway) {
      // 网关模式
      spawnEnv = {
        ...spawnEnv,
        OPENAI_BASE_URL: `${cfg.serverUrl}/v1`,
        OPENAI_API_KEY: cfg.jwt,
        DEEPSEEK_API_KEY: cfg.jwt,
        OPENCODE_MODEL: cliModel || cfg?.model || ''
      };
    } else {
      // 离线模式：多供应商支持
      const provider = cliProvider || cfg?.defaultProvider || 'deepseek';
      const provCfg = cfg?.providers?.[provider];
      const apiKey = provCfg?.apiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '';
      const baseUrl = provCfg?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';

      if (!apiKey) {
        throw new Error(
          `离线模式需要设置 API key。\n` +
          `  方式1: export DEEPSEEK_API_KEY=sk-xxx\n` +
          `  方式2: 在 ~/.openhands/config.json 中配置 providers\n` +
          `  方式3: openhands login 使用网关模式`
        );
      }

      // 模型名规范化: opencode 需要 API 能识别的模型名
      // 去掉 provider/ 前缀（如 deepseek/deepseek-chat → deepseek-chat）
      let rawModel = cliModel || provCfg?.model || cfg?.model || process.env.OPENCODE_MODEL || 'deepseek-chat';
      const model = rawModel.includes('/') ? rawModel.split('/').pop()! : rawModel;
      if (model !== rawModel) {
        log(`模型名归一化: ${rawModel} → ${model}`);
      }
      // DeepSeek 供应商标准模型名校验（仅做提示，不强制）
      const KNOWN_DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'];
      if (baseUrl.includes('deepseek.com') && !KNOWN_DEEPSEEK_MODELS.includes(model)) {
        log(`⚠️ 模型名 "${model}" 可能不被 DeepSeek API 识别（标准: ${KNOWN_DEEPSEEK_MODELS.join('/')}）`);
        log(`   如果 Sidecar 长时间无响应，试试 --model deepseek-chat`);
      }

      spawnEnv = {
        ...spawnEnv,
        OPENAI_BASE_URL: baseUrl,
        DEEPSEEK_API_KEY: apiKey,
        OPENAI_API_KEY: apiKey,
        OPENCODE_MODEL: model
      };
    }

    // Write the injected memory context to rules md
    const originalRulesPath = path.join(rootDir, '.agents/agent.md');
    let dynamicRulesPath = originalRulesPath;
    if (memoriesStr && fs.existsSync(originalRulesPath)) {
      const baseRules = fs.readFileSync(originalRulesPath, 'utf-8');
      dynamicRulesPath = path.join(sandboxAgentsDir, 'agent_injected.md');
      fs.writeFileSync(dynamicRulesPath, `${baseRules}\n${memoriesStr}`);
    }

    // 5. OpenCode agent — write code
    updateDashboard(3);
    log("唤醒 OpenCode Agent 开始写代码...");

    await callAgent({
      promptVal: taskDesc,
      rulesPath: dynamicRulesPath,
      sandboxDir,
      rootDir,
      env: spawnEnv,
      mode: 'code'
    });

    // 6. Validation and Heal loop
    updateDashboard(4);
    let healCount = 0;
    const maxHeals = 3;
    let isPassed = false;
    let lastErrorMsg = '';

    while (!isPassed && healCount < maxHeals) {
      try {
        log("触发极速门禁验证...");
        await fastValidate({ rootDir, sandboxDir });
        isPassed = true;
      } catch (validationError: any) {
        healCount++;
        lastErrorMsg = validationError.message;
        logError(`[验证失败] 第 ${healCount} 次唤醒 OpenCode CI 自愈...`);

        const errorLog = validationError.message;
        const lastErrorLogPath = path.join(sandboxAgentsDir, 'last_error.log');
        fs.writeFileSync(lastErrorLogPath, errorLog);

        try {
          await callAgent({
            rulesPath: dynamicRulesPath,
            fixTarget: lastErrorLogPath,
            sandboxDir,
            rootDir,
            env: spawnEnv,
            mode: 'heal'
          });
        } catch (e: any) {
          logError(`OpenCode 运行期间抛出异常: ${e.message}`);
        }
      }
    }

    if (!isPassed) {
      throw new Error(`自愈达到最大上限次数 (${maxHeals})，代码仍有错误！`);
    }

    // 7. Final Commit
    updateDashboard(5);
    log("验证全部通过！正在生成本地原子提交...");
    execSync(`git add . && git commit -m "ai(${taskId}): ${taskDesc} (自愈次数: ${healCount})"`, { cwd: sandboxDir });

    // 7b. Save local memory (always, regardless of gateway)
    try {
      let gitDiff = '';
      try {
        gitDiff = execSync(`git diff HEAD~1 HEAD`, { cwd: sandboxDir, encoding: 'utf-8' }).trim();
      } catch (_e) {}
      addLocalMemory({
        prompt: taskDesc,
        git_diff: gitDiff,
        error_log: lastErrorMsg,
        heal_count: healCount
      });
      log("经验已保存到本地记忆库。");
    } catch (e: any) {
      log(`本地记忆保存失败（非致命）: ${e.message}`);
    }

    // 7c. Auto-sync memory to gateway if available
    if (hasGateway) {
      log("正在同步经验到网关记忆库...");
      try {
        await handleMemorySync(['--commit', 'HEAD']);
      } catch (e: any) {
        log(`网关记忆同步失败（非致命）: ${e.message}`);
      }
    }

    stopDashboard();
    // Cleanup worktree
    process.chdir(rootDir);
    updateDashboard(6);
    log("清理影子物理沙箱...");
    execSync(`git worktree remove ${sandboxDir}`, { cwd: rootDir });

    // Print local card notification
    console.log('\n┌──────────────────────────────────────────────────────────────────┐');
    console.log(`│ \x1b[32m🎉  AI 任务流水线自愈执行成功！\x1b[0m                                         │`);
    console.log(`│ \x1b[1m任务分支\x1b[0m : ai/${taskId.padEnd(49)} │`);
    console.log(`│ \x1b[1m状态\x1b[0m     : \x1b[32m极速校验已全部跑通。请切换分支 Review 并网！\x1b[0m          │`);
    console.log('└──────────────────────────────────────────────────────────────────┘\n');

  } catch (error: any) {
    stopDashboard();
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

if (import.meta.main) {
  main();
}
