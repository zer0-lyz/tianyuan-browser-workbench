#!/bin/bash
set -euo pipefail

HOST_JSON="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tianyuan.workbench.helper.json"
WORKBENCH_ROOT="$HOME/.tianyuan-workbench"
APP_ROOT="$HOME/Applications/天源浏览器工作台"

echo "此操作会删除天源工作台的本机 Helper、Python 环境、打印格式运行脚本和扩展文件。"
echo "不会卸载系统中的 Python 或天源 CLI，也不会删除用户导出的 Excel 文件。"
read -r -p "确认卸载？输入 YES 继续：" answer
[[ "$answer" == "YES" ]] || exit 0

[[ ! -f "$HOST_JSON" ]] || /bin/rm -f "$HOST_JSON"
[[ ! -d "$WORKBENCH_ROOT/native-helper" ]] || /bin/rm -rf "$WORKBENCH_ROOT/native-helper"
[[ ! -d "$WORKBENCH_ROOT/python" ]] || /bin/rm -rf "$WORKBENCH_ROOT/python"
[[ ! -d "$WORKBENCH_ROOT/dependencies/天源评估系统/print-format-skills" ]] \
  || /bin/rm -rf "$WORKBENCH_ROOT/dependencies/天源评估系统/print-format-skills"
[[ ! -d "$APP_ROOT" ]] || /bin/rm -rf "$APP_ROOT"

echo
echo "本机运行文件已删除。"
echo "请在 Chrome 扩展管理页手动移除“天源浏览器工作台”。"
open -a "Google Chrome" "chrome://extensions/" || true
read -r -n 1 -p "按任意键关闭此窗口..."
echo
