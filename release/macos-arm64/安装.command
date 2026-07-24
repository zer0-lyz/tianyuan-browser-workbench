#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKBENCH_ROOT="$HOME/.tianyuan-workbench"
APP_ROOT="$HOME/Applications/天源浏览器工作台"
VENV_DIR="$WORKBENCH_ROOT/python"
TYCPV_PKG="$ROOT_DIR/runtime/tycpv-setup-0.1.0-macos-arm64.pkg"
PYTHON_PKG="$ROOT_DIR/runtime/python-3.14.6-macos11.pkg"
WHEEL_DIR="$ROOT_DIR/runtime/python-wheels"

pause() {
  echo
  read -r -n 1 -p "按任意键关闭此窗口..."
  echo
}

fail() {
  echo "安装失败：$1" >&2
  pause
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "此安装包仅支持 macOS。"
[[ "$(uname -m)" == "arm64" ]] || fail "此安装包仅支持 Apple Silicon（M1/M2/M3/M4 等 arm64）。"
[[ -d "/Applications/Google Chrome.app" ]] || fail "未找到 Google Chrome，请先安装 Chrome。"

echo "1/6 校验安装包..."
(
  cd "$ROOT_DIR"
  /usr/bin/shasum -a 256 -c SHA256SUMS
) || fail "安装包校验失败，请重新获取压缩包。"

echo "2/6 安装或检查天源 CLI..."
if [[ ! -x "/usr/local/bin/tycpv" ]]; then
  [[ -f "$TYCPV_PKG" ]] || fail "缺少天源 CLI 安装包。"
  echo "需要输入当前 Mac 的管理员密码来安装天源 CLI。"
  sudo /usr/sbin/installer -pkg "$TYCPV_PKG" -target / || fail "天源 CLI 安装失败。"
fi
"/usr/local/bin/tycpv" --version || fail "天源 CLI 无法运行。"

echo "3/6 安装或检查 Python..."
PYTHON_BOOTSTRAP="/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"
if [[ ! -x "$PYTHON_BOOTSTRAP" ]]; then
  [[ -f "$PYTHON_PKG" ]] || fail "缺少 Python 安装包。"
  echo "需要输入当前 Mac 的管理员密码来安装 Python。"
  sudo /usr/sbin/installer -pkg "$PYTHON_PKG" -target / || fail "Python 安装失败。"
fi
[[ -x "$PYTHON_BOOTSTRAP" ]] || fail "Python 3.14 安装后仍不可用。"

echo "4/6 创建本机 Python 环境..."
mkdir -p "$WORKBENCH_ROOT"
if [[ ! -x "$VENV_DIR/bin/python3" ]]; then
  "$PYTHON_BOOTSTRAP" -m venv "$VENV_DIR" || fail "无法创建 Python 环境。"
fi
"$VENV_DIR/bin/python3" -m pip install \
  --disable-pip-version-check \
  --no-index \
  --find-links "$WHEEL_DIR" \
  "openpyxl==3.1.5" \
  "et_xmlfile==2.0.0" || fail "离线安装 openpyxl 失败。"

echo "5/6 安装扩展运行文件和 Native Host..."
mkdir -p "$APP_ROOT/extension"
/usr/bin/ditto "$ROOT_DIR/extension" "$APP_ROOT/extension"
bash "$ROOT_DIR/native-helper/install_native_host.sh" || fail "Native Host 安装失败。"

echo "6/6 执行环境检查..."
"$VENV_DIR/bin/python3" -c "import openpyxl; print('openpyxl', openpyxl.__version__)" || fail "openpyxl 检查失败。"
[[ -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tianyuan.workbench.helper.json" ]] \
  || fail "Native Host 注册文件未生成。"

echo
echo "安装完成。"
echo "接下来请在 Chrome 中："
echo "1. 打开“开发者模式”；"
echo "2. 点击“加载未打包的扩展程序”；"
echo "3. 选择已经打开的 extension 文件夹；"
echo "4. 打开天源页面，点击扩展图标；"
echo "5. 在“连接配置”中配置 MCP，并完成 CLI 授权。"
echo
echo "扩展目录：$APP_ROOT/extension"

open "$APP_ROOT/extension"
open -a "Google Chrome" "chrome://extensions/"
pause
