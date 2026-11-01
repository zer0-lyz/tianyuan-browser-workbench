#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
PACKAGE_INSTALLER="$PACKAGE_ROOT/安装.command"

if [[ -f "$PACKAGE_INSTALLER" ]]; then
  exec /bin/bash "$PACKAGE_INSTALLER" "$@"
fi

printf '%s\n' '此兼容入口不会单独复制 Native Host，也不会把运行组件写入隐藏默认目录。' >&2
printf '%s\n' '请解压完整安装包，并运行包根目录中的“安装.command”；更新请从当前工作台触发。' >&2
printf '%s\n' '天源 CLI 是可选组件，不会由此入口自动安装或授权。' >&2
exit 2
