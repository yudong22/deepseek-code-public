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
│   ├── SettingsModal.tsx    # 设置弹窗（API Key 管理、历史清空、工作区目录原生浏览选择、检查更新面板与日志）
│   ├── TitleBar.tsx         # 自定义单行标题栏（交通灯间距、面包屑、Tab 标签、操作按钮）
│   ├── LeftSidebar.tsx      # 左侧折叠边栏（新建对话、导航、Projects 项目文件夹分组树形列表、会话列表、设置入口）
│   ├── RightPanel.tsx       # 右侧折叠面板（Overview Markdown 预览、工具结果展示）
│   ├── ChatFeed.tsx         # 对话消息流（包含外层绝对定位防抖动 `.sticky-user-bar` 和内层滚动消息列表）
│   ├── ChatInput.tsx        # 对话输入区（模型选择、文本输入，并在前端拦截 `/clear`、`/help` 等本地指令并执行相应处理）
│   ├── EmptyState.tsx       # 新建对话空状态页面（居中提示框、模型选择）
│   └── ToolCallCard.tsx     # 单个/组合工具调用卡片与执行组组件（ToolCallGroup，支持动态计时、状态变色及折叠概数统计）
├── utils/                   # 工具函数目录
│   └── markdown.tsx         # 自定义 Markdown 渲染器（标题、列表、代码块、Mermaid 嵌入、行内格式）
├── bridge/                  # 统一的 JS Bridge 门面层（封装底层壳交互，支持多端适配）
│   ├── index.ts             # 桥接层入口（环境检测与分发）
│   ├── types.ts             # 桥接层 TypeScript 接口与类型定义（包含 selectDirectory、checkForUpdates 声明）
│   ├── tauri.ts             # 原生 Tauri 壳能力实现
│   └── mock.ts              # 浏览器环境 Mock/降级实现（模拟 Agent 事件流、工作区目录录入及更新返回）
└── vite-env.d.ts            # Vite 环境变量类型声明
```

#### 关键路径与通信：

### 后端目录 (Backend: `src-tauri/`)
```bash
src-tauri/
├── Cargo.toml               # Rust 依赖与包管理配置文件（集成了 ds-api, tokio, regex, ignore, globset 等库）
├── tauri.conf.json          # Tauri 核心配置文件（窗口、权限、构建指令等）
├── capabilities/            # 权限与功能配置文件（Tauri v2 新增）
│   └── default.json         # 默认允许的应用权限与功能配置
├── src/
│   ├── main.rs              # 应用程序启动入口，调用 lib.rs 中的 run 函数
│   ├── lib.rs               # 后端核心业务逻辑，注册并实现了 run_agent_loop 以及 select_directory Tauri 指令（前者启动外部 sidecar，后者用于跨平台调用文件夹选择器）
│   ├── safety.rs            # [NEW] 安全拦截器，提供工作区路径防越界（Path Jail）校验
│   └── tools/               # [NEW] 核心本地 Agent 工具集目录
│       ├── mod.rs           # 统一特质声明 (AgentTool) 与子模块导出
│       ├── file_read.rs     # 读文件工具，支持指定行范围与分页格式化
│       ├── file_write.rs    # 新建文件工具，防覆盖保护
│       ├── file_edit.rs     # 精准单次匹配替换工具
│       ├── grep.rs          # 正则全文搜索工具（遵循 .gitignore）
│       ├── glob.rs          # 文件模式搜索工具（遵循 .gitignore）
│       └── bash.rs          # 异步 Bash 命令运行工具，内置 30 秒超时熔断保护机制
└── icons/                   # 应用程序图标（支持多平台格式）
```

---

### Packages 目录 (`packages/`)
```bash
packages/
├── client-cli/               # CLI 命令行工具 (@openhands/cli)
│   ├── src/
│   │   ├── cli.ts            # 主入口：login / doctor / run / memory sync
│   │   │                    - run: 创建 git worktree → Hermes 开发 → fastValidate → OpenCode 自愈(×3) → commit
│   │   │                    - v0.3.3+: 离线模式（无网关时直连 DeepSeek API），自动 memory sync 到网关
│   │   ├── openhands-call.js # Agent 调度器：callAgent({agent, env}) 支持 env 参数避免全局污染
│   │   │                    - hermes: spawn hermes chat -q ... --yolo
│   │   │                    - opencode: spawn bun run sidecar，v0.3.3+: 超时(SIDECAR_TIMEOUT_MS)
│   │   │                    、JSON stdin 传递 AGENTS.md 作为 system message
│   │   ├── fast-validate.js  # 极速门禁验证（读取 config.yaml 匹配 glob → 执行命令）
│   │   ├── yaml-parser.js    # 简易 YAML 解析器
│   │   └── openhands.test.ts # CLI 单测 (11 tests)
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
