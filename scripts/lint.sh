#!/usr/bin/env bash
# scripts/lint.sh
# 全量 lint 入口：tabs + shellcheck + actionlint
#
# 目的：
# - 本地完整检查入口（首次接入、定期体检）
# - CI 不直接跑这个，跑 lint:diff 增量版（避免历史问题 block PR）
#
# 依赖：
#   - shellcheck（brew install shellcheck）
#   - actionlint（brew install actionlint）
#
# 失败策略：
#   - 工具不可用 → warning 但 exit 0
#   - 真实 lint 错误 → exit 1

set -euo pipefail

# 先跑 tabs
bash "$(dirname "$0")/check-tabs.sh"

# 再跑增量版（diff 模式下扫不到任何文件时是 OK 的）
# 传 --all 给 lint-diff，让它跑全量
bash "$(dirname "$0")/lint-diff.sh" --all
