# deepseek-code

一个基于 **Tauri v2 + React + TypeScript** 的现代桌面端应用程序。

---

## 📜 开发宪法 (Development Constitution)

⚠️ **所有开发者必须严格遵守以下规范：**

1. **功能与单元测试**：每次开发完需求/修改代码后，必须执行完整的功能测试与单元测试（运行 `bun run test`），确保前后端无异常且测试全部通过。
2. **文档同步**：完成需求开发后，必须及时补充和更新 [docs/route-map.md](file:///Users/yudong22/Documents/deepseek-code/docs/route-map.md) 文件，添加新增的代码结构路径说明，保证代码与结构文档一致。
3. **自动 Git 提交**：在本地功能测试、单元测试通过且文档同步完成后，必须自动执行 `git commit`（或由 AI 助手代理执行），及时保存开发成果并维护清晰的 Git 提交记录。
4. **Web 端先行验证**：为了提速开发效率，开发验证时优先使用 `bun run dev` 在普通浏览器端测试 Mock 逻辑效果，避免每次都打包编译桌面 App。
5. **语言约束**：项目开发方案（Implementation Plan）、文档注释以及交互语言必须统一使用 **中文** (Chinese)。

---

## 🛠️ 环境准备 (Prerequisites)

开始开发前，请确保您的系统已安装以下环境：
- **Bun**：前端包管理与运行工具 (已检测到本地路径为 `/Users/yudong22/.bun/bin/bun`)
- **Rust/Cargo**：Tauri 后端编译依赖 (需要 Rust 1.77+)
- **System Dependencies**：macOS 环境下需要 Xcode Command Line Tools。

---

## 🚀 常用开发命令 (Commands)

### 1. 安装项目依赖
```bash
bun install
```

### 2. 仅启动 Web 端开发服务 (使用 Mock 数据，开发提速)
直接在普通浏览器中运行前端，便于快速调试界面：
```bash
PATH="$PATH:/Users/yudong22/.bun/bin" bun run dev
```

### 3. 启动桌面端开发服务 (带原生壳与 Rust 后端)
启动并编译运行 Tauri 桌面客户端：
```bash
PATH="$PATH:/Users/yudong22/.bun/bin" bun run tauri dev
```

### 4. 运行 Rust 编译检测 (后端)
通过 Bun 命令校验 Rust 代码的正确性，避免对 Rust 的原生授权打扰：
```bash
PATH="$PATH:/Users/yudong22/.bun/bin" bun run test
```

### 5. 构建发布包 (Production Build)
```bash
PATH="$PATH:/Users/yudong22/.bun/bin" bun run tauri build
```

---

## 📂 代码结构说明

关于项目的详细目录结构以及代码组织逻辑，请参考 [docs/route-map.md](file:///Users/yudong22/Documents/deepseek-code/docs/route-map.md)。
