#!/usr/bin/env bash
# scripts/lint.sh
# 全量 lint 入口：tabs + shellcheck + actionlint
#
# 目的：
# - 唯一 lint 入口，加新语言的 linter 直接在这里加 case
# - 任何 lint 错误 → exit 1
# - 工具不可用 → warning 但 exit 0
#
# 未来扩展（按需在这里加 case）：
# - markdownlint：扫 .md 文件
# - ESLint：扫 .ts / .tsx 文件
# - clippy：跑 cargo clippy（不是文件级，要单独块）
#
# 工作流见 CLAUDE.md「开发流程」节。

set -uo pipefail

FAILED=0
WARNINGS=0

ROOT="${1:-.}"

# ---------- 1. tab 字符（所有文本文件）----------
echo "🔍 [tabs] scanning for tab characters..."
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

if [ -n "$OFFENDERS" ]; then
  echo "❌ [tabs] Found tab characters in:"
  echo "$OFFENDERS" | while read -r f; do
    echo "  $f"
    grep -n -P '\t' "$f" | head -3 | sed 's/^/    /'
    echo ""
  done
  FAILED=1
else
  echo "✅ [tabs] no tab characters"
fi

# ---------- 2. shellcheck（.sh 文件）----------
if command -v shellcheck >/dev/null 2>&1; then
  SH_FILES=$(find "$ROOT" \
    -type d \( -name '.git' -o -name 'node_modules' \) -prune -o \
    -type f -name '*.sh' -print 2>/dev/null)
  if [ -n "$SH_FILES" ]; then
    echo ""
    echo "🔍 [shellcheck] $(echo "$SH_FILES" | wc -l | tr -d ' ') .sh file(s)..."
    SH_FAIL=0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      if ! shellcheck --severity=warning "$f" 2>&1; then
        SH_FAIL=1
      fi
    done <<< "$SH_FILES"
    if [ "$SH_FAIL" -ne 0 ]; then
      echo "❌ [shellcheck] failed"
      FAILED=1
    else
      echo "✅ [shellcheck] passed"
    fi
  else
    echo ""
    echo "⏭  [shellcheck] no .sh files"
  fi
else
  echo ""
  echo "⚠️  [shellcheck] not installed (brew install shellcheck), skipping"
  WARNINGS=$((WARNINGS + 1))
fi

# ---------- 3. actionlint（.github/workflows/*.yml）----------
if command -v actionlint >/dev/null 2>&1; then
  WORKFLOW_FILES=$(find "$ROOT/.github/workflows" -type f -name '*.yml' 2>/dev/null)
  if [ -n "$WORKFLOW_FILES" ]; then
    echo ""
    echo "🔍 [actionlint] $(echo "$WORKFLOW_FILES" | wc -l | tr -d ' ') workflow file(s)..."
    if ! actionlint -ignore 'shellcheck reported issue in this script: SC2086:.+'; then
      echo "❌ [actionlint] failed"
      FAILED=1
    else
      echo "✅ [actionlint] passed"
    fi
  else
    echo ""
    echo "⏭  [actionlint] no workflow files"
  fi
else
  echo ""
  echo "⚠️  [actionlint] not installed (brew install actionlint), skipping"
  WARNINGS=$((WARNINGS + 1))
fi

# ---------- 未来扩展区 ----------
# 加 markdownlint：
# if command -v markdownlint-cli2 >/dev/null 2>&1; then
#   MD_FILES=$(find "$ROOT" -type d \( ... \) -prune -o -type f -name '*.md' -print 2>/dev/null)
#   if [ -n "$MD_FILES" ]; then
#     echo "🔍 [markdownlint] ..."
#     if ! markdownlint-cli2 $MD_FILES; then FAILED=1; fi
#   fi
# fi
#
# 加 ESLint（TypeScript）：
# if command -v eslint >/dev/null 2>&1; then
#   TS_FILES=$(find "$ROOT" ... -name '*.ts' -print 2>/dev/null)
#   ...
# fi

# ---------- 总结 ----------
echo ""
if [ "$FAILED" -ne 0 ]; then
  echo "❌ Lint failed"
  exit 1
fi

if [ "$WARNINGS" -gt 0 ]; then
  echo "⚠️  $WARNINGS linter(s) unavailable, but no errors found"
fi

echo "✅ Lint passed"
