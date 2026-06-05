# Code Structure & Route Map (代码结构与路径说明)

本文档旨在梳理 `deepseek-code` 项目的整体代码目录结构与核心路由/文件映射关系。在开发完新需求后，必须根据实际改动**测试并更新**此文档。

---

## 1. 整体架构 (Overall Architecture)
本项目采用 **Tauri v2 + React + Vite + TypeScript** 架构：
- **前端 (Frontend)**：位于根目录的 `src` 文件夹中，使用 React (TSX) 构建用户界面，通过 Vite 进行开发构建。
- **后端 (Backend / Desktop Shell)**：位于 `src-tauri` 文件夹中，使用 Rust 编写，负责原生系统交互、API 桥接和桌面窗口管理。

---

## 2. 目录结构详解 (Directory Breakdown)

### 根目录 (Root Directory)
```bash
deepseek-code/
├── bun.lock                 # Bun 依赖锁文件
├── package.json             # 前端依赖及脚本配置文件
├── tsconfig.json            # TypeScript 配置
├── vite.config.ts           # Vite 构建与开发服务配置
├── index.html               # 单页应用入口 HTML
├── public/                  # 静态公共资源目录
├── docs/                    # 项目设计与维护文档目录
│   └── route-map.md         # [当前文件] 代码结构与路径说明文档
├── src/                     # 前端 React 源码目录
├── src-tauri/               # 后端 Rust 源码与 Tauri 配置目录
└── backend/                 # 沙箱运行环境与临时目录
    └── sandbox_workspace/   # 默认沙箱生成和解析临时文件的保存位置
```

---

### 前端目录 (Frontend: `src/`)
```bash
src/
├── main.tsx                 # 前端入口文件，挂载 React 根节点
├── App.tsx                  # 根组件与主面板：路由定义、全局状态管理、Agent 流式对话业务逻辑
├── App.css                  # 全局样式（标题栏、侧边栏、聊天气泡、工具调用卡片、Toast 等）
├── assets/                  # 静态资源（图片、字体等）
├── components/              # 可复用 UI 组件目录
│   ├── Mermaid.tsx          # Mermaid 图表异步渲染组件
│   ├── Icons.tsx            # 内联 SVG 图标组件集合（20+ 图标）
│   ├── Toast.tsx            # 全局 Toast 消息提示组件
│   ├── SettingsModal.tsx    # 设置弹窗（API Key 管理、历史清空）
│   ├── TitleBar.tsx         # 自定义单行标题栏（交通灯间距、面包屑、Tab 标签、操作按钮）
│   ├── LeftSidebar.tsx      # 左侧折叠边栏（新建对话、导航、会话列表、设置入口）
│   ├── RightPanel.tsx       # 右侧折叠面板（Overview Markdown 预览、工具结果展示）
│   ├── ChatFeed.tsx         # 对话消息流（包含外层绝对定位防抖动 `.sticky-user-bar` 和内层滚动消息列表）
│   ├── ChatInput.tsx        # 对话输入区（模型选择、文本输入，并在前端拦截 `/clear`、`/help` 等本地指令并执行相应处理）
│   ├── EmptyState.tsx       # 新建对话空状态页面（居中提示框、模型选择）
│   └── ToolCallCard.tsx     # 单个/组合工具调用卡片与执行组组件（ToolCallGroup，支持动态计时、状态变色及折叠概数统计）
├── utils/                   # 工具函数目录
│   └── markdown.tsx         # 自定义 Markdown 渲染器（标题、列表、代码块、Mermaid 嵌入、行内格式）
├── bridge/                  # 统一的 JS Bridge 门面层（封装底层壳交互，支持多端适配）
│   ├── index.ts             # 桥接层入口（环境检测与分发）
│   ├── types.ts             # 桥接层 TypeScript 接口与类型定义（如 runAgent、AgentEvent 等）
│   ├── tauri.ts             # 原生 Tauri 壳能力实现（对接 SQLite，实现具备大小写不敏感兼容/回退机制的列数据加载）
│   └── mock.ts              # 浏览器环境 Mock/降级实现（模拟 Agent 事件流）
└── vite-env.d.ts            # Vite 环境变量类型声明
```

#### 关键路径与通信：
- **通信桥梁**：前端组件统一导入并调用 `@/bridge`（例如 `bridge.greet(name)` 或数据库接口 `bridge.initDb()`）进行交互，不再直接依赖 `@tauri-apps/api`。内部会自动识别执行环境，若在 Tauri 内则调用 Rust 后端 Command 或使用 `tauri-plugin-sql` 访问本地 SQLite 数据库（`deepseek_code.db`）；若在标准浏览器内则自动使用 `localStorage` 作为模拟数据库进行数据存取，避免出现运行时未定义报错。针对 SQLite 列名序列化在部分环境下因大小写不一致的问题，在加载逻辑中提供了属性名智能容错回退解析；在请求发送阶段，前端通过 `expandHistoryMessages` 提取并重构了符合 API 规范的 `tool_calls` 及对应的 `tool` 回复上下文，实现完整的 Agent 执行记忆继承。
- **动态 System Prompt 工作区感知**：当触发 Agent 运行时，Tauri 后端的 `lib.rs` 在运行 `run_agent_loop` 前会自动执行本地 Git 查询（分支名称）与工作区文件目录树扫描，生成大纲文本动态追加在 System Prompt 的 `<workspace_context>` 标签中，免去前端多次异步查询的开销，使 Agent 具备完整的物理环境感知。
- **无抖动置顶用户消息栏**：在 `ChatFeed` 消息流中，置顶消息条设计在独立的 `.chat-feed-container` 内部绝对悬浮（`position: absolute`）渲染，脱离了消息列表本身的滚动高度文档流，从根本上解决了频繁展示/隐藏置顶栏时的页面弹动抖动问题。
- **右侧 Overview 动态 Markdown 与 Mermaid 渲染**：`RightPanel` 组件在右侧折叠面板展开时，会动态提取当前会话历史中最新的助手 Markdown 文档，并通过 `mermaid` 模块自动在页面上将 ` ```mermaid ` 代码块编译渲染为交互式 SVG 架构流程图。

---

### 后端目录 (Backend: `src-tauri/`)
```bash
src-tauri/
├── Cargo.toml               # Rust 依赖与包管理配置文件（集成了 ds-api, tokio, regex, ignore, globset 等库）
├── tauri.conf.json          # Tauri 核心配置文件（窗口、权限、构建指令等）
├── capabilities/            # 权限与功能配置文件（Tauri v2 新增）
│   └── default.json         # 默认允许的应用权限与功能配置
├── src/
│   ├── main.rs              # 应用程序启动入口，调用 lib.rs 中的 run 函数
│   ├── lib.rs               # 后端核心业务逻辑，注册并实现了 run_agent_loop Tauri 指令（对非 Bash 的快速操作引入 500ms 交互延迟以平滑展示前端动画，及 max_steps 步数告警）
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

## 3. 开发规范与维护 (Development Guide)
每当您完成一个需求的开发：
1. **进行测试**：
   - **前端优先验证**：优先运行 `bun run dev` 启动前端服务器，直接在浏览器中进行逻辑 Mock 调试，从而跳过缓慢的原生桌面端打包构建过程。
   - **双端测试校验**：必须在开发完需求后运行 `bun run test`，该命令会自动串联执行 Rust 编译检测与 React 前端单元测试（`bun test`），确保所有测试通过。
2. **补充本文档**：若新增了关键组件、新页面（路由）、新的 Rust Command API，需在此文档中补充对应路径的职责说明，以保证文档与代码同步。
3. **自动 Git 提交**：测试通过且文档同步完成后，必须执行 Git 提交保存当前迭代版本。
