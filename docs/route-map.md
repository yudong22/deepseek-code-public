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
├── App.tsx                  # 核心 React 根组件（主界面逻辑与视图）
├── App.css                  # 全局或 App 组件样式
├── assets/                  # 静态资源（图片、字体等）
└── vite-env.d.ts            # Vite 环境变量类型声明
```

#### 关键路径与通信：
- **通信桥梁**：前端通过 `@tauri-apps/api/core` 中的 `invoke` 方法与 Rust 后端进行异步调用。例如，`invoke("greet", { name })` 会触发后端的 `greet` 命令。

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
1. **进行测试**：确保在桌面环境下（或前端单独环境下）程序运行无误，前后端交互正常。
2. **补充本文档**：若新增了关键组件、新页面（路由）、新的 Rust Command API，需在此文档中补充对应路径的职责说明，以保证文档与代码同步。
