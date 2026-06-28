# Subagent（子代理）定义与调用流程

> Claude Code 通过 `Agent` 工具让模型可以创建独立的子代理来执行复杂任务。每个子代理都有自己的系统提示、工具集、权限模型，可以同步或异步运行。

---

## 一、功能体系

### 1.1 什么是 Subagent

Subagent（子代理）是一个独立的 Claude 实例，由主代理通过 `Agent` 工具创建。它与主代理共享同一个会话框架，但拥有独立的：

- **系统提示**（System Prompt）—— 决定子代理的角色和行为方式
- **工具集**（Tool Pool）—— 根据代理类型有不同的工具权限
- **消息上下文**（Message Context）—— 隔离的对话历史（fork 路径除外）
- **执行生命周期**—— 可以同步阻塞等待，也可以异步后台运行

### 1.2 三类子代理

| 类型 | 来源 | 系统提示来源 | 典型用例 |
|------|------|-------------|----------|
| **Built-in** | 代码硬编码 | `getSystemPrompt()` 动态生成 | general-purpose（通用代理）、Explore（搜索代理）、Plan（规划代理） |
| **Custom** | 用户 settings.json / 项目 `.claude/` | frontmatter 下方的 Markdown 正文 | 定制化代码审查、特定领域助手 |
| **Plugin** | 插件注册 | 插件提供的 prompt | 第三方集成代理 |

### 1.3 定义方式

**Built-in** 在 `src/tools/AgentTool/built-in/` 下定义为一个对象字面量：

```typescript
const MY_AGENT = {
  agentType: 'my-agent',           // 唯一标识，模型通过 subagent_type 引用
  whenToUse: 'Use this agent to...', // 给模型的说明文本
  tools: ['*'],                    // 允许的工具列表，['*'] 表示全部
  disallowedTools: [...],          // 拒绝的工具
  permissionMode: 'acceptEdits',   // 权限模式
  maxTurns: 200,                   // 最大推理轮数
  color: 'blue',                   // UI 显示颜色
  getSystemPrompt: ({ toolUseContext }) => `...`,  // 角色提示
  source: 'built-in',              // 来源标记
}
```

**Custom** 通过 Markdown 文件定义：

```markdown
---
name: code-reviewer
description: Review code changes for correctness bugs
tools: "[FileReadTool, GrepTool, GlobTool, BashTool]"
disallowedTools: "[FileWriteTool, FileEditTool]"
model: sonnet
maxTurns: 30
permissionMode: acceptEdits
---

You are a code reviewer. Focus on correctness, security, and edge cases.
```

### 1.4 代理定义的核心属性

- `agentType` — 唯一标识符，模型用 `subagent_type` 来引用
- `tools` / `disallowedTools` — 控制代理能做什么、不能做什么
- `permissionMode` — 权限策略：`acceptEdits`（默认放行）/ `bubble`（上浮到父级）/ `bypassPermissions`（全放行）/ `plan`（需规划批准）
- `maxTurns` — 代理外部循环最大轮数（防止无限循环）
- `model` — 模型覆盖（`'inherit'` = 继承父级模型）
- `background` — 是否强制后台运行
- `isolation` — 隔离模式（`worktree` = 独立 git 工作树）
- `memory` — 持久化记忆作用域
- `mcpServers` — 代理专属的 MCP 服务器配置
- `hooks` — 会话生命周期钩子

---

## 二、触发时机

### 2.1 用户触发链

```
用户提问 → 主代理推理 → 主代理决定需要子代理
                           ↓
                   模型调用 Agent 工具
                   { subagent_type, prompt, ... }
                           ↓
                   AgentTool.call() 执行
                           ↓
                   子代理创建并运行
```

### 2.2 触发条件矩阵

| 场景 | 触发条件 | subagent_type | 子代理行为 |
|------|---------|---------------|-----------|
| 委托复杂任务 | 模型判断当前任务需要独立代理 | `"code-reviewer"` | 新建上下文，专注执行 |
| 隐式 Fork | Fork 实验开启，不传 subagent_type | `undefined` | **继承**父级上下文（缓存共享） |
| 多代理协作 | 启用 Swarms，传 `team_name` + `name` | 可选 | 创建 team member |
| 后台调研 | `run_in_background: true` | 可选 | 异步执行，完成后通知 |
| 远程执行 | `isolation: "remote"` | 可选 | 在 CCR 远程环境中执行 |

### 2.3 代理选择逻辑

```
输入 subagent_type?
  ├── 有值 ──→ 从注册表中查找匹配的 AgentDefinition
  │              ├── 找到 → 使用该定义
  │              └── 未找到 → 抛错 "Agent type 'X' not found"
  │
  ├── 无值 + Fork 实验开启 ──→ 走 FORK_AGENT 路径
  │                              ├── 继承父级系统提示
  │                              ├── 共享 prompt cache
  │                              └── 强制异步执行
  │
  └── 无值 + Fork 实验关闭 ──→ 使用 GENERAL_PURPOSE_AGENT（通用代理默认值）
```

---

## 三、执行流程

### 3.1 全生命周期总览

```
┌─────────────────────────────────────────────────────────┐
│                  模型调用 Agent 工具                      │
│  { subagent_type: "explore", prompt: "搜索代码库..." }   │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│              AgentTool.call() 入口                       │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ 1. 解析参数   │→│ 2. 前置校验   │→│ 3. 构建系统提示 │  │
│  │ - 查找代理定义 │  │ - MCP 依赖   │  │ - 普通/继承    │  │
│  │ - 路由类型    │  │ - 权限检查   │  │ - 构建消息     │  │
│  └──────────────┘  │ - Fork 防护  │  └───────┬───────┘  │
│                     └──────────────┘          │          │
│                                                ▼          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ 4. 组装工具池 │←│ 5. 创建工作树 │←│ 4. 初始化 MCP  │  │
│  │ - 独立构建    │  │ (可选隔离)   │  │ (代理专属)    │  │
│  └──────┬───────┘  └──────────────┘  └───────────────┘  │
│         ▼                                                 │
│  ┌──────────────────┐                                     │
│  │ 6. 决定执行模式   │                                     │
│  └──────┬───┬───────┘                                     │
└─────────┼───┼─────────────────────────────────────────────┘
          │   │
    ┌─────┘   └─────┐
    ▼               ▼
┌─────────┐   ┌──────────────┐
│ 同步执行 │   │ 异步执行      │
│         │   │              │
│ runAgent│   │ registerAsync│
│ (直接)   │   │ AgentTask()  │
│         │   │              │
│ 阻塞等   │   │ 立即返回     │
│ 待完成   │   │ async_launch│
└────┬────┘   │ ed 结果      │
     │        └──────┬───────┘
     ▼               ▼
┌──────────────────────────────────────┐
│          runAgent() 核心循环          │
│                                      │
│  ┌──────────┐  ┌──────────┐  ┌────┐  │
│  │ 创建上下文 │→│ query()   │→│清理 │  │
│  │ - 隔离状态 │  │ API 调用  │  │释放│  │
│  │ - 工具过滤 │  │ 工具循环  │  │资源│  │
│  │ - Hook 注册│  │ 消息累积  │  └────┘  │
│  └──────────┘  └──────────┘           │
└──────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────┐
│              返回结果                    │
│                                         │
│  同步 → AssistantMessage 流（逐步渲染）  │
│  异步 → { status, agentId, outputFile } │
└─────────────────────────────────────────┘
```

### 3.2 runAgent() 核心循环展开

```
┌─────────────────────────────────────────────────────┐
│              runAgent() 执行过程                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ① 创建隔离上下文                                    │
│  ├─ createSubagentContext() 从父级创建子上下文         │
│  ├─ 子代理拥有独立的 abortController                  │
│  ├─ 独立的 readFileState（文件缓存）                   │
│  └─ agentGetAppState() 覆盖 permissionMode            │
│                                                      │
│  ② 初始化代理环境                                    │
│  ├─ 执行 SubagentStart 钩子 → 获取额外上下文           │
│  ├─ 注册 frontmatter 钩子（作用于代理生命周期）         │
│  ├─ 预加载 skills（from frontmatter）                 │
│  └─ 连接代理专属 MCP 服务器                           │
│                                                      │
│  ③ 进入 query() 循环（主推理循环）                     │
│  ├─ 发送初始消息 + 系统提示到 Claude API               │
│  ├─ 处理流式返回：text delta / tool_use               │
│  ├─ 执行工具调用 → 获取 tool_result                   │
│  ├─ 累积消息到 agentMessages                          │
│  ├─ 记录 sidechain transcript                        │
│  └─ 循环直到 stop_reason ≠ "tool_use"                 │
│                                                      │
│  ④ 清理                                              │
│  ├─ 关闭代理专属 MCP 连接                             │
│  ├─ 清除 session hooks                               │
│  ├─ 释放文件缓存                                     │
│  ├─ 杀死代理衍生的后台 shell 任务                      │
│  └─ 清理 todos 注册表                                 │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 3.3 同步执行中的动态后台化

同步代理在执行过程中可以被用户"后台化"：

```
同步执行开始
      │
      ▼
[每轮迭代]
      │
      ├──→ 正常：等待下一轮 assistant message
      │
      └──→ 收到后台化信号（用户手动或超时）
              │
              ▼
      Promise.race() 后台信号胜出
              │
              ▼
      停止当前迭代器 agentIterator.return()
              │
              ▼
      以异步模式重启 runAgent({ isAsync: true })
              │
              ▼
      后台执行 → <task-notification> 通知父级
```

这个设计让同步代理既保证任务连贯性，又不阻塞用户太久——2 分钟无响应自动转为后台，用户也可以随时用 UI 操作手动后台化。

### 3.4 Fork 子代理流程

```
父代理对话历史（含所有 tool_use 调用）
              │
              ▼
    模型调用 Agent 工具（无 subagent_type）
              │
              ▼
     buildForkedMessages(directive, assistantMessage)
              │
              ├── 1. 保留父级完整的 assistant 消息
              │      （所有 tool_use blocks + thinking + text）
              │
              ├── 2. 对每个 tool_use block 构建占位符 tool_result
              │      文本统一为 "Fork started — processing in background"
              │
              └── 3. 追加子代理专属指令
                     ┌──────────────────────────────┐
                     │ <fork_boilerplate>            │
                     │ STOP. 你是 fork worker...     │
                     │ </fork_boilerplate>           │
                     │                               │
                     │ Fork directive: 搜索测试文件   │
                     └──────────────────────────────┘

     最终发往 API 的消息结构：
     [...历史, assistant(父级所有 tool_use), user(placeholder_results, directive)]
       ↑                                    ↑                      ↑
       所有 fork 相同                         相同文本              每个 fork 不同
       （缓存命中）                          （缓存命中）           （缓存差异点）
```

---

## 四、异步结果通信

异步子代理完成后，通过 `<task-notification>` 机制通知父级：

```
异步代理完成
      │
      ▼
classifyHandoffIfNeeded() ← 分类：是否需要进一步处理
      │
      ▼
finalizeAgentTool() ← 最终化结果
      │
      ▼
enqueueAgentNotification() ← 入队通知（在 AppState 中注册）
      │
      ▼
父级收到用户角色消息
（自动插入到对话中，类似用户发了一条新消息）
      │
      ▼
父级继续执行（可以看到子代理的结果并进行下一步操作）
```

这种设计的关键在于：**通知以用户消息的形式插入**，父级代理在下一轮推理中"看到"结果，与普通用户交互无缝衔接。

---

## 五、设计优点

### 5.1 上下文隔离与共享的平衡

| 机制 | 优点 | 适用场景 |
|------|------|----------|
| **独立 Context** | 每个子代理有隔离的消息历史，不污染父级上下文 | 普通 subagent 调用 |
| **Fork 上下文继承** | 子代理可以访问父级的完整对话历史，无需重复说明背景 | 分支任务、嵌套调查 |
| **Sidechain Transcript** | 子代理的完整执行记录独立存储，可恢复、可查阅 | 异步代理 |

### 5.2 Prompt Cache 优化

**Fork 机制是核心优化**：多个 fork 子代理共享字节完全相同的 API 请求前缀，差异只有最后一个用户消息中的 directive 文本。这意味着：
- N 个并行 fork → 第 1 个产生缓存，其余 N-1 个 **零延迟命中缓存**
- 避免为每个子代理重复构建系统提示 → 显著降低 token 消耗和延迟
- `useExactTools: true` 保证工具定义序列化与父级完全一致

### 5.3 灵活的执行模式

```
同步 ──── 阻塞直到完成 → 结果直接可用
  │
  ├── 可中途后台化（2 分钟超时或用户手动）
  └── 适合需要结果才能继续的场景

异步 ──→ 立即返回 agentId → <task-notification> 通知
           │
           ├── 适合独立任务（调研、并行搜索）
           ├── 不阻塞主代理工作
           └── 可通过 SendMessage 与异步代理通信
```

两种模式共享同一套 `runAgent()` 核心，切换成本极低。

### 5.4 工具隔离的三层防护

| 层级 | 机制 | 作用 |
|------|------|------|
| 1. 代理定义级 | `tools` / `disallowedTools` / `permissionMode` | 定义代理的能力边界 |
| 2. 引擎级 | `ALL_AGENT_DISALLOWED_TOOLS` / `ASYNC_AGENT_ALLOWED_TOOLS` | 硬编码的安全底线 |
| 3. 运行时 | `filterDeniedAgents()` / `resolveAgentTools()` | 权限规则过滤 + 插件/策略叠加 |

这三层保证：即使代理定义说"我可以访问所有工具"，也突破不了引擎级的禁止列表。

### 5.5 权限冒泡

子代理的 `permissionMode: 'bubble'` 设计让权限提示可以上浮到父级终端，而非在子代理内部静默处理——这给了用户对敏感操作的实际控制权。

### 5.6 资源安全

- **自动 cleanup**：MCP 连接、session hooks、文件缓存、后台 shell 任务全都有 `finally` 清理
- **工作树隔离**：`worktree` 模式自动判断是否保留改动（无改动自动删除）
- **递归防护**：Fork 内部嵌套 Fork 被检测并阻止
- **后台超时**：2 分钟自动后台化防止同步代理阻塞主线程过久

### 5.7 Schema 运行时门控

工具输入 schema 通过 `lazySchema()` + `.omit()` 在运行时适应不同构建配置。模型看到的 schema 始终只包含它真正能用的字段——不存在的功能参数不会出现在工具定义中，从根本上消除了模型误用未开放功能的可能性。

---

## 六、关键模块文件

| 文件 | 职责 |
|------|------|
| `src/tools/AgentTool/AgentTool.tsx` | Agent 工具入口，参数解析、校验、路由、异步注册 |
| `src/tools/AgentTool/runAgent.ts` | 子代理执行核心，上下文创建、MCP 初始化、query 循环 |
| `src/tools/AgentTool/agentToolUtils.ts` | 工具过滤、进度追踪、异步生命周期管理、结果最终化 |
| `src/tools/AgentTool/forkSubagent.ts` | Fork 机制：消息构建、缓存共享、递归防护 |
| `src/tools/AgentTool/loadAgentsDir.ts` | AgentDefinition 类型定义 + 自定义代理加载 |
| `src/tools/AgentTool/builtInAgents.ts` | 内置代理注册决定 |
| `src/tools/AgentTool/prompt.ts` | 给模型的 Agent 工具使用说明 |
| `src/tools/AgentTool/built-in/` | 各内置代理的定义文件 |
| `src/tools/AgentTool/built-in/generalPurposeAgent.ts` | 通用代理定义 |
| `src/tools/AgentTool/constants.ts` | 工具名称常量 |
| `src/query.ts` | 核心推理循环 query() |
| `src/tasks/LocalAgentTask/LocalAgentTask.ts` | 后台任务的生命周期管理 |
| `src/tools/shared/spawnMultiAgent.ts` | 多代理创建 |

### 修改指引

- **新增一个内置代理**：在 `built-in/` 下创建定义文件 → 在 `builtInAgents.ts` 注册
- **新增一个自定义代理**：在 `.claude/agents/` 下创建 Markdown 文件
- **修改工具权限**：编辑 `agentToolUtils.ts` 中的 `filterToolsForAgent()` 或 `constants/tools.ts`
- **修改 schema（模型看到的参数）**：编辑 `AgentTool.tsx` 中的 `inputSchema`
- **修改系统提示**: 编辑代理的 `getSystemPrompt()` 方法
