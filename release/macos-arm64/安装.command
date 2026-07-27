#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKBENCH_ROOT="$HOME/.tianyuan-workbench"
VENV_DIR="$WORKBENCH_ROOT/python"
TYCPV_PKG="$ROOT_DIR/runtime/tycpv-setup-0.1.0-macos-arm64.pkg"
PYTHON_PKG="$ROOT_DIR/runtime/python-3.14.6-macos11.pkg"
WHEEL_DIR="$ROOT_DIR/runtime/python-wheels"
UPDATE_MODE="${TIANYUAN_UPDATE_MODE:-0}"
UPDATE_STATUS_PATH="${TIANYUAN_UPDATE_STATUS_PATH:-}"
NODE_BIN="$(command -v node || true)"
TYCPV_NODE="/Library/Application Support/tycpv/node"

if [[ -z "$NODE_BIN" && -x "$TYCPV_NODE" ]]; then
  NODE_BIN="$TYCPV_NODE"
fi

write_status() {
  local phase="$1"
  local percent="$2"
  local message="$3"
  [[ -n "$UPDATE_STATUS_PATH" && -x "$NODE_BIN" ]] || return 0
  "$NODE_BIN" - "$UPDATE_STATUS_PATH" "$phase" "$percent" "$message" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [target, phase, percent, message] = process.argv.slice(2);
fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
fs.writeFileSync(target, `${JSON.stringify({
  ok: phase !== "failed",
  action: "workbench_update",
  phase,
  percent: Number(percent),
  message,
  updatedAt: new Date().toISOString(),
  security: { credentialsReturned: false, tokenUsed: false },
}, null, 2)}\n`, { mode: 0o600 });
NODE
}

pause() {
  [[ "$UPDATE_MODE" == "1" ]] && return 0
  echo
  read -r -n 1 -p "按任意键关闭此窗口..."
  echo
}

fail() {
  write_status "failed" 0 "$1"
  echo "安装失败：$1" >&2
  pause
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "此安装包仅支持 macOS。"
[[ "$(uname -m)" == "arm64" ]] || fail "此安装包仅支持 Apple Silicon。"
[[ -d "/Applications/Google Chrome.app" ]] || fail "未找到 Google Chrome，请先安装 Chrome。"

echo "1/6 校验安装包..."
write_status "installing" 83 "正在校验完整安装包"
(
  cd "$ROOT_DIR"
  /usr/bin/shasum -a 256 -c SHA256SUMS
) || fail "安装包校验失败，请重新获取压缩包。"

echo "2/6 安装或检查天源 CLI..."
if [[ ! -x "/usr/local/bin/tycpv" ]]; then
  [[ "$UPDATE_MODE" != "1" ]] || fail "本机缺少天源 CLI，请手动运行安装包完成首次安装。"
  [[ -f "$TYCPV_PKG" ]] || fail "缺少天源 CLI 安装包。"
  echo "需要输入当前 Mac 的管理员密码来安装天源 CLI。"
  sudo /usr/sbin/installer -pkg "$TYCPV_PKG" -target / || fail "天源 CLI 安装失败。"
fi
"/usr/local/bin/tycpv" --version || fail "天源 CLI 无法运行。"

if [[ -z "$NODE_BIN" && -x "$TYCPV_NODE" ]]; then
  NODE_BIN="$TYCPV_NODE"
fi
[[ -x "$NODE_BIN" ]] || fail "未找到 Node.js 运行时。"

echo "3/6 安装或检查 Python..."
PYTHON_BOOTSTRAP="/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"
if [[ ! -x "$PYTHON_BOOTSTRAP" ]]; then
  [[ "$UPDATE_MODE" != "1" ]] || fail "本机缺少 Python，请手动运行安装包完成首次安装。"
  [[ -f "$PYTHON_PKG" ]] || fail "缺少 Python 安装包。"
  echo "需要输入当前 Mac 的管理员密码来安装 Python。"
  sudo /usr/sbin/installer -pkg "$PYTHON_PKG" -target / || fail "Python 安装失败。"
fi
[[ -x "$PYTHON_BOOTSTRAP" ]] || fail "Python 3.14 安装后仍不可用。"

echo "4/6 准备本机 Python 环境..."
mkdir -p "$WORKBENCH_ROOT"
if [[ ! -x "$VENV_DIR/bin/python3" ]]; then
  "$PYTHON_BOOTSTRAP" -m venv "$VENV_DIR" || fail "无法创建 Python 环境。"
fi
"$VENV_DIR/bin/python3" -m pip install \
  --disable-pip-version-check \
  --no-index \
  --find-links "$WHEEL_DIR" \
  "openpyxl==3.1.5" \
  "et_xmlfile==2.0.0" || fail "离线安装打印格式依赖失败。"

echo "5/6 同步扩展、Helper、Bridge 和 Connector..."
write_status "installing" 88 "正在同步全部工作台组件"
export TIANYUAN_PYTHON_BIN="$VENV_DIR/bin/python3"
export TIANYUAN_NODE_BIN="$NODE_BIN"
export TIANYUAN_UPDATE_DEFER_COMPLETE=1
INSTALL_RESULT="$("$NODE_BIN" "$ROOT_DIR/scripts/install-local-runtime.mjs")" \
  || fail "本机运行组件同步失败。"

EXTENSION_PATH="$("$NODE_BIN" -e '
const input = require("node:fs").readFileSync(0, "utf8");
process.stdout.write(JSON.parse(input).extensionPath || "");
' <<<"$INSTALL_RESULT")"
[[ -d "$EXTENSION_PATH" ]] || fail "安装完成后未找到浏览器扩展目录。"

echo "6/6 完成环境检查..."
"$VENV_DIR/bin/python3" -c "import openpyxl; print('openpyxl', openpyxl.__version__)" \
  || fail "openpyxl 检查失败。"
[[ -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tianyuan.workbench.helper.json" ]] \
  || fail "Native Host 注册文件未生成。"
write_status "complete" 100 "全部组件更新完成，浏览器扩展可重新加载"

echo
echo "安装完成。"
echo "扩展目录：$EXTENSION_PATH"
echo "Connector：$HOME/plugins/tianyuan-browser-connector"
echo "Codex 缓存：$HOME/.codex/plugins/cache/personal/tianyuan-browser-connector"

if [[ "$UPDATE_MODE" != "1" ]]; then
  open "$EXTENSION_PATH"
  open -a "Google Chrome" "chrome://extensions/"
fi
pause
