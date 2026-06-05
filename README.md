# DeepSeek Code Agent 🚀

`deepseek-code` 是一个基于 **Tauri v2 + React 19 + TypeScript** 架构，以 **DeepSeek-V4** 为核心大模型驱动的现代化本地智能编程助手（Agent）与桌面端工作区。

它采用流行的 Web-Native 混合架构 (Desktop Harness)，能够智能理解项目结构，并提供流畅的对话、代码修改和架构图动态可视化等能力。

---

## 🌟 核心功能特性 (Features)

*   **⚡ 双端自适应桥接 (JS Bridge Harness)**：
    *   通过门面模式设计统一通信接口，自动检测运行环境。
    *   **桌面模式**：借助 Tauri v2 原生壳能力，通过 `tauri-plugin-sql` 访问本地 SQLite 数据库（`deepseek_code.db`）管理历史会话、配置参数。
    *   **Web 模式**：在普通浏览器中运行时，自动降级为 `localStorage` 模拟数据库，实现前端逻辑的零感 Mock，显著提高 UI 调试速度。
*   **🤖 强大的 DeepSeek-V4 双模引擎**：
    *   内置支持 `deepseek-v4-flash`（低延迟、快速响应）与 `deepseek-v4-pro`（高逻辑推理、深度复杂任务）双模型切换。
    *   提供可视化 Settings 面板，支持安全地保存和清除本地 API Key。
    *   **本地命令拦截与快捷交互 (Local Slash Commands)**：在输入框中拦截以 `/` 开头的快捷命令（如 `/help` 调出命令帮助、`/clear` 清空历史、`/settings` 打开面板、`/model <pro|flash>` 切换模型），直接在前端高效本地响应，不发送 API，不占用 Token。
    *   **完整工具链历史恢复 (Full Tool Call Tree Expansion)**：在多轮对话时，前端自动将保存的 `toolCalls` 数组还原为符合 API 规范的 `assistant` 角色 `tool_calls` 及对应的 `tool` 回复，确保模型在后续对话中具备无损的工具执行上下文记忆。
*   **📊 Mermaid.js 架构图自动渲染**：
    *   右侧 Overview 面板能够动态提取模型输出的 Markdown 文本，提取 ` ```mermaid ` 代码块并实时渲染为交互式的 SVG 流程图，辅助开发者快速掌握复杂系统设计。
*   **🎨 极简精致的桌面交互 (Premium UI)**：
    *   **沉浸式标题栏**：自定义单行 Titlebar 配合 macOS 交通灯按钮留白（展开/折叠安全间距），支持拖拽移动窗口。
    *   **双折叠侧边栏**：左侧管理项目树与历史会话，右侧呈现 Overview 文档预览，均具备平滑流畅的动画切换效果。
*   **🛠️ 交互式 Agent 工具箱 (Interactive Agent Tool Cabin)**：
    *   **动态计时与状态反馈**：工具执行期间展示动画 Spinner 以及基于纯 CSS 的实时计数器计时，并在执行结束后立即锁定结果状态（✓/✕）和最终用时。针对极速的本地文件级工具（如 FileRead、FileWrite 等），人为引入一小段 500ms 交互延迟，确保前端平滑过渡并清晰展示动画及计时。
    *   **可折叠工具组 (Tool Call Group)**：在单个 Assistant 回复中发生多个工具串联执行时，默认进行折叠隐藏，外部以概数显示（例如“运行了 3 条命令”、“修改了 2 个文件”），并支持一键展开查看单次卡片。
    *   **无抖动置顶置空 (Jitter-Free Sticky Prompt)**：置顶提示栏采用外层绝对定位（Absolute Overlay）浮动渲染，彻底规避了传统 CSS Sticky 属性在动态显示/隐藏时因高度变化而导致的文档流抖动问题。
    *   **超时与限制保护机制**：限制单轮最大任务交互最多 15 步（溢出时向前端推送温和告警文本）；并对 Bash 命令行执行工具强加 30 秒超时时间熔断限制，返回优雅的 JSON 错误提示防止线程阻塞锁挂。
    *   **环境上下文感知 (Workspace Context Aware)**：在后端 `lib.rs` 中自动检测当前 Git 分支、绝对路径及工作区目录列表大纲，并动态注入到 System Prompt 的 `<workspace_context>` 标签中，使 Agent 具备开箱即用的环境布局感知能力。

---

## 📜 开发者宪法 (Development Constitution)

⚠️ **所有项目贡献者在开发时必须严格遵循以下原则：**

1.  **测试驱动与验证**：每次功能调整或需求开发完成后，必须运行双端测试脚本 `bun run test`。该脚本会自动执行 Rust 编译检查与 React 前端测试，确保测试用例 100% 通过。
2.  **文档同频更新**：完成需求后，应及时同步补充并更新 [docs/route-map.md](./docs/route-map.md)，描述新增的架构路径与接口说明。
3.  **开发提速原则**：优先使用 `bun run dev` 在普通浏览器环境调试 UI 与 Mock 业务逻辑，避免因频繁构建 Tauri 原生包而降低效率。
4.  **自动提交规范**：在测试通过且文档更新完毕后，使用自动化工具或手动执行 `git commit` 及时保存阶段性开发成果。
5.  **语言统一**：开发设计方案（Implementation Plan）、代码注释以及应用内文字交互统一使用 **中文**。

---

## 📂 项目目录结构 (Directory Structure)

```bash
deepseek-code/
├── package.json             # 前端项目配置与测试/构建脚本
├── tsconfig.json            # TypeScript 配置
├── vite.config.ts           # Vite 构建与代理配置
├── src/                     # 前端 React 核心代码
│   ├── main.tsx             # 挂载入口
│   ├── App.tsx              # 主面板组件 (包含侧边栏、编辑器、聊天区与 Mermaid 渲染)
│   ├── App.css              # 主题与过渡动画样式
│   └── bridge/              # JS Bridge 环境网关 (实现桌面端 SQLite 与 Web 端 localStorage 的平滑切换)
├── src-tauri/               # 后端 Rust Tauri 壳代码
│   ├── Cargo.toml           # 后端 Rust 依赖配置
│   ├── tauri.conf.json      # Tauri 核心配置 (包含通用权限、窗口自定义、标识符等)
│   └── src/
│       ├── main.rs          # 启动入口
│       └── lib.rs           # 核心指令逻辑与数据库/插件注册
└── docs/                    # 项目设计与指南文档
    └── route-map.md         # 详细的组件说明与物理路径架构图
```

有关各模块接口和底层实现的详细映射说明，请阅读 [docs/route-map.md](./docs/route-map.md)。

---

## 🛠️ 环境准备与本地开发 (Getting Started)

开始开发前，请确保本地已配置以下环境：
*   **Bun** (建议最新版本，用于前端包管理和依赖运行)
*   **Rust / Cargo** (需 Rust 1.77+，用于编译 Tauri 后端)
*   **System Tools** (macOS 环境需安装 Xcode Command Line Tools)

### 1. 安装项目依赖
```bash
bun install
```

### 2. 启动 Web 模式调试 (推荐日常 UI 开发)
此模式在普通浏览器中启动，调用 mock 数据，无需启动 Rust 后端：
```bash
bun run dev
```

### 3. 启动桌面端开发服务
启动带有 Tauri 原生壳和 Rust 后端交互的开发窗口：
```bash
bun run tauri dev
```

### 4. 运行 Rust 校验与前端单元测试
```bash
bun run test
```

### 5. 构建发布版本
```bash
bun run tauri build
```
