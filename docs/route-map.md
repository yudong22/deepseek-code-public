# Code Structure & Route Map (代码结构与路径说明)

本文档旨在梳理 `deepseek-code` 项目的整体代码目录结构与核心路由/文件映射关系。在开发完新需求后，必须根据实际改动**测试并更新**此文档。

---

## 1. 整体架构 (Overall Architecture)
本项目采用 **Tauri v2 + React + Vite + TypeScript** 架构：
- **前端 (Frontend)**：位于 `apps/desktop/src` 文件夹中，使用 React (TSX) 构建用户界面，通过 Vite 进行开发构建。
- **后端 (Backend / Desktop Shell)**：位于 `apps/desktop/src-tauri` 文件夹中，使用 Rust 编写，负责原生系统交互、API 桥接和桌面窗口管理。
- **Monorepo 管理**：通过 `packages/` 维护共享逻辑、Sidecar 执行引擎、CLI 工具以及 Gateway 网关服务。

---

## 2. 目录结构详解 (Directory Breakdown)

### 根目录 (Root Directory)
```bash
deepseek-code-monorepo/
├── bun.lock                 # Bun 依赖锁文件
├── package.json             # Monorepo 工作区根声明文件
├── docker-compose.yml       # C/S 容器编排 (Go Gateway + Qdrant DB)
├── docs/                    # 项目设计与维护文档目录
│   ├── preview.md           # AI 原生研发流水线实施文档
│   └── route-map.md         # [当前文件] 代码结构与路径说明文档
├── .agents/                 # AI 流水线配置目录 (config.yaml, agent.md)
├── backend/                 # 沙箱运行环境与临时目录
├── apps/
│   └── desktop/             # 原 Tauri 桌面端项目 (Tauri v2 + React 19)
└── packages/
    ├── gateway/             # Go Server 端网关服务 (JWT 鉴权、LLM 代理、Qdrant 向量记忆 + 本地 JSON 降级 db/memories.json)
    ├── client-cli/          # 客户端命令行工具 (@openhands/cli)：run（离线/在线模式）、login、doctor、memory sync（自动/手动）
    └── sidecar/             # 原 src-sidecar (编译为 opencode-sidecar 二进制)
```

---

### 前端与桌面端目录 (Apps: `apps/desktop/src/`)
```bash
apps/desktop/src/
├── main.tsx                 # 前端入口文件，挂载 React 根节点
├── App.tsx                  # 根组件与主面板：路由定义、全局状态管理、Agent 流式对话业务逻辑
├── App.css                  # 全局样式（标题栏、侧边栏、聊天气泡、工具调用卡片、Toast 等）
├── assets/                  # 静态资源（图片、字体等）
├── components/              # 可复用 UI 组件目录
│   ├── Mermaid.tsx          # Mermaid 图表异步渲染组件
│   ├── Icons.tsx            # 内联 SVG 图标组件集合（20+ 图标）
│   ├── Toast.tsx            # 全局 Toast 消息提示组件
│   ├── SettingsModal.tsx    # 设置弹窗（API Key 管理、历史清空、检查更新）
│   ├── ProjectSettingsModal.tsx # 项目设置弹窗（工作区目录、删除项目）
│   ├── TitleBar.tsx         # 自定义单行标题栏（面包屑、Tab 标签、日夜切换）
│   ├── LeftSidebar.tsx      # 左侧折叠边栏（新建对话、历史/任务导航、项目分组、会话列表、设置）
│   ├── RightPanel.tsx       # 右侧折叠面板（Overview Markdown 预览、工具结果展示）
│   ├── HistoryPage.tsx      # 全屏会话历史页（搜索、项目过滤、重命名、删除）
│   ├── TasksPage.tsx        # 定时任务管理页（创建、启用/禁用、删除定时任务）
│   ├── ConfirmDialog.tsx    # 通用确认弹框（危险操作确认）
│   ├── ChatFeed.tsx         # 对话消息流（含外层绝对定位防抖动和滚动消息列表）
│   ├── ChatInput.tsx        # 对话输入区（模型选择、文本输入、本地指令拦截）
│   ├── ChatInputCard.tsx    # 输入卡片容器
│   ├── ToolCallCard.tsx     # 工具调用卡片（动态计时、状态变色、折叠统计）
│   ├── FileToolCard.tsx     # 文件操作工具卡片（文件读/写/编辑展示）
│   ├── TodoListCard.tsx     # TodoWrite 工具任务列表卡片
│   ├── EditDiffCard.tsx     # 文件编辑 Diff 展示卡片
│   ├── ExpandableToolCard.tsx # 可展开工具调用卡片
│   ├── FileAutocomplete.tsx # 文件路径自动补全
│   ├── SlashAutocomplete.tsx # 斜杠命令自动补全
│   ├── QuestionCard.tsx     # Agent Q&A 交互卡片
│   └── toolUtils.ts         # 工具卡片工具函数
├── hooks/                    # React Hooks 目录
│   ├── useToast.ts           # Toast 通知状态管理
│   ├── useSettings.ts        # 设置持久化（API Key、工作区路径等）
│   ├── useProjects.ts        # 项目列表状态管理
│   ├── useRightPanelTabs.ts  # 右侧面板 Tab 状态管理
│   └── useKeyboardShortcuts.ts # 全局键盘快捷键
├── utils/                   # 工具函数目录
│   └── markdown.tsx         # 自定义 Markdown 渲染器（标题、列表、代码块、Mermaid 嵌入、行内格式）
├── bridge/                  # 统一的 JS Bridge 门面层（封装底层壳交互，支持多端适配）
│   ├── index.ts             # 桥接层入口（环境检测与分发）
│   ├── types.ts             # 桥接层 TypeScript 接口与类型定义（包含 AgentEvent、ScheduledTask、IBridge）
│   ├── tauri.ts             # 原生 Tauri 壳能力实现（SQLite 会话、Agent 流式、工作区文件、定时任务）
│   └── mock.ts              # 浏览器环境 Mock/降级实现（模拟 Agent 事件流、定时任务、工作区目录录入及更新返回）
└── vite-env.d.ts            # Vite 环境变量类型声明
```

#### 关键路径与通信：

### 后端目录 (Backend: `src-tauri/`)
```bash
apps/desktop/src-tauri/
├── Cargo.toml               # Tauri 应用主 crate 依赖
├── tauri.conf.json          # Tauri 核心配置文件（窗口、权限、构建指令等）
├── capabilities/
│   └── default.json         # 默认允许的应用权限与功能配置
├── src/
│   ├── main.rs              # 应用程序入口
│   ├── lib.rs               # Tauri commands: run_agent_loop, respond_to_agent, cancel_agent
│   │                        # AgentState (AtomicBool cancel + mpsc answer + watch cancel)
├── icons/                   # 应用程序图标
└── crates/
    └── sidecar-agent/       # [v0.5.0] Rust 原生代理引擎（替代 Bun sidecar）
        ├── Cargo.toml
        └── src/
            ├── lib.rs       # 模块声明
            ├── agent.rs     # 主代理循环：LLM SSE 流 → ToolCall → 工具执行 → 下一轮
            │                # v0.5.1: 只读工具并行执行（spawn_blocking + join_all）
            ├── protocol.rs  # AgentEvent (17 种)、parse_stdin_input、build_tool_success_result
            ├── provider.rs  # SSE 流解析、ChatCompletionRequest、多 provider 路由
            ├── session.rs   # SQLite 会话管理（.opencode/opencode.db）
            └── tools/
                ├── mod.rs   # Tool trait（含 is_read_only/cancel_flag）、ToolRegistry（Arc 共享）
                ├── bash.rs        # 写入 — 串行，含 timeout/cancel/env_clear
                ├── file_read.rs   # 只读 — 可并行
                ├── file_write.rs  # 写入 — 串行（原子写 tmp+rename）
                ├── file_edit.rs   # 写入 — 串行（replace_all 可选）
                ├── grep.rs        # 只读 — 可并行（支持 context、file_types 参数）
                ├── glob.rs        # 只读 — 可并行（ignore crate）
                ├── question.rs    # 交互式 Q&A — 串行
                ├── subagent.rs    # [v0.6.1] 子代理工具 — 内置 general-purpose/explore/code-reviewer + 自定义代理 (.claude/agents/*.md)
                ├── todowrite.rs   # 写入 — session todo 列表 + TodoUpdated 事件
                ├── webfetch.rs    # 只读 — HTTP(S) 拉取，SSRF 检查，html2md 转换
                └── websearch.rs   # 只读 — DuckDuckGo HTML 搜索 + 过滤
```

---

### Packages 目录 (`packages/`)
```bash
packages/
├── client-cli/               # CLI 命令行工具 (@openhands/cli)
│   ├── src/
│   │   ├── cli.ts            # 主入口：login / doctor / plan / run / memory sync
│   │   │                    - run（v0.4.0）: 创建 git worktree → OpenCode 开发 → fastValidate → OpenCode 自愈(×3) → commit
│   │   │                    - plan（v0.4.0 新增）: AI 分析需求生成技术方案，保存到 .plan.md
│   │   │                    - v0.3.3+: 离线模式（多供应商支持），自动 memory sync（本地 + 网关）
│   │   │                    - v0.4.0: 弃 Hermes 依赖，统一使用 OpenCode sidecar；多供应商配置；本地记忆库
│   │   │                    - v0.4.1: 模型名自动归一化，非标准模型警告；CLI 空闲检测 30s 警告
│   │   ├── openhands-call.js # Agent 调度器（v0.4.0 仅含 OpenCode sidecar 分支）
│   │   │                    - 纯 OpenCode: spawn bun run sidecar，v0.3.3+: 超时(SIDECAR_TIMEOUT_MS)
│   │   │                    、JSON stdin 传递 AGENTS.md 作为 system message、env 隔离
│   │   │                    - v0.4.0: mode='code'（开发）/ 'heal'（自愈）双模式
│   │   │                    - v0.4.1: 交互式 Q&A——不关闭 stdin，检测 question 工具时读取终端输入
│   │   ├── fast-validate.js  # 极速门禁验证（读取 config.yaml 匹配 glob → 执行命令）
│   │   ├── yaml-parser.js    # 简易 YAML 解析器
│   │   ├── openhands.test.ts # CLI 单测 (10 tests)
│   │   └── cli.test.ts       # CLI 单测 - v0.4.1 新增 (19 tests)
│   └── package.json
│
├── sidecar/                  # opencode-sidecar 二进制源码
│   ├── src/
│   │   ├── index.ts          # 入口：读 stdin → parseStdinInput（JSON/纯文本）→ Session.make → session.prompt → 流式 JSON 事件到 stdout
│   │   └── index.test.ts     # 单测 (12 tests)
│   └── package.json
│
└── gateway/                  # Go API 网关服务 (port 8080)
    ├── main.go               # POST /login（JWT 24h）、POST /v1/chat/completions（LLM 代理）
    │                          POST /api/memory/search（Qdrant→本地降级）、POST /api/memory/sync（Qdrant→本地降级）
    ├── go.mod / go.sum       # gin, jwt/v5, uuid
    ├── Dockerfile            # 多阶段构建
    └── db/                   # [v0.3.3+] 本地记忆存储目录
        └── memories.json     # Qdrant 离线时的本地存储文件（关键词检索降级）
```

---

## 3. 开发规范与维护 (Development Guide)
每当您完成一个需求的开发：
1. **进行测试**：
   - **前端优先验证**：优先运行 `bun run dev` 启动前端服务器，直接在浏览器中进行逻辑 Mock 调试，从而跳过缓慢的原生桌面端打包构建过程。
   - **双端测试校验**：必须在开发完需求后运行 `bun run test`，该命令会自动串联执行 Rust 编译检测与 React 前端单元测试（`bun test`），确保所有测试通过。
2. **补充本文档**：若新增了关键组件、新页面（路由）、新的 Rust Command API，需在此文档中补充对应路径的职责说明，以保证文档与代码同步。
3. **自动 Git 提交**：测试通过且文档同步完成后，必须执行 Git 提交保存当前迭代版本。
