#!/usr/bin/env bash
# scripts/check-tabs.sh
# 扫描仓库里含 tab 字符的文本文件，命中则 exit 1。
#
# 目的：作为 .editorconfig 的执行守门人。任何文本文件含 tab 字符都视为违规，
#       防止 tab/空格混用导致 Edit 工具匹配失败。
#
# 用法：
#   ./scripts/check-tabs.sh                 # 扫整个仓库
#   ./scripts/check-tabs.sh path/to/dir     # 扫指定目录
#
# 排除：
#   - .git/、node_modules/、target/、dist/、build/ 等构建产物
#   - Makefile（语法要求 tab）
#   - 二进制文件（图片、压缩包、可执行）
#   - 锁文件、签名文件、归档文件

set -euo pipefail

# 默认扫整个仓库根；接受可选路径参数
ROOT="${1:-.}"

# 用 find + grep 检测含 tab 的文件
# -type f：只要文件
# 排除常见构建目录和二进制类型
OFFENDERS=$(find "$ROOT" \
  -type d \( \
    -name '.git' -o \
    -name 'node_modules' -o \
    -name 'target' -o \
    -name 'dist' -o \
    -name 'build' -o \
    -name 'out' -o \
    -name '.next' -o \
    -name '.turbo' -o \
    -name 'binaries' -o \
    -name 'qdrant_data' \
  \) -prune -o \
  -type f \
  ! -name 'Makefile' \
  ! -name '*.lock' \
  ! -name '*.lockb' \
  ! -name '*.sig' \
  ! -name '*.minisig' \
  ! -name '*.tar.gz' \
  ! -name '*.tgz' \
  ! -name '*.dmg' \
  ! -name '*.zip' \
  ! -name '*.png' \
  ! -name '*.jpg' \
  ! -name '*.jpeg' \
  ! -name '*.gif' \
  ! -name '*.icns' \
  ! -name '*.ico' \
  ! -name '*.woff*' \
  ! -name '*.ttf' \
  ! -name '*.pdf' \
  ! -name '*.mp4' \
  ! -name '*.mov' \
  -print0 2>/dev/null \
  | xargs -0 grep -l -P '\t' 2>/dev/null \
  || true)

if [ -z "$OFFENDERS" ]; then
  echo "✅ No tab characters found in text files under $ROOT"
  exit 0
fi

echo "❌ Found tab characters in the following files:"
echo ""
echo "$OFFENDERS" | while read -r f; do
  # 显示每个文件前 3 处 tab 出现的行号
  echo "  $f"
  grep -n -P '\t' "$f" | head -3 | sed 's/^/    /'
  echo ""
done

echo "Fix: replace tabs with spaces (2 or 4 depending on .editorconfig)."
echo "In most editors: select all → run 'Convert Indentation to Spaces'."
exit 1
