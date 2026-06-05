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
└── src-tauri/               # 后端 Rust 源码与 Tauri 配置目录
```

---

### 前端目录 (Frontend: `src/`)
```bash
src/
├── main.tsx                 # 前端入口文件，挂载 React 根节点
├── App.tsx                  # 核心 React 根组件（集成了单行自定义标题栏、左右侧边栏折叠及 Mermaid Markdown 预览）
├── App.css                  # 自定义标题栏、折叠侧边栏过渡动画及 Mermaid 预览渲染样式
├── assets/                  # 静态资源（图片、字体等）
├── bridge/                  # 统一的 JS Bridge 门面层（封装底层壳交互，支持多端适配）
│   ├── index.ts             # 桥接层入口（环境检测与分发）
│   ├── types.ts             # 桥接层 TypeScript 接口定义
│   ├── tauri.ts             # 原生 Tauri 壳能力实现
│   └── mock.ts              # 浏览器环境 Mock/降级实现
└── vite-env.d.ts            # Vite 环境变量类型声明
```

#### 关键路径与通信：
- **通信桥梁**：前端组件统一导入并调用 `@/bridge`（例如 `bridge.greet(name)` 或数据库接口 `bridge.initDb()`）进行交互，不再直接依赖 `@tauri-apps/api`。内部会自动识别执行环境，若在 Tauri 内则调用 Rust 后端 Command 或使用 `tauri-plugin-sql` 访问本地 SQLite 数据库（`deepseek_code.db`）；若在标准浏览器内则自动使用 `localStorage` 作为模拟数据库进行数据存取，避免出现运行时未定义报错。
- **自定义单行标题栏与双折叠侧边栏**：实现了高度集成的单行自定义标题栏，左侧预留了 80px (折叠) / 260px (展开) 的 mac 交通灯控制键安全边距。支持左侧边栏、右侧侧边栏的独立折叠（具有平滑的 CSS 过渡动画）。
- **右侧 Overview 动态 Markdown 与 Mermaid 渲染**：右侧折叠面板展开时，会动态提取当前会话历史中最新的助手 Markdown 文档，并通过 `mermaid` 模块自动在页面上将 ` ```mermaid ` 代码块编译渲染为交互式 SVG 架构流程图。

---

### 后端目录 (Backend: `src-tauri/`)
```bash
src-tauri/
├── Cargo.toml               # Rust 依赖与包管理配置文件
├── tauri.conf.json          # Tauri 核心配置文件（窗口、权限、构建指令等）
├── capabilities/            # 权限与功能配置文件（Tauri v2 新增）
│   └── default.json         # 默认允许的应用权限与功能配置
├── src/
│   ├── main.rs              # 应用程序启动入口，调用 lib.rs 中的 run 函数
│   └── lib.rs               # 后端核心业务逻辑，定义 Tauri Builder、命令（commands）和插件初始化
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
