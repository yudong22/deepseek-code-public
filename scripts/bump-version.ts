#!/usr/bin/env bun
/**
 * 版本发布脚本
 *
 * 用法:
 *   bun run scripts/bump-version.ts <version>          # 更新+提交+打标签+推送
 *   bun run scripts/bump-version.ts <version> --dry-run # 仅预览（不提交不推送）
 *   bun run scripts/bump-version.ts --retag <version>   # 重新打标签（不更新文件）
 *
 * 示例:
 *   bun run scripts/bump-version.ts 0.5.0
 *   bun run scripts/bump-version.ts 0.5.0 --dry-run
 *   bun run scripts/bump-version.ts --retag 0.4.2
 *
 * 升级 6 个配置文件:
 * 1. update.json      — Tauri 自动更新清单
 * 2. Cargo.toml       — Rust 桌面端版本
 * 3. desktop/package.json — 桌面端前端版本
 * 4. client-cli/package.json — CLI 工具版本
 * 5. sidecar/package.json  — Sidecar 版本
 * 6. tauri.conf.json  — Tauri App 配置文件
 *
 * 推送后 GitHub Actions 自动构建、签名、发布 Release
 */

import fs from "fs";
import path from "path";
import { execSync, execFileSync } from "child_process";
import os from "os";

const rootDir = path.resolve(__dirname, "..");

// ─── terminal UI 样式函数 ───────────────────────
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function formatThought(secs: number, searched: number, ran: number): string {
  return `${colors.dim}Thought for ${secs}s, searched for ${searched} pattern${searched === 1 ? '' : 's'}, ran ${ran} shell command${ran === 1 ? '' : 's'}${colors.reset}`;
}

function formatCommandHeader(cmdName: string, cmdStr: string): string {
  return `${colors.green}● ${colors.bold}${cmdName}(${colors.reset}${cmdStr}${colors.bold})${colors.reset}`;
}

function formatCommandSubHeader(subHeader: string): string {
  return `  ${colors.dim}└ ${subHeader}${colors.reset}`;
}

function formatStep(msg: string): string {
  return `${colors.bold}● ${msg}${colors.reset}`;
}

function formatResult(msg: string): string {
  return `${colors.bold}∴ ${msg}${colors.reset}`;
}

function formatError(msg: string): string {
  return `${colors.red}● ${colors.bold}Error: ${msg}${colors.reset}`;
}
const args = process.argv.slice(2);
const isRetag = args.includes("--retag");
const isDryRun = args.includes("--dry-run");
const newVersion = (isRetag ? args[args.indexOf("--retag") + 1] : args[0])?.replace(/^v/, "");

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error("用法:");
  console.error("  bun run scripts/bump-version.ts <semver>              # 更新+提交+打标签+推送");
  console.error("  bun run scripts/bump-version.ts <semver> --dry-run    # 仅预览改动");
  console.error("  bun run scripts/bump-version.ts --retag <semver>      # 重新打标签推送");
  process.exit(1);
}

// ─── Retag 模式 ────────────────────────────────
if (isRetag) {
  console.log(formatStep(`重新打标签流程 (v${newVersion})`));
  const tagExists = execSync("git tag --list", { encoding: "utf-8", cwd: rootDir })
    .split("\n").map(t => t.trim()).includes(`v${newVersion}`);
  if (tagExists) {
    console.log(formatCommandHeader("Bash", `git tag -d v${newVersion} && git push origin --delete v${newVersion}`));
    console.log(formatCommandSubHeader("git tag"));
    execSync(`git tag -d v${newVersion}`, { cwd: rootDir });
    execSync(`git push origin --delete v${newVersion} 2>/dev/null; true`, { cwd: rootDir });
    console.log(`    ${colors.dim}Deleted local and remote tag v${newVersion}${colors.reset}`);
  }
  console.log(formatCommandHeader("Bash", `git tag v${newVersion} && git push origin v${newVersion}`));
  console.log(formatCommandSubHeader("git tag"));
  execSync(`git tag v${newVersion}`, { cwd: rootDir });
  execSync(`git push origin v${newVersion}`, { cwd: rootDir });
  console.log(`    ${colors.dim}Created and pushed tag v${newVersion}${colors.reset}`);
  
  console.log(formatResult(`标签 v${newVersion} 已推送 → GitHub Actions 自动构建中`));
  console.log(`  ${colors.dim}进度查看: https://github.com/yudong22/deepseek-code-public/actions${colors.reset}`);
  process.exit(0);
}

// ─── 前置校验与自动提交 ──────────────────────────
async function generateCommitMessage(apiKey: string, baseUrl: string, model: string, diff: string): Promise<string> {
  const systemPrompt = `你是一个资深的程序员。请阅读以下的 git diff，并生成一条符合 Conventional Commits 规范的、精炼的单行 git commit 提交信息。
要求：
1. 语言必须为中文，符合项目规范（例如：feat: 修复xxx、fix: 调整xxx）。
2. 只返回提交信息本身，不要有任何多余的解释、Markdown 标记、引号或前缀。
3. 尽量精炼，不超过 50 个字符。`;

  const userPrompt = `git diff 内容如下：\n\n${diff}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 100,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errText}`);
  }

  const data = await response.json() as any;
  const msg = data.choices?.[0]?.message?.content?.trim();
  if (!msg) {
    throw new Error("API 未返回有效的 commit message。");
  }
  return msg;
}

const gitStatus = execSync("git status --porcelain", { encoding: "utf-8", cwd: rootDir }).trim();
if (gitStatus) {
  console.log(formatThought(2, 0, 1));
  console.log(formatStep("检测到工作区有未提交的修改。通过 AI 评估改动并进行 commit。"));
  console.log(formatCommandHeader("Bash", "git status --porcelain"));
  console.log(formatCommandSubHeader("git status"));
  const statusLines = gitStatus.split("\n").map(l => `    ${l}`).join("\n");
  console.log(statusLines);

  // 解析 API Key 和配置
  const homeDir = os.homedir();
  const configPath = path.join(homeDir, ".openhands/config.json");
  let apiKey = process.env.DEEPSEEK_API_KEY || "";
  let baseUrl = "https://api.deepseek.com/v1";
  let model = "deepseek-chat";

  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const provider = cfg.defaultProvider || "deepseek";
      const provCfg = cfg.providers?.[provider];
      if (provCfg) {
        if (provCfg.apiKey) apiKey = provCfg.apiKey;
        if (provCfg.baseUrl) baseUrl = provCfg.baseUrl;
        if (provCfg.model) model = provCfg.model;
      }
    } catch (e) {
      // ignore
    }
  }

  if (model.includes("/")) {
    model = model.split("/").pop() || model;
  }

  if (!apiKey) {
    console.log(formatError("无法自动提交：未配置 API key（请设置环境变量 DEEPSEEK_API_KEY 或配置 ~/.openhands/config.json）"));
    process.exit(1);
  }

  // 暂存所有修改以获取完整的 diff（包括新增文件）
  execFileSync("git", ["add", "-A"], { cwd: rootDir });
  const diff = execSync("git diff --cached", { encoding: "utf-8", cwd: rootDir }).trim();

  if (!diff) {
    execFileSync("git", ["reset"], { cwd: rootDir });
    console.log(formatError("未检测到可提交的差异。"));
    process.exit(1);
  }

  try {
    console.log(formatThought(3, 0, 1));
    console.log(formatStep(`正在调用 AI (${model}) 评估改动并生成 commit message...`));
    const startTime = Date.now();
    const commitMsg = await generateCommitMessage(apiKey, baseUrl, model, diff);
    const elapsedSecs = Math.round((Date.now() - startTime) / 1000);
    console.log(formatThought(elapsedSecs, 0, 0));
    console.log(`  ${colors.dim}└ AI 生成的 commit message: "${commitMsg}"${colors.reset}`);

    console.log(formatCommandHeader("Bash", `git commit -m "${commitMsg.replace(/"/g, '\\"')}"`));
    console.log(formatCommandSubHeader("git commit"));
    const commitResult = execFileSync("git", ["commit", "-m", commitMsg], { encoding: "utf-8", cwd: rootDir }).trim();
    console.log(commitResult.split("\n").map(l => `    ${l}`).join("\n"));
    console.log(formatResult("自动 commit 成功，继续执行发布流程。"));
  } catch (err: any) {
    // 失败时回滚暂存状态
    execFileSync("git", ["reset"], { cwd: rootDir });
    console.log(formatError(`AI 评估/提交失败: ${err.message}`));
    process.exit(1);
  }
}

let lastTag = "";
try {
  lastTag = execSync("git describe --tags --abbrev=0", { encoding: "utf-8", cwd: rootDir }).trim();
  console.log(`  ${colors.dim}📌 上一个版本标签: ${lastTag}${colors.reset}`);
} catch {
  console.log(`  ${colors.dim}📌 未找到历史版本标签${colors.reset}`);
}

// ─── 生成 Changelog ─────────────────────────────
function generateChangelog(): string {
  const range = lastTag ? `${lastTag}..HEAD` : "--all";
  let log = "";
  try {
    log = execSync(`git log --oneline --no-decorate ${range}`, { encoding: "utf-8", cwd: rootDir });
  } catch { return "无提交记录。"; }

  const lines = log.trim().split("\n").filter(Boolean);
  const groups: Record<string, string[]> = {
    feat: [], fix: [], docs: [], refactor: [], style: [],
    perf: [], test: [], chore: [], other: [],
  };

  for (const line of lines) {
    const match = line.match(/^[a-f0-9]+\s+(feat|fix|docs|refactor|style|perf|test|chore)[:(]/);
    const raw = line.replace(/^[a-f0-9]+\s+/, "");
    if (match && groups[match[1]]) groups[match[1]].push(raw);
    else groups.other.push(raw);
  }

  const labels: Record<string, string> = {
    feat: "🚀 新功能", fix: "🐛 Bug 修复", docs: "📝 文档",
    refactor: "♻️ 重构", style: "🎨 样式", perf: "⚡ 性能",
    test: "✅ 测试", chore: "🔧 工程化", other: "📦 其他",
  };

  let changelog = "";
  for (const [key, label] of Object.entries(labels)) {
    if (groups[key].length > 0) {
      changelog += `### ${label}\n`;
      for (const item of groups[key]) changelog += `- ${item}\n`;
      changelog += "\n";
    }
  }
  return changelog.trim() || "无显著变更。";
}

const changelogText = generateChangelog();
const changelogPath = path.join(rootDir, ".changelog.md");
fs.writeFileSync(changelogPath, changelogText);
console.log("");
console.log(formatResult(`更新日志已生成并在 .changelog.md 归档`));
console.log(changelogText.split("\n").map(l => `  ${l}`).join("\n"));
console.log("");

// ─── 更新配置文件 ──────────────────────────────
const files: Array<{ path: string; label: string }> = [];

function updateJson(path: string, fn: () => void) {
  if (fs.existsSync(path)) { fn(); return true; }
  return false;
}

updateJson(path.join(rootDir, "update.json"), () => {
  const content = JSON.parse(fs.readFileSync(path.join(rootDir, "update.json"), "utf-8"));
  content.version = newVersion;
  content.notes = changelogText.split("\n").slice(0, 3).join("；");
  content.pub_date = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  for (const [key, val] of Object.entries(content.platforms || {})) {
    (val as any).url = `https://github.com/yudong22/deepseek-code-public/releases/download/v${newVersion}/deepseek-code_${key === "darwin-aarch64" ? "aarch64" : "x86_64"}.app.tar.gz`;
  }
  fs.writeFileSync(path.join(rootDir, "update.json"), JSON.stringify(content, null, 2) + "\n");
  files.push({ path: "update.json", label: "Tauri 更新清单" });
});

updateJson(path.join(rootDir, "apps/desktop/src-tauri/Cargo.toml"), () => {
  const p = path.join(rootDir, "apps/desktop/src-tauri/Cargo.toml");
  fs.writeFileSync(p, fs.readFileSync(p, "utf-8").replace(/^version\s*=\s*".*?"/m, `version = "${newVersion}"`));
  files.push({ path: "apps/desktop/src-tauri/Cargo.toml", label: "Rust 桌面端版本" });
});

updateJson(path.join(rootDir, "apps/desktop/src-tauri/tauri.conf.json"), () => {
  const p = path.join(rootDir, "apps/desktop/src-tauri/tauri.conf.json");
  const config = JSON.parse(fs.readFileSync(p, "utf-8"));
  config.version = newVersion;
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + "\n");
  files.push({ path: "apps/desktop/src-tauri/tauri.conf.json", label: "Tauri App 配置" });
});

updateJson(path.join(rootDir, "apps/desktop/package.json"), () => {
  const p = path.join(rootDir, "apps/desktop/package.json");
  const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
  pkg.version = newVersion;
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
  files.push({ path: "apps/desktop/package.json", label: "桌面端前端版本" });
});

updateJson(path.join(rootDir, "packages/client-cli/package.json"), () => {
  const p = path.join(rootDir, "packages/client-cli/package.json");
  const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
  pkg.version = newVersion;
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
  files.push({ path: "packages/client-cli/package.json", label: "CLI 工具版本" });
});

updateJson(path.join(rootDir, "packages/sidecar/package.json"), () => {
  const p = path.join(rootDir, "packages/sidecar/package.json");
  const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
  pkg.version = newVersion;
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
  files.push({ path: "packages/sidecar/package.json", label: "Sidecar 版本" });
});

console.log(formatStep(`同步所有配置文件的版本号为 v${newVersion}...`));
files.forEach(f => console.log(`  ${colors.green}✔${colors.reset} ${f.label} → ${colors.dim}${f.path}${colors.reset}`));

// ─── Dry-run 模式：停止 ─────────────────────────
if (isDryRun) {
  console.log("");
  console.log(formatResult(`Dry-run 模式已结束。所有更改已应用到本地文件。`));
  console.log(`  ${colors.dim}确认无误后，再次运行且不带 --dry-run 以正式提交并推送到 GitHub。${colors.reset}`);
  process.exit(0);
}

// ─── 提交 + 打标签 + 推送 ──────────────────────
console.log("");
console.log(formatStep(`准备提交版本文件并发布 v${newVersion}...`));

// 只 stage 已更新的版本文件 + changelog
const stagedPaths = files.map(f => f.path).concat([".changelog.md"]);
for (const p of stagedPaths) {
  execSync(`git add "${p}"`, { cwd: rootDir });
}

// 生成带 changelog 摘要的提交信息
const topChanges = changelogText.split("\n").filter(l => l.trim().startsWith("-")).slice(0, 8).map(l => `  ${l}`).join("\n");
const commitMsg = topChanges
  ? `release: v${newVersion}\n\n${topChanges}`
  : `release: v${newVersion}`;
const commitMsgPath = path.join(rootDir, ".commit-msg.tmp");
fs.writeFileSync(commitMsgPath, commitMsg);

console.log(formatCommandHeader("Bash", "git commit -F .commit-msg.tmp"));
console.log(formatCommandSubHeader("git commit"));
const commitResult = execSync(`git commit -F "${commitMsgPath}"`, { encoding: "utf-8", cwd: rootDir }).trim();
fs.unlinkSync(commitMsgPath);
console.log(commitResult.split("\n").map(l => `    ${l}`).join("\n"));

console.log("");

// ── 标签管理 ──
console.log(formatStep(`检查远程标签 v${newVersion}...`));
const remoteTagExists = execSync("git tag --list", { encoding: "utf-8", cwd: rootDir })
  .split("\n").map(t => t.trim()).includes(`v${newVersion}`);
if (remoteTagExists) {
  console.log(formatCommandHeader("Bash", `git tag -d v${newVersion} && git push origin --delete v${newVersion}`));
  console.log(formatCommandSubHeader("git tag"));
  execSync(`git tag -d v${newVersion}`, { cwd: rootDir });
  execSync(`git push origin --delete v${newVersion} 2>/dev/null; true`, { cwd: rootDir });
  console.log(`    ${colors.dim}Deleted duplicate tag v${newVersion}${colors.reset}`);
}

console.log(formatCommandHeader("Bash", `git tag v${newVersion}`));
console.log(formatCommandSubHeader("git tag"));
execSync(`git tag v${newVersion}`, { cwd: rootDir });
console.log(`    ${colors.dim}Created tag v${newVersion}${colors.reset}`);

console.log("");

// ── Push ──
console.log(formatStep(`推送到 origin (main + tag v${newVersion})...`));
console.log(formatCommandHeader("Bash", `git push origin main v${newVersion}`));
console.log(formatCommandSubHeader("git push"));

try {
  execSync(`git push origin main v${newVersion}`, {
    cwd: rootDir,
    stdio: "inherit",  // 让 git push 的输出直接显示在终端
    timeout: 180000,
  });
  console.log("");
  console.log(formatResult(`v${newVersion} 发布成功！GitHub Actions 正在自动构建`));
  console.log(`  ${colors.dim}编译进度: https://github.com/yudong22/deepseek-code-public/actions${colors.reset}`);
} catch (pushErr: any) {
  const stderr = (pushErr.stderr || "").toString();
  if (stderr.includes("lfs.locksverify")) {
    console.log(`  ${colors.yellow}⚠️  Git LFS locking API 不支持，正在自动修复并重试...${colors.reset}`);
    execSync(
      "git config lfs.https://github.com/yudong22/deepseek-code-public.git/info/lfs.locksverify false",
      { cwd: rootDir },
    );
    console.log(formatCommandHeader("Bash", "git push origin main v${newVersion} (retry)"));
    execSync(`git push origin main v${newVersion}`, {
      cwd: rootDir,
      stdio: "inherit",
      timeout: 180000,
    });
    console.log("");
    console.log(formatResult(`v${newVersion} 发布成功！GitHub Actions 正在自动构建`));
    console.log(`  ${colors.dim}编译进度: https://github.com/yudong22/deepseek-code-public/actions${colors.reset}`);
  } else {
    console.log(formatError(`Push 失败: ${pushErr.message}`));
    if (stderr) console.error(stderr);
    process.exit(1);
  }
}
