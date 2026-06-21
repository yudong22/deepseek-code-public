#!/usr/bin/env bun
/**
 * 版本号同步脚本
 * 用法: bun run scripts/bump-version.ts <new-version>
 * 示例: bun run scripts/bump-version.ts 0.5.0
 *
 * 更新所有需要修改版本号的配置文件:
 * 1. update.json      — Tauri 自动更新清单（version + pub_date + 下载 URL）
 * 2. apps/desktop/src-tauri/Cargo.toml — Rust 桌面端版本
 * 3. apps/desktop/package.json         — 桌面端前端版本
 * 4. packages/client-cli/package.json  — CLI 工具版本
 * 5. packages/sidecar/package.json     — Sidecar 版本
 *
 * 同时生成 Release Changelog（基于上次 tag 以来的 commit 记录）
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const rootDir = path.resolve(__dirname, "..");
const newVersion = process.argv[2]?.replace(/^v/, "");

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error("用法: bun run scripts/bump-version.ts <semver>");
  console.error("示例: bun run scripts/bump-version.ts 0.5.0");
  process.exit(1);
}

// ─── 前置校验 ──────────────────────────────────
const gitStatus = execSync("git status --porcelain", { encoding: "utf-8", cwd: rootDir }).trim();
if (gitStatus) {
  console.error("❌ 工作区有未提交的修改，请先提交或 stash:");
  console.error(gitStatus);
  process.exit(1);
}

let lastTag = "";
try {
  lastTag = execSync("git describe --tags --abbrev=0", { encoding: "utf-8", cwd: rootDir }).trim();
  console.log(`📌 上一个标签: ${lastTag}`);
} catch {
  console.log("📌 未找到历史标签，将使用全部 commit");
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
    if (match && groups[match[1]]) {
      groups[match[1]].push(raw);
    } else {
      groups.other.push(raw);
    }
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
      for (const item of groups[key]) {
        changelog += `- ${item}\n`;
      }
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
console.log(`\n（已保存到 .changelog.md）`);

// ─── 更新配置文件 ──────────────────────────────
const files: Array<{ path: string; label: string }> = [];

// 1. update.json
const updateJsonPath = path.join(rootDir, "update.json");
if (fs.existsSync(updateJsonPath)) {
  const content = JSON.parse(fs.readFileSync(updateJsonPath, "utf-8"));
  content.version = newVersion;
  content.notes = changelogText.split("\n").slice(0, 3).join("；");
  const pubDate = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  content.pub_date = pubDate;
  const platforms = content.platforms || {};
  for (const [key, val] of Object.entries(platforms)) {
    (val as any).url = `https://github.com/yudong22/deepseek-code-public/releases/download/v${newVersion}/deepseek-code_${key === "darwin-aarch64" ? "aarch64" : "x86_64"}.app.tar.gz`;
  }
  fs.writeFileSync(updateJsonPath, JSON.stringify(content, null, 2) + "\n");
  files.push({ path: "update.json", label: "Tauri 更新清单" });
}

// 2. Cargo.toml
const cargoPath = path.join(rootDir, "apps/desktop/src-tauri/Cargo.toml");
if (fs.existsSync(cargoPath)) {
  let cargo = fs.readFileSync(cargoPath, "utf-8");
  cargo = cargo.replace(/^version\s*=\s*".*?"/m, `version = "${newVersion}"`);
  fs.writeFileSync(cargoPath, cargo);
  files.push({ path: "apps/desktop/src-tauri/Cargo.toml", label: "Rust 桌面端版本" });
}

// 3. desktop/package.json
const desktopPkgPath = path.join(rootDir, "apps/desktop/package.json");
if (fs.existsSync(desktopPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(desktopPkgPath, "utf-8"));
  pkg.version = newVersion;
  fs.writeFileSync(desktopPkgPath, JSON.stringify(pkg, null, 2) + "\n");
  files.push({ path: "apps/desktop/package.json", label: "桌面端前端版本" });
}

// 4. client-cli/package.json
const cliPkgPath = path.join(rootDir, "packages/client-cli/package.json");
if (fs.existsSync(cliPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(cliPkgPath, "utf-8"));
  pkg.version = newVersion;
  fs.writeFileSync(cliPkgPath, JSON.stringify(pkg, null, 2) + "\n");
  files.push({ path: "packages/client-cli/package.json", label: "CLI 工具版本" });
}

// 5. sidecar/package.json
const sidecarPkgPath = path.join(rootDir, "packages/sidecar/package.json");
if (fs.existsSync(sidecarPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(sidecarPkgPath, "utf-8"));
  pkg.version = newVersion;
  fs.writeFileSync(sidecarPkgPath, JSON.stringify(pkg, null, 2) + "\n");
  files.push({ path: "packages/sidecar/package.json", label: "Sidecar 版本" });
}

// ─── 输出 ──────────────────────────────────────
console.log(`\n✅ 已更新 ${files.length} 个文件到 v${newVersion}:`);
files.forEach(f => console.log(`   ${f.label} → ${f.path}`));

console.log(`\n▸ 检查更新:   git diff --stat`);
console.log(`▸ 提交:       git commit -m "release: v${newVersion}"`);
console.log(`▸ 打标签:     git tag -a v${newVersion} -m "v${newVersion}"`);
console.log(`▸ 推送:       git push origin main v${newVersion}`);
console.log(`\n⚠️  发布前需要:`);
console.log(`   1. 构建 macOS .app:  bun run build:mac`);
console.log(`   2. 签名 .tar.gz:     tauri sign --private-key ~/.tauri/tauri.key ...`);
console.log(`   3. 填入 update.json signature 字段`);
console.log(`   4. 创建 GitHub Release:`);
console.log(`      gh release create v${newVersion} \\`);
console.log(`        --title "v${newVersion}" \\`);
console.log(`        --notes-file .changelog.md \\`);
console.log(`        target/release/bundle/macos/*.tar.gz target/release/bundle/dmg/*.dmg`);
