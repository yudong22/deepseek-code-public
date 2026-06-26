# ROADMAP

> 下一阶段规划。基于 v0.5.1（2026-06-24）现状梳理遗留问题。
> 路线图按优先级和依赖关系排序，每项标注「动机 / 现状 / 目标 / 风险」。

---

## TL;DR

| 优先级 | 主题 | 预计版本 | 状态 |
|---|---|---|---|
| P0 | 移除 TypeScript sidecar 死代码（74 MiB 重复二进制） | v0.5.2 | 调研完成 |
| P0 | `openhands run` 自愈流水线正式启用 + 集成测试 | v0.6.0 | 局部就绪 |
| P0 | 工具集对齐：TodoWrite / WebFetch / WebSearch / SubAgent | v0.6.0 | UI 占位已有，工具未实现 |
| P1 | Tool 工具调用基建升级（流式、超时、取消、原子写、沙箱） | v0.6.0 | 串行执行 |
| P1 | Bash 安全护栏（超时、危险命令确认、env 清理） | v0.6.0 | 无任何保护 |
| P1 | 上下文压缩 / 总结（消息历史无界） | v0.7.0 | 仅 step 上限 25 |
| P2 | Rust sidecar-agent 复用至 CLI（合并双引擎） | v0.7.0 | 调研中 |
| P2 | 多模态（图像输入） | v0.7.0 | 协议层未支持 |
| P2 | macOS 签名流水线稳定性 | 持续 | v0.5.0 之后 13 次修复 |

---

## P0 — 必须尽快解决

### 1. 清理 TypeScript Sidecar 死代码

**动机**：桌面端 v0.5.0 已迁移到进程内 Rust crate `sidecar-agent`，但 TypeScript sidecar 构建链未被切断——`apps/desktop/package.json` 的 `dev` / `build` / `preview` / `build:mac` 全部调用 `bun run build:sidecar`，每次开发/构建都会编译一个 **74 MiB 的 `opencode-sidecar-aarch64-apple-darwin`**，然后被丢在 `apps/desktop/src-tauri/binaries/` 无人使用。

**现状**：
- `tauri.conf.json` 没有 `bundle.externalBin`，Tauri 不会打包。
- `apps/desktop/src-tauri/Cargo.toml:32` 只依赖 Rust crate `sidecar-agent`。
- 真正消费 TS sidecar 的只有 `packages/client-cli/src/openhands-call.js:152-161`。
- 桌面端 mock 文件夹里还有 `"src-sidecar/index.ts"` 这种残留字面量（`mock.ts:222`）。

**目标**：
1. 桌面端 `package.json` 移除 `build:sidecar` 调用链。
2. 删除 `apps/desktop/src-tauri/binaries/` 下陈旧二进制。
3. 桌面端代码搜索 `src-sidecar` 残留并清理。
4. 重新跑 `bun run test` + 桌面端 `bun run preview` 验证。
5. `CLAUDE.md`「CLI 保留 TypeScript sidecar」一节更明确，区分两套引擎边界。

**风险**：低，纯删除操作。建议作为 v0.5.2 收尾小版本。

---

### 2. `openhands run` 自愈流水线正式启用

**动机**：README/CLAUDE.md 把「自愈流水线」作为核心卖点宣传，但实际 CLI 缺乏 `handleRun` 的端到端集成测试（`cli.test.ts` 不覆盖 `handleRun`），且打包出 `bun openhands` 后用户首次运行需要手动 `login` + `doctor`，体感上「还没正式启动」。

**现状**：
- 工作流已实现：worktree 隔离 → 拉取记忆 → agent → `fastValidate` → 自愈循环（max 3 次）→ 提交 / 回滚 → 记忆上报。
- 已知问题：
  - `healCount` 仅由 `fastValidate` 失败驱动，`callAgent` 自身失败不会推进预算（`cli.ts:721-723`）。
  - `--task-id` 没做 shell 注入校验（`cli.ts:436`）。
  - `fastValidate` 找不到 `verification_pipeline` 时静默跳过（`fast-validate.js:40-43`）—— 这让自愈逻辑根本跑不起来。
  - `ai-runner-v2.js`（157 行）是旧版本残留，从未接入 `cli.ts`。
  - `openhands-call.js:340-409` 有不可达的死代码块。
  - `package.json:10` 的 `bun test` 只跑 2 个测试文件，另有 `protocol.test.ts` (324 行) 和 `ui-utils.test.ts` (176 行) 被排除。
  - 「Sidecar 超时 180s」与代码实际 300s 不符（`openhands-call.js:177`）。

**目标**：
1. 给 `handleRun` 写至少 1 个端到端集成测试（用本地 mock sidecar）。
2. `fastValidate` 在配置缺失时主动报错（fail-fast），而不是静默放过。
3. `callAgent` 失败也消耗自愈预算，并附带失败原因。
4. `--task-id` 走白名单校验（`/^[a-z0-9-]{1,64}$/`）。
5. 删除 `ai-runner-v2.js` 与 `openhands-call.js:340-409` 死代码。
6. `package.json` 的 `test` 脚本补齐 4 个测试文件。
7. `SIDECAR_TIMEOUT_MS` 默认值与 `CLAUDE.md` 对齐（180s 或同步文档）。

**风险**：中。自愈流程涉及 git/IO/LLM 多个外部依赖，需要小心设计 mock 边界。

---

### 3. 工具集对齐（Rust Sidecar Agent）

**动机**：现代 agent（Claude Code、OpenCode）至少有 TodoWrite、WebFetch、WebSearch、SubAgent、ImageInput 五个工具。本项目 UI 已经为前三个预留了展示分支（`toolUtils.ts:101-112` 的 `webfetch` / `websearch` 分支；`ToolCallCard.tsx:34-36` 的 `todowrite` 分支；`QuestionCard.tsx` 已存在但没接入 `ToolCallCard`），但 Rust 侧没有任何对应工具实现。

**现状**：

| 工具 | UI 状态 | Rust 实现 | 优先级 |
|---|---|---|---|
| `todowrite` | `TodoListCard` 已就位 | ❌ | 高 |
| `webfetch` | `toolUtils.ts:101-107` 占位 | ❌ | 中 |
| `websearch` | `toolUtils.ts:108-112` 占位 | ❌ | 中 |
| `subagent` / `Task` | 无 | ❌ | 中 |
| 多模态输入 | 无 | ❌（`ChatMessage` 只有 `content: String`） | 低 |
| `question` UI 接入 | `QuestionCard` 未被 `ToolCallCard` 调用 | ✅ 已实现 | 高 |

**目标**：
1. **接入 `QuestionCard`**：修改 `ToolCallCard.tsx`，当 tool name 为 `question` 时渲染 `QuestionCard`。
2. **新增 `TodoWrite` 工具**：写入 session 级 todo 表（可复用 `session.rs` 的 SQLite），通过 `TodoUpdated` 事件流式推送，UI 实时更新。
3. **新增 `WebFetch` 工具**：`reqwest` 拉取 HTML/Markdown，截断到 8K tokens，遵循 robots.txt。
4. **新增 `WebSearch` 工具**：调用网关的搜索端点（需先在 Go 网关实现），或对接 SerpAPI / Brave Search。
5. **SubAgent 工具**：允许主 agent 派发子任务，子任务有独立 step 预算，回流 result。架构上需要 `AgentContext` 嵌套。
6. **`ChatMessage` 扩展多模态**：参考 OpenAI `content: Array<ContentPart>`，先把 `TextPart` 和 `ImageUrlPart` 加上。

**风险**：中-高。WebFetch 涉及网络出站，SubAgent 涉及递归执行，复杂度较高。建议分两阶段：v0.6.0 做 `TodoWrite` + `QuestionCard` 接入 + `WebFetch`（最低限度），v0.6.x 补 `WebSearch` + `SubAgent`。

---

## P1 — 下一个里程碑

### 4. Tool 基建升级

**动机**：当前 `Tool::execute` 同步返回 `serde_json::Value`，无流式、无超时、无取消、无原子写。Claude Code / OpenCode 都已支持。

**现状**（每个工具的缺口详见调研）：

| 缺口 | 位置 |
|---|---|
| `bash` 没有实际超时（docstring 写 120s） | `tools/bash.rs` |
| `file_write` 直接 `std::fs::write`，无原子、无备份 | `tools/file_write.rs` |
| `file_edit` 只替换首个匹配 | `tools/file_edit.rs:81` |
| `grep` / `glob` 无 include / exclude / context / max-count | `tools/grep.rs`, `tools/glob.rs` |
| Tool trait 无 cancellation token | `tools/mod.rs:49-70` |
| Tool 无流式结果 | `Tool::execute` 签名 |
| agent.rs 写死只读工具名列表 | `agent.rs:281-293` 硬编码 `file_read/grep/glob` |

**目标**：
1. `Tool::execute` 改为 `async`，返回 `Stream<Item = ToolEvent>` 或保留 `Value` 但加 `cancel: CancellationToken` 参数。
2. `bash` 用 `tokio::time::timeout` + `nix` 沙箱（先 macOS，后续 Linux）。
3. `file_write` 改为「写 tmp + rename + 可选 `.bak` 备份」。
4. `file_edit` 强制要求 `replace_all: bool` 参数，避免误改。
5. `grep` / `glob` 补全现代 ripgrep / fd 风格参数。
6. 移除 `agent.rs` 硬编码的 tool name 分区，改用 `tool.is_read_only()` 动态判断。

**风险**：中。Tool trait 是 sidecar-agent 的核心抽象，签名变更需要同步更新所有 7 个工具实现和测试。

---

### 5. Bash 安全护栏

**动机**：`tools/bash.rs` 跑任意 `sh -c` 命令，继承完整父进程环境，没有任何 allowlist / 危险命令确认 / 网络限制。CLAUDE.md 把这当成核心 agent，但实战中一旦 LLM 输出 `rm -rf $HOME` 就立刻完蛋。

**现状**：
- 无 timeout
- 无 allowlist
- 无危险命令列表（`rm -rf` / `chmod 777` / `curl | sh`）
- 无 env 清理（PATH 中可能含用户自定义的可执行劫持）
- 无工作目录约束（可 `cd /` 后执行）

**目标**：
1. 默认 60s 超时，可由 tool 参数 `timeout_ms` 覆盖。
2. 内置危险命令列表（`rm -rf` / `mkfs` / `dd of=/dev/...` / `curl | sh` 等），匹配时通过 `question` 工具向用户二次确认。
3. 环境变量白名单：只透传 `PATH` / `HOME` / `LANG` / `LC_*` / 用户显式声明的变量。
4. 默认 `cwd = workspace_path`，禁止越界（除非参数显式 `allow_outside_workspace: true`）。
5. macOS 优先考虑 `sandbox-exec` 集成。

**风险**：高。误伤会影响正常使用（很多开发命令需要 `cd`），设计需要平衡安全与可用性。

---

### 6. 上下文压缩 / 总结

**动机**：当前 `messages: Vec<ChatMessage>` 完整保留，唯一的预算上限是 25 步。Claude Code / OpenCode 在历史消息超出窗口前会自动 summarize / truncate。

**现状**：
- step 上限 25（`agent.rs`）
- 续写上限 5 次（`agent.rs:247-269`）
- 无 message-level 压缩
- 无 token 计数主动控制

**目标**：
1. 引入 `ContextManager`：跟踪当前消息的 token 数（用 `tiktoken-rs` 或模型自带 tokenizer）。
2. 超阈值时策略：
   - 保留 system prompt + 最近 N 条消息
   - 对中间历史调用 LLM 生成 summary（**注意：成本**，要可配置）
3. UI 暴露「上下文使用率」指标（可放 `ChatInputCard` 角落）。

**风险**：中。summary 调用本身消耗 token，需要给出「关闭 summary」的开关。

---

## P2 — 中期

### 7. CLI 切换到 Rust Sidecar Agent

**动机**：当前 CLI 仍跑 `bun run packages/sidecar/src/index.ts`，依赖一个 75MB 的 Bun runtime + sibling `opencode` 仓库。如果 Rust crate 足够稳定，CLI 也可以直接复用，节省 runtime 依赖。

**现状**：
- TS sidecar 导入 `../../../../opencode/packages/core/src/session/wrapper`（sibling 仓库），但 `packages/sidecar/package.json:7` 的 build 脚本会先检查 `if [ -d ../../../opencode ]`，缺失时静默 no-op。
- 一旦 sibling opencode 仓库不在，CLI 实际是断的。

**目标**：
1. 评估 `sidecar-agent` crate 是否能被 `bun build --compile` 成 CLI 用的二进制。
2. 如果可以：把 CLI 切换到 Rust sidecar，统一两套引擎。
3. 如果暂时不行：把 `packages/sidecar` 改造为独立 npm 包，发布到内部 registry，避免 sibling repo 依赖。

**风险**：高。涉及跨语言重构，需要先在 Rust 侧补齐 stdin/stdout 协议和 Q&A 流。

---

### 8. macOS 签名流水线稳定性

**动机**：v0.5.0 之后的 git log 显示连续 13 次 release 相关 fix commit（`b5c9e58` / `f206545` / `4165b94` 等），签名 / Tauri updater / Keychain 相关问题反复出现。

**目标**：
1. 拆解 `release-mac.yml` 步骤，每步独立可重试。
2. 把签名密钥改用 GitHub Actions OIDC + Apple notary API，避免 `.tauri/updater.key` 的本地维护。
3. 写一个 `bun run scripts/release-smoke.ts` 模拟发布流程，跑通后才允许打 tag。

**风险**：中。Apple 生态签名复杂度高，迭代式改进即可。

---

## 长期愿景

- **Desktop → 全场景 IDE 化**：内置代码索引、跳转定义、错误诊断，让 `opencode` 不止是聊天框。
- **Multi-agent 协作**：planner / coder / reviewer 三 agent pipeline，对应不同的 `agent_routing` 入口。
- **本地模型接入**：通过 `provider.rs` 现有的 OpenAI-compatible 抽象，桥接 Ollama / vLLM。
- **团队版网关**：Go 网关补齐 RBAC、审计日志、配额管理。

---

## 不在路线图里

- ❌ 模型 fallback（v0.5.1 changelog 已标记「暂不纳入」）
- ❌ 第三方插件市场（过早抽象）
- ❌ 移动端（资源投入与 ROI 不匹配）

---

## 贡献指南

每完成一项请：
1. 在本文件勾掉对应 checkbox（`- [ ]` → `- [x]`）
2. 在 `.changelog.md` 顶部新增版本段
3. 更新 `CLAUDE.md` 中对应章节
4. 跑 `bun run test` + `cargo test` 全量通过
