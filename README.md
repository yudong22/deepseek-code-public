# OpenHands / DeepSeek Code 🚀

一个基于 **C/S (客户端-服务端) 架构**的本地智能编程与自愈自适应 Agent 流水线系统。

---

## 🌟 核心特性 (Key Features)

- **🔄 C/S 自愈流水线 (Self-Healing Pipeline)**：客户端在影子沙箱 (Worktree) 中自动捕捉编译/测试错误，将报错日志与代码提交至服务端，结合历史经验生成自愈方案，自动修复并完成测试验证。
- **🧠 向量经验记忆库 (Long-term Vector Memory)**：基于 **Qdrant 向量数据库**。每次成功并网的代码与修复日志都会被同步为 Embedding 记忆。当未来遇到相似编译错误时，自动检索最匹配的 3 条经验作为上下文注入 Agent。
- **🛡️ Go 语言统一安全网关 (Go Gateway)**：基于 Go 语言构建的企业级 API 网关。支持 OAuth2 客户端凭证认证并签发短期 JWT；负责底层大模型（如 DeepSeek-V4）接口的安全代理与流式 (SSE) 转发，保证企业 API Key 安全不泄露。
- **🖥️ 桌面端与 CLI 双模生态 (Desktop & CLI Ecosystem)**：
  - **`openhands` CLI**：提供 `login`、`doctor`（环境审计）、`run`（自愈开发）、`memory sync`（经验上报）等纯命令行操作。
  - **Tauri Desktop Client**：基于 Tauri v2 + React 19 开发的 macOS 精致桌面端，支持 Mermaid.js 架构图动态渲染与全套工具交互。

---

## 📂 模块结构 (Monorepo Workspace)

本项目采用 **Bun Workspaces** 组织的多包工作区：

- **`apps/desktop/`**：Tauri v2 + React 19 桌面客户端程序。
- **`packages/gateway/`**：Go 语言网关服务端，集成了 JWT、SSE 代理、Qdrant 驱动。
- **`packages/client-cli/`**：客户端 CLI 工具 (`@openhands/cli`)，提供完整的开发与自愈指令。
- **`packages/sidecar`**：本地执行侧车二进制 Wrapper (`@deepseek-code/sidecar`)。它是一个完全开源且安全透明的桥接封装，仅用于加载与运行开源编程工具 **OpenCode** 的本地核心引擎，不包含任何闭源黑盒或不安全的网络请求逻辑，可放心使用。

---

## 🚀 快速开始 (Getting Started)

开始前确保本地拥有 **Bun** 与 **Go 1.22+** 环境（编译桌面客户端需 **Rust 1.77+**）。

### 1. 安装依赖
在根目录下直接安装整个 Workspace 依赖：
```bash
bun install
```

### 2. 启动服务与应用

- **启动客户端 (Tauri 桌面端)**：
  ```bash
  bun preview
  ```
- **启动 Go 网关服务端**：
  ```bash
  cd packages/gateway && go run main.go
  ```
- **使用 CLI 客户端**：
  ```bash
  bun run packages/client-cli/src/cli.ts --help
  ```

### 3. 运行测试
```bash
bun test
```

---

⭐ 开源共享，欢迎贡献代码与自愈规则！
