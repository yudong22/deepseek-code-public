# ROADMAP

> 下一阶段规划。基于 v0.5.5（2026-06-26）现状梳理遗留问题。
> 路线图按三条主线组织：**主线一：Coding 能力不断完善** / **主线二：长期记忆与自我演进平台建设** / **主线三：治理与可信**。

---

## TL;DR

> **版本规则**：x.0 / x.y.0 = 功能演进（minor/major bump），x.x.1 / x.x.2 = bug 修复和查缺补漏（patch bump）。

| 主线 | 版本 | 主题 | 状态 |
|---|---|---|---|
| **v0.6.0** Coding + 治理同步 | | | |
| Coding 能力 | v0.6.0 | 工具集对齐：TodoWrite / WebFetch / WebSearch (SubAgent 推 v0.6.1) | ✅ 已实现 |
| Coding 能力 | v0.6.0 | Tool 工具调用基建升级（超时取消轮询、原子写、replace_all、越界检查） | ✅ 已实现 |
| Coding 能力 | v0.6.0 | Bash 安全护栏（超时、危险命令黑名单+PolicyConfirm、env 清理） | ✅ 已实现 |
| 治理与可信 | v0.6.0 | Prompt injection 防护（EXTERNAL_UNTRUSTED_CONTENT 包装 + secret 过滤） | ✅ 已实现 |
| 治理与可信 | v0.6.0 | 人机协作边界（plan-then-confirm + diff review） | 推 v0.6.1 |
| **v0.6.1 / v0.6.2** Bug 修复 | | | |
| Coding 能力 | v0.6.1 | `openhands run` 自愈流水线正式启用 + 端到端集成测试 | 局部就绪 |
| Coding 能力 | v0.6.2 | fastValidate fail-fast、callAgent 失败推进预算、--task-id 校验 | 调研完成 |
| **v0.7.0** 记忆 + 可观测 + 成本 | | | |
| Coding 能力 | v0.7.0 | 上下文压缩 / 消息总结 | 仅 step 上限 25 |
| 记忆与平台 | v0.7.0 | 记忆生命周期治理（TTL、隐私过滤、用户遗忘权） | 无 |
| 记忆与平台 | v0.7.0 | Rust sidecar-agent 复用至 CLI（合并双引擎） | 调研中 |
| 治理与可信 | v0.7.0 | Agent 可观测性（OTel trace + replay） | 无 |
| 治理与可信 | v0.7.0 | 成本预算（token/USD 上限 + 模型路由） | 无 |
| **v0.7.1** Bug 修复 | | | |
| | v0.7.1 | 可观测性集成稳定性、记忆 TTL bug 修复 | — |
| **v0.8.0** 输出侧安全 + 多模态 | | | |
| Coding 能力 | v0.8.0 | 多模态（图像输入） | 协议层未支持 |
| 治理与可信 | v0.8.0 | 代码安全扫描集成（gitleaks / semgrep / cargo audit） | 无 |
| **v0.8.1** Bug 修复 | | | |
| | v0.8.1 | 签名流水线稳定性（v0.5.0 之后 13 次 fix 收尾） | 持续 |
| **v0.9.0** 多引擎 + IDE 化 | | | |
| Coding 能力 | v0.9.0 | 多引擎横向比较：Claude Code / Cursor CLI / Codex 等二进制接入 | 规划中 |
| Coding 能力 | v0.9.0 | 全场景 IDE 化：多语言 LSP 接入 | 无 |
| **v0.9.1** Bug 修复 | | | |
| | v0.9.1 | LSP 集成稳定性、评测基准 bug | — |
| **v1.0.0** 团队版 / 企业可用 | | | |
| Coding 能力 | v1.0.0 | Multi-agent 协作（planner / coder / reviewer） | 无 |
| Coding 能力 | v1.0.0 | 多模型协议兼容：OpenCodeGo / 腾讯 / 阿里 / 字节 coding plan | 无 |
| 记忆与平台 | v1.0.0 | 自我评估与回放、记忆网络多维化 | 无 |
| 记忆与平台 | v1.0.0 | 团队版网关（RBAC、审计日志、配额管理） | 无 |

---

## 三条主线

### 主线一：Coding 能力不断完善

Rust coding 引擎改写自 opencode core，以此为基线持续补齐相对 Claude Code 的 coding 短板。同时支持 Claude Code / Cursor CLI / Codex 等二进制接入，在同一基准下横向比较不同引擎的 coding 效果。

### 主线二：长期记忆与自我演进平台建设

构建可持久化、可迁移、可演进的记忆系统，让 agent 越用越聪明。

### 主线三：治理与可信

补齐企业级落地的可信维度：人机协作边界、可观测性、隐私合规、安全防护、成本控制。这是 DeepSeek Code 从「能用的工具」走向「可信的工具」的必经之路。

#### P0 — 必须尽快解决（Coding 能力）

### 1. `openhands run` 自愈流水线正式启用

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

### 2. 工具集对齐（Rust Sidecar Agent）

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

#### P0 — 必须尽快解决（治理与可信）

### 3. Prompt Injection 防护

**动机**：v0.6.0 引入 `WebFetch` / `WebSearch` 后，agent 处理的输入会包含大量不可信外部内容（网页、搜索结果、Issue 评论）。攻击者可以在这些内容里嵌入 prompt injection，诱导 agent 执行危险操作（`curl | sh`、泄露 secrets、git push 到恶意远端）。OWASP LLM Top 10（2025 更新版）已经把 prompt injection 列为 LLM 应用第一攻击面。

**现状**：
- `WebFetch` / `WebSearch` 工具尚未实现，但一旦上线，agent 会把外部内容拼接到 system prompt / user message。
- 当前没有任何输入校验、输出过滤、工具调用前的安全审查。
- `Bash` 工具无危险命令拦截（见 Bash 安全护栏 P1）。

**目标**：
1. **输入隔离**：把外部内容包裹在 `<tool_call>`-like 不可信 token 中，与 system prompt 物理隔离；让 LLM 知道「这是数据，不是指令」。
2. **工具白名单**：外部触发的 tool call 走严格白名单（如 webfetch 不允许直接触发 bash / file_write）。
3. **危险命令拦截**：在 `Bash` 工具前置层加入危险命令模式匹配（`rm -rf` / `curl | sh` / `git push --force` / base64 解码执行等），匹配时通过 `question` 工具强制用户确认。
4. **secret 过滤**：检测工具输出中的 `sk-` / `ghp_` / AWS access key 等模式，自动 mask 并在日志中告警。
5. **结构化日志**：所有 prompt injection 尝试记录到独立审计日志，UI 可见。

**风险**：高。这是 agent 安全的基础设施，设计需要平衡安全与可用性。建议从「白名单 + 危险命令拦截」入手，secret 过滤作为 v0.6.x 增强。

---

#### P1 — 下一个里程碑（Coding 能力）

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

#### P1 — 下一个里程碑（记忆与平台）

### 7. 记忆生命周期治理

**动机**：长期记忆愿景（向量记忆沉淀、跨项目迁移）很好，但没有治理机制会变成「数据黑洞」：记忆会无限增长、敏感信息被 embedding、用户无法控制、过期数据不清理。

**现状**：
- 记忆只有写入和检索，无 TTL、无项目 scope、无隐私过滤。
- 无用户「遗忘权」接口。
- 无跨项目隔离，多个项目的记忆混在一起。

**目标**：
1. **TTL + 项目 scope**：每条记忆带 `project_id` + `created_at` + `ttl`，过期自动清理。
2. **隐私过滤**：embedding 前检测 secrets (sk-/ghp_/AWS key) 和 PII (邮箱/手机号)，命中则 mask 或拒绝。
3. **用户可控遗忘**：UI 提供「清除某项目记忆」「清除某时间段记忆」按钮。
4. **跨设备同步策略**：记忆数据加密后通过 Go 网关同步，本地缓存 + 远端快照双层存储。

**风险**：中。隐私过滤需要持续维护正则/规则，false positive 会影响正常使用。

---

#### P1 — 下一个里程碑（治理与可信）

### 8. 人机协作边界

**动机**：当前 agent 自主度模糊 —— LLM 输出 `rm -rf` 直接执行，git push 也不二次确认。Claude Code / Cursor CLI 都引入了「plan mode + diff review」作为高风险操作的安全阀。

**现状**：
- 所有工具调用都是「自动执行」，用户只能在事后看到结果。
- 无 plan 模式，agent 不会先给出方案再执行。
- 无 diff review，file_write / file_edit 直接落盘。

**目标**：
1. **Plan-then-confirm 模式**：高风险任务（涉及多文件修改、git push、rm 操作）必须先输出 plan，用户点确认才执行。
2. **Diff review UI**：file_write / file_edit 必须先在 UI 渲染 diff，用户点应用才落盘（参考 Cursor 的 inline diff 模式）。
3. **危险操作二次确认**：通过 `question` 工具实现 `rm -rf` / `git push --force` / `curl | sh` / base64 解码执行 等模式的强制确认。
4. **撤销能力**：所有文件操作在 5 分钟内可一键撤销（基于 `.bak` 备份 + reflog）。

**风险**：中-高。误伤会影响正常使用（如开发流程常需要 `git push`），需要可配置「风险等级阈值」。

### 9. Agent 可观测性

**动机**：agent 失败时无法归因、无法回放，企业用户无法信任。2026 年的 agent 工具都默认集成 OTel trace。

**现状**：
- 无结构化 trace 日志。
- 失败案例无法回放分析。
- 无性能指标（每 step 耗时、LLM 调用延迟、tool 执行耗时）。

**目标**：
1. **OTel trace 导出**：每个 agent 循环生成 span（LLM call、tool exec、tool result），支持 OTLP 协议导出到 Jaeger / Tempo / Langfuse。
2. **失败 replay 模式**：UI 允许重放历史 session，重放时可手动修改 agent 的中间决策。
3. **性能面板**：展示每 step 的耗时、token 消耗、cost 估算。
4. **成本可追溯**：每次 LLM 调用记录 model + tokens + cost，session 总成本实时显示。

**风险**：中。OTel 集成对 Rust crate 的依赖增加有限，主要是 schema 设计。

### 10. 成本预算与模型路由

**动机**：企业用户对 API 成本敏感，agent 工具必须有「成本开关」。Claude Code 2026 引入了「Haiku for simple tasks, Sonnet for complex」的智能路由。

**现状**：
- 模型只能全局配置，所有任务用同一个模型。
- 无 token / USD 预算控制。
- 无成本展示。

**目标**：
1. **模型路由**：根据任务复杂度自动选择模型（grep / file_read 用 mini 即可，复杂设计任务用 opus / sonnet）。
2. **预算上限**：用户可设置每次 session 的 max tokens / max USD，超额自动暂停。
3. **成本透明**：UI 展示每次 LLM 调用的 cost，session 累计 cost。
4. **预算告警**：超过预算 80% 时弹窗提醒。

**风险**：低。路由策略需要 LLM 评分任务复杂度，本身有成本，需要平衡。

---

#### P2 — 中期（Coding 能力）

### 11. 多引擎横向比较

**动机**：Rust coding 引擎改写自 opencode core，但与 Claude Code / Cursor CLI / Codex 等商业引擎相比仍有 gap。需要通过统一基准测试来衡量差距，驱动持续改进。

**现状**：
- 当前只有 Rust sidecar-agent 一个引擎。
- 无统一的 benchmark 基准。
- 无多引擎并行接入的适配层。

**目标**：
1. 设计统一的 coding 效果评测基准（覆盖代码生成、修复、重构、问答等场景）。
2. 实现多引擎适配层，支持 Claude Code / Cursor CLI / Codex 等二进制接入。
3. 在同一基准下横向比较不同引擎的 coding 效果，输出量化报告。
4. 根据评测结果持续补齐 opencode core 的 coding 短板。

**风险**：中。评测基准的设计需要兼顾客观性和实用性，避免过度拟合。

---

#### P2 — 中期（记忆与平台）

### 12. CLI 切换到 Rust Sidecar Agent

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

### 13. macOS 签名流水线稳定性

**动机**：v0.5.0 之后的 git log 显示连续 13 次 release 相关 fix commit（`b5c9e58` / `f206545` / `4165b94` 等），签名 / Tauri updater / Keychain 相关问题反复出现。

**目标**：
1. 拆解 `release-mac.yml` 步骤，每步独立可重试。
2. 把签名密钥改用 GitHub Actions OIDC + Apple notary API，避免 `.tauri/updater.key` 的本地维护。
3. 写一个 `bun run scripts/release-smoke.ts` 模拟发布流程，跑通后才允许打 tag。

**风险**：中。Apple 生态签名复杂度高，迭代式改进即可。

---

#### P2 — 中期（治理与可信）

### 14. 代码安全扫描集成

**动机**：agent 自动生成的代码可能包含安全漏洞（hardcoded secret、SQL 注入、unsafe Rust 块等），但当前没有任何静态分析集成。2026 年的企业级 coding agent 都默认集成 semgrep / gitleaks / codeql。

**现状**：
- 无任何静态分析 hook。
- agent 输出代码直接落盘，无安全审计。

**目标**：
1. **Secret 扫描**：集成 gitleaks，每次 `file_write` 之后自动扫，命中则 warn + mask。
2. **代码安全扫描**：集成 semgrep 规则集（security-audit + owasp-top-ten），CI 阶段执行。
3. **依赖审计**：集成 cargo audit + npm audit，PR 阶段检查已知漏洞依赖。
4. **结构化报告**：扫描结果写入 `.audit/` 目录，UI 展示。

**风险**：低-中。扫描规则会有 false positive，需要 allowlist 机制。

---

## 长期愿景

### 主线一：Coding 能力不断完善

- **全场景 IDE 化**：多语言 LSP 接入、代码诊断、跳转定义，让 DeepSeek Code 不止是聊天框。
- **Multi-agent 协作**：planner / coder / reviewer 三 agent pipeline，对应不同的 `agent_routing` 入口。
- **多引擎横向比较**：支持 Claude Code / Cursor CLI / Codex 等二进制接入，在同一基准下衡量不同引擎的 coding 效果。
- **多模型协议兼容**：支持 OpenCodeGo / 腾讯 / 阿里 / 字节的 coding plan 接入，厚适配层自动转发。

### 主线二：长期记忆与自我演进平台建设

- **向量记忆持续进化**：从当前 top-3 相似度检索升级为多维度记忆网络（代码语义、错误模式、项目结构），让 agent 越用越聪明。
- **经验自动沉淀**：每次 coding 会话自动提取可复用的经验片段，无需手动触发 `memory sync`。
- **跨项目迁移**：一个项目的修复经验自动泛化到相似项目，实现组织级知识复用。
- **自我评估与回放**：agent 定期回顾历史成功/失败案例，自动调整策略参数。
- **团队版网关**：Go 网关补齐 RBAC、审计日志、配额管理。

### 主线三：治理与可信

- **人机协作可配置**：根据风险等级自动切换「自主 / 需确认 / plan-then-execute」模式，让用户掌控权随任务敏感度递进而增强。
- **Agent 可观测性普及**：OTel trace 成为标配，失败可归因、决策可回放、cost 可追溯。
- **Prompt injection 防护体系化**：所有外部内容走不可信 token 隔离 + 工具白名单 + 危险命令拦截，构成多层防御。
- **记忆治理合规化**：TTL / 项目 scope / 用户遗忘权 / 隐私过滤，匹配 GDPR / AI Act 等合规要求。
- **代码安全扫描内建**：gitleaks / semgrep / cargo audit 集成到 agent 落盘链路，生成即审计。
- **成本可控可预测**：模型路由 + 预算上限 + 实时成本展示，企业用户用得放心。

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
