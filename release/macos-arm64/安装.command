#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKBENCH_ROOT="$HOME/.tianyuan-workbench"
VENV_DIR="$WORKBENCH_ROOT/python"
TYCPV_PKG="$ROOT_DIR/runtime/tycpv-setup-0.1.0-macos-arm64.pkg"
PYTHON_PKG="$ROOT_DIR/runtime/python-3.14.6-macos11.pkg"
PYTHON_BOOTSTRAP="/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"
WHEEL_DIR="$ROOT_DIR/runtime/python-wheels"

# 更新器/浏览器链路下载的压缩包会被 macOS 打上 quarantine 标记，
# 包内 wheel 解包后的二进制会继承该标记，导致 dlopen 被系统策略拒绝。
xattr -dr com.apple.quarantine "$ROOT_DIR" 2>/dev/null || true
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
  local error_code="${4:-}"
  [[ -n "$UPDATE_STATUS_PATH" && -x "$NODE_BIN" ]] || return 0
  "$NODE_BIN" - "$UPDATE_STATUS_PATH" "$phase" "$percent" "$message" "$error_code" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [target, phase, percent, message, errorCode] = process.argv.slice(2);
const normalizedPhase = ["preparing", "stopping_services", "waiting_for_file_release"].includes(phase)
  ? "installing"
  : (phase === "restarting_services" ? "verifying_install" : (phase === "test_complete" ? "complete" : phase));
fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
fs.writeFileSync(target, `${JSON.stringify({
  ok: phase !== "failed",
  action: "workbench_update",
  phase,
  normalizedPhase,
  percent: Number(percent),
  message,
  ...(errorCode ? { errorCode } : {}),
  ...(phase === "failed" ? { currentVersionUnchanged: true, nextAction: "请查看诊断摘要后运行完整安装包或重试" } : {}),
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
  local message="$1"
  local error_code="${message%%:*}"
  [[ "$error_code" == "$message" ]] && error_code="UPDATE_INSTALL_FAILED"
  write_status "failed" 0 "$message" "$error_code"
  echo "安装失败：$1" >&2
  pause
  exit 1
}

python_version() {
  "$1" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")' 2>/dev/null
}

python_can_create_venv() {
  "$1" -c 'import ensurepip, venv' >/dev/null 2>&1
}

python_has_print_dependencies() {
  "$1" -c 'import docx, et_xmlfile, lxml, openpyxl, typing_extensions' >/dev/null 2>&1
}

python_wheels_compatible() {
  "$1" - "$WHEEL_DIR" <<'PY'
import pathlib
import re
import sys

wheel_dir = pathlib.Path(sys.argv[1])
candidate = f"cp{sys.version_info.major}{sys.version_info.minor}"
lxml_wheels = sorted(wheel_dir.glob("lxml-*.whl"))
if not lxml_wheels:
    raise SystemExit(1)

def compatible(name):
    parts = name[:-4].split("-")
    if len(parts) < 5:
        return False
    python_tags = set(parts[-3].split("."))
    abi_tags = set(parts[-2].split("."))
    platform_tags = set(parts[-1].split("."))
    if candidate not in python_tags and "py3" not in python_tags:
        return False
    if candidate not in abi_tags and "abi3" not in abi_tags and "none" not in abi_tags:
        return False
    if "none" in abi_tags:
        return True
    return any(
        tag == "any"
        or "universal2" in tag
        or ("macosx" in tag and "arm64" in tag)
        for tag in platform_tags
    )

raise SystemExit(0 if any(compatible(item.name) for item in lxml_wheels) else 1)
PY
}

configured_python_candidates() {
  local config_path configured
  for config_path in \
    "$WORKBENCH_ROOT/runtime-config.json" \
    "$WORKBENCH_ROOT/native-helper/runtime-config.json"; do
    [[ -f "$config_path" ]] || continue
    configured=""
    if [[ -x "$NODE_BIN" ]]; then
      configured="$($NODE_BIN - "$config_path" <<'NODE'
const fs = require("node:fs");
try {
  const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  process.stdout.write(String(value.pythonBin || value.pythonPath || ""));
} catch {}
NODE
)"
    fi
    [[ -n "$configured" ]] && printf '%s\n' "$configured"
  done
}

select_python_runtime() {
  local candidate version
  # A previously created managed environment is the safest update path. It
  # does not require the system to have the Python version used at build time.
  if [[ -x "$VENV_DIR/bin/python3" ]] \
    && python_has_print_dependencies "$VENV_DIR/bin/python3"; then
    PYTHON_BIN="$VENV_DIR/bin/python3"
    PYTHON_VERSION="$(python_version "$PYTHON_BIN")"
    return 0
  fi

  local -a candidates=()
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] && candidates+=("$candidate")
  done < <(configured_python_candidates)
  if [[ -x "$PYTHON_BOOTSTRAP" ]]; then candidates+=("$PYTHON_BOOTSTRAP"); fi
  candidate="$(command -v python3 || true)"
  [[ -n "$candidate" ]] && candidates+=("$candidate")
  [[ -x "/usr/bin/python3" ]] && candidates+=("/usr/bin/python3")

  local seen=$'\n'
  for candidate in "${candidates[@]}"; do
    [[ -x "$candidate" ]] || continue
    [[ "$seen" == *$'\n'"$candidate"$'\n'* ]] && continue
    seen+="$candidate"$'\n'
    version="$(python_version "$candidate" || true)"
    [[ -n "$version" ]] || continue
    python_can_create_venv "$candidate" || continue
    python_wheels_compatible "$candidate" || continue
    PYTHON_BIN="$candidate"
    PYTHON_VERSION="$version"
    return 0
  done
  return 1
}

if [[ "${TIANYUAN_INSTALLER_SELF_TEST:-0}" == "1" ]]; then
  [[ -n "$PYTHON_BOOTSTRAP" ]]
  echo "installer self-test passed"
  exit 0
fi

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
if ! select_python_runtime; then
  if [[ "$UPDATE_MODE" == "1" ]]; then
    fail "UPDATE_PYTHON_RUNTIME_UNAVAILABLE: 未找到可复用且与包内 lxml wheel ABI 兼容的 Python；当前版本未改变。请先运行完整安装包，或安装带 venv/ensurepip 的 Python 3.9+ 后重试。"
  fi
  [[ -f "$PYTHON_PKG" ]] || fail "缺少 Python 安装包。"
  echo "需要输入当前 Mac 的管理员密码来安装 Python。"
  sudo /usr/sbin/installer -pkg "$PYTHON_PKG" -target / || fail "Python 安装失败。"
  select_python_runtime || fail "UPDATE_PYTHON_RUNTIME_UNAVAILABLE: Python 安装后仍没有与包内 wheel ABI 兼容的运行时。"
fi
echo "使用 Python $PYTHON_VERSION：$PYTHON_BIN"

echo "4/6 准备本机 Python 环境..."
mkdir -p "$WORKBENCH_ROOT"
if [[ ! -x "$VENV_DIR/bin/python3" ]]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR" || fail "无法创建 Python 环境。"
fi
"$VENV_DIR/bin/python3" -m pip install \
  --disable-pip-version-check \
  --no-index \
  --find-links "$WHEEL_DIR" \
  "openpyxl==3.1.5" \
  "et_xmlfile==2.0.0" \
  "python-docx==1.2.0" \
  "lxml==6.1.0" \
  "typing_extensions==4.16.0" || fail "离线安装打印格式依赖失败。"
xattr -dr com.apple.quarantine "$VENV_DIR" 2>/dev/null || true

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
"$VENV_DIR/bin/python3" -c "import docx, lxml, openpyxl; print('openpyxl', openpyxl.__version__)" \
  || fail "表格设置依赖检查失败。"
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
