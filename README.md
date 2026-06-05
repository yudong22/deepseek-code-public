# deepseek-code

一个基于 **Tauri v2 + React + TypeScript** 的现代桌面端应用程序。

---

## 📜 开发宪法 (Development Constitution)

⚠️ **所有开发者必须严格遵守以下规范：**

1. **功能测试**：每次开发完需求/修改代码后，必须在本地运行并进行完整的功能测试，确保前后端无交互异常或崩溃问题。
2. **文档同步**：完成需求开发后，必须及时补充和更新 [docs/route-map.md](file:///Users/yudong22/Documents/deepseek-code/docs/route-map.md) 文件，添加新增的代码结构路径说明、组件职责或 API 定义，保证代码与结构文档的一致性。

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

### 2. 启动本地开发服务 (带热更新)
启动 Vite 开发服务器并编译运行 Tauri 桌面客户端：
```bash
# 若 bun 未加入全局 PATH，请使用如下命令启动：
PATH="$PATH:/Users/yudong22/.bun/bin" bun run tauri dev
```

### 3. 构建发布包 (Production Build)
```bash
PATH="$PATH:/Users/yudong22/.bun/bin" bun run tauri build
```

---

## 📂 代码结构说明

关于项目的详细目录结构以及代码组织逻辑，请参考 [docs/route-map.md](file:///Users/yudong22/Documents/deepseek-code/docs/route-map.md)。
