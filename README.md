# DeepSeek Code 🚀

> **让 AI 从「聊天」走向「动手」** —— 一个本地优先、自愈自适应的 AI 编程助手。

DeepSeek Code 是一个**面向 AI 原生研发的桌面 + CLI 双模系统**。它不只是聊天框 —— 它拥有自己的 agent 循环、工具执行引擎、向量经验记忆和自愈流水线，能在隔离沙箱中自主完成代码修改、编译验证、错误修复的全链路闭环。

---

## 🌌 愿景

我们相信下一代编程工具不是「对话界面 + 代码补全」的简单叠加，而是一个**能与开发者并肩工作的 AI 协作者**：

- **从对话到行动** —— Agent 不只是回答问题，它能读写文件、执行命令、搜索代码、自主决策
- **从单次到持续** —— 每次修复的经验被持久化为向量记忆，下次遇到相似问题时自动唤醒
- **从辅助到协作** —— Planner / Coder / Reviewer 多 agent 协作，像一支小型开发团队
- **从桌面到全场景** —— 精致的 macOS 桌面端用于交互，强大的 CLI 用于自动化流水线
- **从闭源到开放** —— 完全本地运行，支持任意 OpenAI-compatible 模型，数据不出域
- **从单引擎到多引擎** —— Rust coding 引擎改写自 opencode core，以此为基线持续补齐相对 Claude Code 的 coding 短板。同时支持 Claude Code / Cursor CLI / Codex 等二进制接入，便于横向比较和衡量 coding 效果
- **从单一协议到多协议** —— 支持 OpenCodeGo / 腾讯 / 阿里 / 字节的 coding plan 接入，厚适配层自动转发

**三条演进主线**：
- **Coding 能力不断完善** —— 以 opencode core 为基线，补齐工具集、安全护栏、上下文管理、多模态，持续逼近并超越 Claude Code 的 coding 能力
- **长期记忆与自我演进平台建设** —— 从向量检索升级为多维记忆网络，经验自动沉淀、跨项目迁移、自我评估回放，让 agent 越用越聪明
- **治理与可信** —— 补齐企业级落地的可信维度：人机协作边界、可观测性、隐私合规、安全防护、成本控制，让 DeepSeek Code 从「能用的工具」走向「可信的工具」

**最终目标**：让 DeepSeek Code 成为开发者的「第二大脑」—— 理解你的代码库、记住你的偏好、在你睡觉时继续修复 bug。

---

## 🧠 技术架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       桌面端 (Tauri v2 + React 19)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ ChatFeed │  │ ToolCall │  │ Mermaid  │  │  Todo    │  │ Settings │  │
│  │  消息流   │  │  工具卡   │  │  图表渲染  │  │  任务列表  │  │   设置   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│                                    │                                    │
│                     ┌──────────────────────────────┐                    │
│                     │   Bridge 抽象层 (IBridge)     │                    │
│                     │   Tauri 实现  ←→  Mock 实现  │                    │
│                     └──────────┬───────────────────┘                    │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │ Tauri Channel (流式事件)
┌────────────────────────────────┼────────────────────────────────────────┐
│          Rust 原生 Agent 引擎 (sidecar-agent crate)                     │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐   │
│  │  Provider    │  │    Agent     │  │         Tool Registry        │   │
│  │  LLM SSE 流  │─→│  主循环      │─→│  ┌────┐ ┌────┐ ┌────┐ ┌───┐ │   │
│  │  (OpenAI 兼容)│  │  max 25 步   │  │  │Bash│ │Read│ │Grep│ │...│ │   │
│  │  DeepSeek /  │  │  自动续写     │  │  └────┘ └────┘ └────┘ └───┘ │   │
│  │  Claude / …  │  │  只读工具并行  │  │  读工具并行 · 写工具串行      │   │
│  └──────────────┘  └──────┬───────┘  └──────────────────────────────┘   │
│                            │                                            │
│                     ┌──────▼───────┐                                    │
│                     │   Session    │  SQLite 持久化会话 & 消息           │
│                     └──────────────┘                                    │
└──────────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────┐
│          Go API 网关 (Gateway)  │                                        │
│  ┌──────────┐  ┌──────────┐  ┌─▼────────┐  ┌──────────────────────┐    │
│  │ JWT Auth │  │ LLM Proxy│  │  Qdrant  │  │  记忆检索 / 同步     │    │
│  │ OAuth2   │  │ SSE 流   │  │  向量库   │  │  top-3 经验注入      │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────┐
│          CLI 工具               │                                        │
│                                                                         │
│  openhands run "修复类型错误"                                            │
│       │                                                                 │
│       ▼                                                                 │
│  ┌──────────────────────────────────────────────────────┐               │
│  │  自愈流水线 (Self-Healing Pipeline)                    │               │
│  │  1. Git Worktree 隔离沙箱                              │               │
│  │  2. 向量记忆检索 → Agent 执行                           │               │
│  │  3. 极速验证 (fastValidate)                            │               │
│  │  4. 失败 → 自愈循环 (max 3 次)                          │               │
│  │  5. 成功 → 本地提交 + 记忆同步到网关                     │               │
│  │  6. 失败 → 安全回滚                                    │               │
│  └──────────────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────────────┘
```

### 核心设计决策

| 层次 | 技术选型 | 为什么 |
|---|---|---|
| **桌面端** | Tauri v2 + React 19 | 原生性能 + Web 生态，macOS 原生标题栏 + 自定义 UI |
| **Agent 引擎** | Rust 原生 crate (`sidecar-agent`) | 零子进程开销，~0ms 启动，进程内流式事件 |
| **工具执行** | 读/写分区调度 | 只读工具 (grep/glob/read) 并行执行，写入工具串行，最大化吞吐 |
| **LLM 接入** | OpenAI-compatible 多供应商 | 支持 DeepSeek / Claude / OpenAI / Ollama 等任意兼容模型 |
| **记忆系统** | Qdrant 向量库 + 本地 JSON 降级 | 在线时语义检索，离线时关键词 Jaccard 匹配，永不中断 |
| **安全网关** | Go + JWT + SSE 代理 | 企业级 API Key 保护，审计日志就绪 |
| **自愈流水线** | Git Worktree 隔离 | 原子沙箱，失败不回污染主分支 |

---

## ✨ 核心特性

### 🔄 自愈流水线 (Self-Healing Pipeline)
CLI 在隔离的 Git Worktree 沙箱中执行任务，自动捕捉编译/测试错误，结合历史经验生成修复方案，最多自愈 3 次。成功则提交，失败则安全回滚。

### 🧠 向量经验记忆库 (Long-term Vector Memory)
每次成功的代码修改和修复日志被 Embedding 后存入 Qdrant 向量库。未来遇到相似问题时，自动检索最匹配的 3 条经验作为上下文注入 Agent。

### 🛡️ Go 统一安全网关 (Go Gateway)
企业级 API 网关，OAuth2 客户端凭证认证 + 短期 JWT，LLM 接口安全代理与 SSE 流式转发，保护 API Key 不泄露。

### 🖥️ 桌面端与 CLI 双模生态
- **Tauri 桌面端**：macOS 原生体验，Mermaid 图表渲染、工具调用卡片、会话管理
- **CLI 工具** (`openhands`)：`login` / `doctor` / `plan` / `run` / `memory sync` 全链路命令行操作

### ⚡ Rust 原生 Agent 引擎 (v0.5.0+)
桌面端 agent 循环从 75MB Bun 子进程重写为进程内 Rust library crate，启动延迟从 ~200ms 降至 ~0ms，二进制体积大幅缩减。

### 🛠️ 10 大内置工具
| 工具 | 类型 | 说明 |
|---|---|---|
| `Bash` | 写入 | Shell 命令执行（超时、危险命令确认） |
| `FileRead` | 只读 | 文件读取（路径遍历保护） |
| `FileWrite` | 写入 | 文件写入（原子写） |
| `FileEdit` | 写入 | 搜索替换（生成 diff） |
| `Grep` | 只读 | 正则搜索（支持上下文行数） |
| `Glob` | 只读 | 文件模式匹配（ignore crate） |
| `Question` | 串行 | 交互式 Q&A |
| `TodoWrite` | 写入 | 任务列表管理 + TodoUpdated 事件 |
| `WebFetch` | 只读 | HTTP(S) 抓取（SSRF 防护、HTML→Markdown） |
| `WebSearch` | 只读 | 搜索引擎查询（DuckDuckGo） |

---

## 📦 模块结构

```
deepseek-code-public/
├── apps/desktop/              # Tauri v2 + React 19 桌面客户端
│   ├── src/                   # 前端 (React + TypeScript + Vite)
│   │   ├── bridge/            # IBridge 抽象层 (Tauri / Mock 双实现)
│   │   ├── components/        # UI 组件 (ChatFeed, ToolCallCard, Mermaid...)
│   │   └── utils/             # Markdown 渲染器等工具
│   └── src-tauri/             # Rust 后端
│       ├── src/lib.rs         # Tauri 命令入口
│       └── crates/sidecar-agent/  # Rust 原生 Agent 引擎
│           ├── agent.rs       # 主代理循环
│           ├── provider.rs    # LLM SSE 流
│           ├── protocol.rs    # 17 种 AgentEvent
│           ├── session.rs     # SQLite 会话
│           └── tools/         # 10 个内置工具
├── packages/
│   ├── gateway/               # Go API 网关 (JWT + LLM Proxy + Qdrant)
│   ├── client-cli/            # CLI 工具 (openhands)
│   └── sidecar/               # CLI 侧车 (Bun 运行时)
├── .agents/                   # Agent 路由 & 验证流水线配置
├── docs/                      # 设计文档
└── docker-compose.yml         # 网关 + Qdrant 编排
```

---

## 🚀 快速开始

### 前置要求
- **Bun** (包管理器 + 运行时)
- **Go 1.22+** (网关)
- **Rust 1.77+** (桌面端编译，可选)

### 安装 & 启动

```bash
# 安装依赖
bun install

# 启动桌面端 (浏览器模式，快速迭代 UI)
bun run dev:desktop

# 启动桌面端 (Tauri 原生模式)
bun run preview

# 启动 Go 网关
cd packages/gateway && go run main.go

# CLI 登录 & 运行
bun openhands login --server http://localhost:8080 --id openhands --secret secret123
bun openhands run "修复类型错误"
```

### 运行测试

```bash
bun run test    # 306 测试 (99 Rust + 207 TypeScript)
```

---

## 🗺️ 路线图

三条主线：**Coding 能力不断完善** / **长期记忆与自我演进平台建设** / **治理与可信**

> **版本规则**：x.0 / x.y.0 = 功能演进（minor/major bump），x.x.1 / x.x.2 = bug 修复和查缺补漏（patch bump）。

| 主线 | 版本 | 主题 |
|---|---|---|
| **v0.6.0** Coding + 治理同步 | | |
| Coding 能力 | v0.6.0 | 工具集对齐：TodoWrite / WebFetch / WebSearch / SubAgent |
| Coding 能力 | v0.6.0 | Tool 工具调用基建升级（流式、超时、原子写） |
| Coding 能力 | v0.6.0 | Bash 安全护栏（超时、危险命令确认、沙箱） |
| 治理与可信 | v0.6.0 | Prompt injection 防护（WebFetch 强依赖） |
| 治理与可信 | v0.6.0 | 人机协作边界（plan-then-confirm + diff review） |
| **v0.6.1 / v0.6.2** | | |
| Coding 能力 | v0.6.1 | 自愈流水线端到端集成测试 |
| Coding 能力 | v0.6.2 | fastValidate fail-fast、callAgent 失败推进预算、--task-id 校验 |
| **v0.7.0** 记忆 + 可观测 + 成本 | | |
| Coding 能力 | v0.7.0 | 上下文压缩 / 消息总结 |
| 记忆与平台 | v0.7.0 | 记忆生命周期治理（TTL、隐私过滤、用户遗忘权） |
| 记忆与平台 | v0.7.0 | Rust sidecar-agent 复用至 CLI（合并双引擎） |
| 治理与可信 | v0.7.0 | Agent 可观测性（OTel trace + replay） |
| 治理与可信 | v0.7.0 | 成本预算（token/USD 上限 + 模型路由） |
| **v0.8.0** 输出侧安全 + 多模态 | | |
| Coding 能力 | v0.8.0 | 多模态（图像输入） |
| 治理与可信 | v0.8.0 | 代码安全扫描集成（gitleaks / semgrep / cargo audit） |
| **v0.9.0** 多引擎 + IDE 化 | | |
| Coding 能力 | v0.9.0 | 多引擎横向比较：Claude Code / Cursor CLI / Codex 等二进制接入 |
| Coding 能力 | v0.9.0 | 全场景 IDE 化：多语言 LSP 接入 |
| **v1.0.0** 团队版 / 企业可用 | | |
| Coding 能力 | v1.0.0 | Multi-agent 协作（planner / coder / reviewer） |
| Coding 能力 | v1.0.0 | 多模型协议兼容：OpenCodeGo / 腾讯 / 阿里 / 字节 coding plan |
| 记忆与平台 | v1.0.0 | 自我评估与回放、记忆网络多维化 |
| 记忆与平台 | v1.0.0 | 团队版网关（RBAC、审计日志、配额管理） |

完整路线图见 [ROADMAP.md](./ROADMAP.md)。

---

## 📄 开源 & 贡献

MIT License。欢迎贡献代码、提交 Issue、分享自愈规则。

> **DeepSeek Code** —— 让 AI 真正动手写代码。
