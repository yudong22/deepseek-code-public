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
 * 升级 5 个配置文件:
 * 1. update.json      — Tauri 自动更新清单
 * 2. Cargo.toml       — Rust 桌面端版本
 * 3. desktop/package.json — 桌面端前端版本
 * 4. client-cli/package.json — CLI 工具版本
 * 5. sidecar/package.json  — Sidecar 版本
 *
 * 推送后 GitHub Actions 自动构建、签名、发布 Release
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const rootDir = path.resolve(__dirname, "..");
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
  const tagExists = execSync("git tag --list", { encoding: "utf-8", cwd: rootDir })
    .split("\n").map(t => t.trim()).includes(`v${newVersion}`);
  if (tagExists) {
    console.log(`🔄 删除旧标签 v${newVersion} ...`);
    execSync(`git tag -d v${newVersion}`, { cwd: rootDir });
    execSync(`git push origin --delete v${newVersion} 2>/dev/null; true`, { cwd: rootDir });
  }
  console.log(`🏷️  创建标签 v${newVersion} ...`);
  execSync(`git tag v${newVersion}`, { cwd: rootDir });
  execSync(`git push origin v${newVersion}`, { cwd: rootDir });
  console.log(`✅ 标签 v${newVersion} 已推送 → GitHub Actions 自动构建`);
  console.log(`   进度: https://github.com/yudong22/deepseek-code-public/actions`);
  process.exit(0);
}

// ─── 前置校验 ──────────────────────────────────
const gitStatus = execSync("git status --porcelain", { encoding: "utf-8", cwd: rootDir }).trim();
if (gitStatus) {
  console.error("❌ 工作区有未提交的修改:");
  console.error(gitStatus);
  console.error("\n请先提交或 stash 后再发布");
  process.exit(1);
}

let lastTag = "";
try {
  lastTag = execSync("git describe --tags --abbrev=0", { encoding: "utf-8", cwd: rootDir }).trim();
  console.log(`📌 上一个标签: ${lastTag}`);
} catch {
  console.log("📌 未找到历史标签");
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
console.log("\n📋 生成的 Release Changelog:");
console.log(changelogText);

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

console.log(`\n📄 已更新 ${files.length} 个文件:`);
files.forEach(f => console.log(`   ${f.label} → ${f.path}`));

// ─── Dry-run 模式：停止 ─────────────────────────
if (isDryRun) {
  console.log(`\n🔍 Dry-run 模式，未做任何提交。确认后运行不带 --dry-run`);
  process.exit(0);
}

// ─── 提交 + 打标签 + 推送 ──────────────────────
console.log(`\n🚀 提交并发布 v${newVersion} ...`);

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
execSync(`git commit -F "${commitMsgPath}"`, { cwd: rootDir });
fs.unlinkSync(commitMsgPath);
console.log(`📝 提交信息:\n${commitMsg}`);

const tagExists = execSync("git tag --list", { encoding: "utf-8", cwd: rootDir })
  .split("\n").map(t => t.trim()).includes(`v${newVersion}`);
if (tagExists) {
  execSync(`git tag -d v${newVersion}`, { cwd: rootDir });
  execSync(`git push origin --delete v${newVersion} 2>/dev/null; true`, { cwd: rootDir });
}

execSync(`git tag v${newVersion}`, { cwd: rootDir });
execSync(`git push origin main v${newVersion}`, { cwd: rootDir });

console.log(`\n✅ v${newVersion} 已发布！GitHub Actions 正在自动构建`);
console.log(`   进度: https://github.com/yudong22/deepseek-code-public/actions`);
