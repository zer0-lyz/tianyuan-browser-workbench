#!/bin/bash
set -euo pipefail

HOST_JSON="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tianyuan.workbench.helper.json"
WORKBENCH_ROOT="$HOME/.tianyuan-workbench"
CONNECTOR_ROOT="$HOME/plugins/tianyuan-browser-connector"
CODEX_CONNECTOR_CACHE="$HOME/.codex/plugins/cache/personal/tianyuan-browser-connector"

printf '%s\n' '此操作会删除天源工作台的本机 Helper、扩展运行副本、Connector、Codex Connector 缓存及相关运行环境。'
printf '%s\n' '不会卸载系统中的 Python 或天源 CLI，也不会删除用户导出的 Excel 文件。'
read -r -p '确认卸载？输入 YES 继续：' answer
[[ "$answer" == 'YES' ]] || exit 0

[[ ! -f "$HOST_JSON" ]] || /bin/rm -f "$HOST_JSON"
[[ ! -d "$WORKBENCH_ROOT" ]] || /bin/rm -rf "$WORKBENCH_ROOT"
[[ ! -d "$CONNECTOR_ROOT" ]] || /bin/rm -rf "$CONNECTOR_ROOT"
[[ ! -d "$CODEX_CONNECTOR_CACHE" ]] || /bin/rm -rf "$CODEX_CONNECTOR_CACHE"

printf '\n%s\n' '本机运行文件已删除。'
printf '%s\n' '请在 Chrome 扩展管理页手动移除“天源浏览器工作台”。'
open -a 'Google Chrome' 'chrome://extensions/' || true
read -r -n 1 -p '按任意键关闭此窗口...'
printf '\n'
