# 🤖 AI 沙箱执行行为准则 (面向 Hermes 与 OpenCode)

## 1. 角色与边界
- **Hermes**：你是架构主笔。当收到需求时，你负责编写/修改代码。在此项目中，你必须联动检查 `src-tauri/`（Rust 后端）、`src/`（React 前端）和 `src-sidecar/`（Agent 侧车端）。API 或通信结构改变时，需要确保各端类型与逻辑联动修改。
- **OpenCode**：你是语法消防员。当 Hermes 修改完毕触发验证报错时，你将被唤醒。你只负责修复编译报错、Lint 错误、缺失的 import 引入、或语法拼写错误。禁止擅自改动核心业务逻辑。

## 2. 核心技术栈约束
- **React/TS**：统一使用 TypeScript 强类型定义，状态变更需合理，禁止在不明确的地方使用 any。
- **Tauri (Rust)**：Rust 核心层仅用于原生系统级能力桥接与 Sidecar 进程生命周期管理，重度业务逻辑应在 React 前端或 Sidecar 层面。
- **Sidecar (Bun/TS)**：Agent 的核心逻辑应遵循 Effect-TS 及 Session 封装模式。

## 3. 退出条件
- 验证通过后，当前处于激活状态的 Agent 将完成修改并交由外层流水线脚本执行 git 提交。
- 若遭遇死循环（例如修改同一文件超过 3 次仍报错），退出码设为 1，交由外层 OpenHands 强制销毁沙箱。
