#!/usr/bin/env bun
/**
 * 版本号同步脚本
 * 用法: bun run scripts/bump-version.ts <new-version>
 * 示例: bun run scripts/bump-version.ts 0.4.1
 *
 * 更新所有需要修改版本号的配置文件:
 * 1. update.json      — Tauri 自动更新清单
 * 2. Cargo.toml        — Rust 桌面端版本
 * 3. desktop/package.json — 桌面端前端版本
 * 4. client-cli/package.json — CLI 工具版本
 * 5. sidecar/package.json — Sidecar 版本
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const rootDir = path.resolve(__dirname, "..");
const newVersion = process.argv[2]?.replace(/^v/, "");

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error("用法: bun run scripts/bump-version.ts <semver>");
  console.error("示例: bun run scripts/bump-version.ts 0.4.1");
  process.exit(1);
}

const files: Array<{ path: string; label: string }> = [];

// 1. update.json
const updateJsonPath = path.join(rootDir, "update.json");
if (fs.existsSync(updateJsonPath)) {
  const content = JSON.parse(fs.readFileSync(updateJsonPath, "utf-8"));
  content.version = newVersion;
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

console.log(`\n✅ 已更新 ${files.length} 个文件到 v${newVersion}:`);
files.forEach(f => console.log(`   ${f.label} → ${f.path}`));
console.log(`\n▸ 检查更新: git diff --stat`);
console.log(`▸ 提交:     git commit -m "release: v${newVersion}"`);
console.log(`▸ 打标签:   git tag v${newVersion}`);
console.log(`▸ 推送:     git push origin main v${newVersion}`);
console.log(`\n⚠️  注意: 发布前需要:`);
console.log(`   1. 构建: bun run build:mac`);
console.log(`   2. 签名: tauri sign --private-key ~/.tauri/tauri.key ...`);
console.log(`   3. 更新 update.json 中的 signature`);
console.log(`   4. 在 GitHub 创建 Release`);
