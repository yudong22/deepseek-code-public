

# 📑 AI 原生研发流水线实施文档：第一阶段

## 一、 整体角色分工与生态位

在本地“无感并网”流中，三项 AI 技术与人类架构师各司其职，形成一个闭环的高效状态机：

| 组件 / 角色 | 生态位 | 核心职责 | 特性 |
| --- | --- | --- | --- |
| **OpenHands** | **外部总控编排器** | 负责监听任务、利用 Git Worktree 初始化/销毁影子沙箱、监控任务状态、下发指令、触发飞书通知。 | 无状态、强流程控制 |
| **Hermes Agent** | **沙箱内主力开发** | 负责理解跨端（Go/Flutter/Tauri）业务逻辑、根据历史记忆和图谱进行代码生成与联动修改。 | 有状态、项目级长记忆 |
| **OpenCode** | **CI自愈急救员** | 当极速验证流水线报出 Lint 冲突、缺少包引入、轻量语法错误时，接管沙箱进行“快修”。 | 无状态、高频极速响应 |
| **人类架构师** | **最终安全闸门** | 在本地通过 Cursor 对 AI 提交的本地分支进行增量 Review，一键并网。 | 100% 掌控力 |

---

## 二、 整体流水线运行架构图

```
                       [ 任务输入: 飞书机器人 / 统一 CLI ]
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OpenHands 外部总控编排器 (Host 进程)                     │
│  1. 解析任务 ──> 2. 执行 `git worktree add -b ai/task-* /tmp/ai-workers/*` │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      /tmp/ai-workers/ 隔离影子沙箱                          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     Hermes Agent 主力开发 (内核)                    │   │
│   │   - 载入长期记忆 (.hermes/memory) 并在沙箱内修改跨端代码                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼ (触发极速验证门禁)                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │         极速验证管道 (Go test / Flutter analyze / Cargo check)      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                   ┌──────────────────┴──────────────────┐                   │
│                   ▼ (编译报错/Lint不通过)                 ▼ (全量通过)          │
│   ┌─────────────────────────────────────┐   ┌─────────────────────────┐     │
│   │       OpenCode CI 自愈急救员         │   │   Git 本地原子 Commit    │     │
│   │   - 读日志，高频快修语法/格式错误    │   │   `git commit -am ...`  │     │
│   └─────────────────────────────────────┘   └─────────────────────────┘     │
│                      │                                   │                  │
│                      └─────── (修好后重新验证) ────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OpenHands 发送飞书通知 ──> 人类并网                     │
│  `git checkout ai/task-*` ──> Cursor 30秒视觉审计 ──> `git merge main`      │
└─────────────────────────────────────────────────────────────────────────────┘

```

---

## 三、 本地核心配置文件

### 1. 外层总控：`.agents/config.yaml`

此文件由宿主机上的 **OpenHands** 读取，用来驱动整体路由与 OpenCode 的自愈开关。

```yaml
version: "2026.1"
project_id: "cross-platform-mid-platform"

runtime:
  type: "ephemeral-worktree"      # 采用 Git Worktree 隔离机制
  sandbox_root: "/tmp/ai-workers"  # 沙箱物理根路径
  safe_mode: true                  # 拦截危险系统指令

# 核心多 Agent 路由规则
agent_routing:
  primary_developer: 
    provider: "hermes"
    model: "deepseek-v4-flash"     # 主力开发：带记忆，高上下文利用率
    memory_path: "./.hermes/memory"
  
  ci_healer:
    provider: "opencode"
    model: "deepseek-v4-flash"     # CI自愈：轻量、无状态、对报错日志极度敏感
    max_heal_attempts: 3           # 单个错误最多允许 OpenCode 连续修 3 次

# 降维极速验证门禁（秒级响应）
verification_pipeline:
  gateway:
    match: "gateway/**/*"
    cmd: "cd gateway && go fmt ./... && go vet ./... && go test ./..."
  flutter:
    match: "mobile/**/*"
    cmd: "cd mobile && flutter analyze"
  tauri:
    match: "desktop/**/*"
    cmd: "cd desktop && npm run check && cd src-tauri && cargo check"

```

### 2. 沙箱内法律：`.agents/agent.md`

此文件在沙箱初始化后，作为 System Prompt **直接喂给 Hermes 和 OpenCode**，约束其编码行为。

```markdown
# 🤖 AI 沙箱执行行为准则 (面向 Hermes 与 OpenCode)

## 1. 角色与边界
- **Hermes**：你是架构主笔。当收到跨端需求时，你必须同时检查 `gateway/`（Go）、`mobile/`（Flutter）和 `desktop/`（Tauri）。API 结构发生变更时，三端的序列化文件与 TS 类型定义必须联动修改。
- **OpenCode**：你是语法消防员。当 Hermes 修改完毕触发验证报错时，你将被唤醒。你只负责修复 Lint 错误、缺失的 import 引入、或者拼写导致的编译失败。禁止擅自改动核心业务逻辑。

## 2. 核心技术栈约束
- **Go**：统一使用标准错误处理，API 遵循 RESTful/SSE 规范。
- **Flutter**：状态管理统一使用 Provider/Riverpod，禁止在全局组件中随意注入无结构的 `setState`。
- **Tauri**：Rust 核心层（`src-tauri`）仅用于原生系统级能力的桥接，严禁在 Rust 层编写重度业务逻辑。

## 3. 退出条件
- 验证全量通过后，由当前处于激活状态的 Agent 执行 `git commit -am "ai(task-*): description"`，随后立刻退出。
- 若遭遇死循环（修改同一文件超过 3 次），退出码设为 1，交由外层 OpenHands 强制销毁沙箱。

```

---

## 四、 自动化执行脚本 (`scripts/ai-runner-v2.js`)

该脚本充当 **OpenHands 的手脚**，在本地宿主机上串联起 Git 状态机、Agent 调用与自愈循环。

```javascript
import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { callAgent } from './openhands-call.js';
import { fastValidate } from './fast-validate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const taskId = process.argv[2] || `task-${Date.now()}`;
const taskDesc = process.argv[3] || "修改常规类型错误";

const rootDir = path.resolve(__dirname, '..');
const sandboxRoot = "/tmp/ai-workers";
const sandboxDir = path.join(sandboxRoot, taskId);

// 辅助打印彩色日志
function log(msg) {
  console.log(`\x1b[36m🚀 [OpenHands orchestrator]\x1b[0m ${msg}`);
}

function logError(msg) {
  console.error(`\x1b[31m❌ [OpenHands orchestrator]\x1b[0m ${msg}`);
}

// 模拟飞书通知，输出精致的终端通知卡片
function sendFeishuNotificationMock(taskId, taskDesc, success, message = '', healCount = 0) {
  console.log('\n┌──────────────────────────────────────────────────────────────────┐');
  if (success) {
    console.log(`│ \x1b[32m🎉  [飞书通知] AI 任务流水线执行成功！\x1b[0m                                 │`);
    console.log(`│ \x1b[1m任务分支\x1b[0m : ai/${taskId.padEnd(49)} │`);
    console.log(`│ \x1b[1m任务描述\x1b[0m : ${taskDesc.padEnd(49)} │`);
    console.log(`│ \x1b[1m自愈次数\x1b[0m : ${String(healCount).padEnd(49)} │`);
    console.log(`│ \x1b[1m状态\x1b[0m     : \x1b[32m极速校验全量通过，已落库本地原子提交。请合并并网！\x1b[0m     │`);
  } else {
    console.log(`│ \x1b[31m❌  [飞书通知] AI 任务流水线执行失败！\x1b[0m                                 │`);
    console.log(`│ \x1b[1m任务分支\x1b[0m : ai/${taskId.padEnd(49)} │`);
    console.log(`│ \x1b[1m任务描述\x1b[0m : ${taskDesc.padEnd(49)} │`);
    const cleanMsg = message.replace(/\n/g, ' ').substring(0, 45);
    console.log(`│ \x1b[1m错误原因\x1b[0m : \x1b[31m${cleanMsg.padEnd(49)}\x1b[0m │`);
    console.log(`│ \x1b[1m状态\x1b[0m     : \x1b[31m已安全回滚，影子沙箱已强制销毁。请架构师介入。\x1b[0m       │`);
  }
  console.log('└──────────────────────────────────────────────────────────────────┘\n');
}

async function main() {
  try {
    log(`正在初始化影子沙箱工作区隔离...`);
    
    // 保证沙箱物理根目录存在
    if (!fs.existsSync(sandboxRoot)) {
      fs.mkdirSync(sandboxRoot, { recursive: true });
    }
    
    // 1. 利用 Git Worktree 创建影子物理沙箱并拉出新分支
    execSync(`git worktree add -b ai/${taskId} ${sandboxDir} main`);
    log(`影子沙箱物理路径已建立: ${sandboxDir}`);
    
    // 切换至沙箱路径
    process.chdir(sandboxDir);
    
    // 创建沙箱内部 .agents 配置目录以存放报错日志
    const sandboxAgentsDir = path.join(sandboxDir, '.agents');
    if (!fs.existsSync(sandboxAgentsDir)) {
      fs.mkdirSync(sandboxAgentsDir, { recursive: true });
    }
    
    // 2. 唤醒 Hermes 进行功能开发
    log(`唤醒主力 Agent (Hermes) 开始写代码...`);
    try {
      await callAgent({
        agent: 'hermes',
        promptVal: taskDesc,
        rulesPath: path.join(rootDir, '.agents/agent.md'),
        sandboxDir,
        rootDir
      });
    } catch (e) {
      throw new Error(`Hermes 运行期间发生错误: ${e.message}`);
    }
    
    // 3. 极速验证与 OpenCode CI 自愈循环
    let healCount = 0;
    const maxHeals = 3;
    let isPassed = false;
    
    while (!isPassed && healCount < maxHeals) {
      try {
        log(`触发本地极速验证门禁检查...`);
        await fastValidate({ rootDir, sandboxDir });
        isPassed = true;
      } catch (validationError) {
        healCount++;
        logError(`[验证失败] 检测到语法或编译报错！第 ${healCount} 次唤醒 OpenCode CI 自愈...`);
        
        // 捕获报错日志并写入沙箱
        const errorLog = validationError.message;
        const lastErrorLogPath = path.join(sandboxAgentsDir, 'last_error.log');
        fs.writeFileSync(lastErrorLogPath, errorLog);
        
        // 调用 OpenCode 进行自愈快修
        try {
          await callAgent({
            agent: 'opencode',
            rulesPath: path.join(rootDir, '.agents/agent.md'),
            fixTarget: lastErrorLogPath,
            sandboxDir,
            rootDir
          });
        } catch (e) {
          logError(`OpenCode 运行期间抛出致命异常: ${e.message}`);
        }
      }
    }
    
    if (!isPassed) {
      throw new Error(`OpenCode 自愈达到最大上限次数 (${maxHeals})，代码仍有编译/Lint错误，无法并网！`);
    }
    
    // 4. 收尾：执行原子 Commit
    log(`验证通过！正在生成本地原子提交...`);
    execSync(`git add . && git commit -m "ai(${taskId}): ${taskDesc} (自愈次数: ${healCount})"`);
    
    // 5. 善后处理：回到宿主目录，卸载 Worktree，保留分支供人工并网审计
    process.chdir(rootDir);
    log(`清理影子物理沙箱...`);
    execSync(`git worktree remove ${sandboxDir}`);
    
    // 发送成功飞书通知
    sendFeishuNotificationMock(taskId, taskDesc, true, '', healCount);
    
  } catch (error) {
    logError(`流水线崩溃，正在执行安全回滚...`);
    logError(`错误详情: ${error.message}`);
    
    // 安全返回主目录并进行强力清理
    process.chdir(rootDir);
    
    try {
      if (fs.existsSync(sandboxDir)) {
        execSync(`git worktree remove ${sandboxDir} --force`);
      }
      // 强行删除临时开发分支
      execSync(`git branch -D ai/${taskId}`);
    } catch (e) {
      logError(`清理资源期间发生异常: ${e.message}`);
    }
    
    // 发送失败通知
    sendFeishuNotificationMock(taskId, taskDesc, false, error.message);
    process.exit(1);
  }
}

main();

```

---

## 五、 架构师无感并网高级作业 SOP

当飞书收到 `✅ AI 任务 【ai/task-101】修复成功` 的通知后：

1. **拉取/切换分支**：
```bash
git checkout ai/task-101

```


2. **在 Cursor 中进行 30 秒增量视觉审计**：
按 `Ctrl + K` 或打开 Git 模块面板。你将看到：
* Hermes 做出的跨端核心业务修改（例如：Go 加了字段，Flutter/Tauri 补了类型）。
* OpenCode 留下的尾随修改（例如：自动补齐的 `import`，自动对齐的缩进）。


3. **架构师一键并网与记忆同步**：
```bash
git checkout main && git merge ai/task-101 && git push origin main
# 将成功经验并入 Hermes 长期记忆库，确保越用越强
hermes-cli memory sync --commit HEAD
git branch -D ai/task-101

```



这套生产级别的整体文档，通过 **OpenHands 控场、Hermes 冲锋、OpenCode 擦屁股**，将并发安全性、性能消耗与代码健壮性结合得极好。你可以直接用它去给团队开会立项了！