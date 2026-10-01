#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKBENCH_ROOT="$HOME/.tianyuan-workbench"
VENV_DIR="$WORKBENCH_ROOT/python"
TYCPV_PKG="$ROOT_DIR/runtime/tycpv-setup-0.1.0-macos-arm64.pkg"
PYTHON_PKG="$ROOT_DIR/runtime/python-3.14.6-macos11.pkg"
PYTHON_BOOTSTRAP="/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"
WHEEL_DIR="$ROOT_DIR/runtime/python-wheels"
LXML_WHEEL_MANIFEST="$WHEEL_DIR/lxml-wheels.json"

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

python_lxml_wheel_available() {
  # Since 0.14.32 the lite package no longer bundles the ~8.5 MB lxml
  # universal2 wheels. Availability means: the pinned wheel manifest lists a
  # wheel that matches this interpreter's ABI and platform, so step 4 can
  # fetch and verify it when the managed environment is incomplete.
  "$1" - "$LXML_WHEEL_MANIFEST" <<'PY'
import json
import pathlib
import sys

try:
    entries = json.loads(pathlib.Path(sys.argv[1]).read_text())
except Exception:
    raise SystemExit(1)
candidate = f"cp{sys.version_info.major}{sys.version_info.minor}"

def compatible(entry):
    name = str(entry.get("fileName", ""))
    if not name.endswith(".whl"):
        return False
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

urls_ok = all(
    isinstance(entry.get("sha256"), str) and len(entry["sha256"]) == 64 and entry.get("urls")
    for entry in entries
)
raise SystemExit(0 if urls_ok and any(compatible(entry) for entry in entries) else 1)
PY
}

lxml_wheel_field() {
  # Print manifest fields of the first wheel compatible with $1's ABI.
  # "urls" prints one URL per line; other fields print a single value.
  "$1" - "$LXML_WHEEL_MANIFEST" "$2" <<'PY'
import json
import pathlib
import sys

entries = json.loads(pathlib.Path(sys.argv[1]).read_text())
field = sys.argv[2]
candidate = f"cp{sys.version_info.major}{sys.version_info.minor}"

def compatible(entry):
    name = str(entry.get("fileName", ""))
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

for entry in entries:
    if compatible(entry):
        value = entry.get(field)
        if isinstance(value, list):
            for item in value:
                print(item)
        elif value is not None:
            print(value)
        break
PY
}

ensure_lxml_wheel() {
  # Guarantee the pinned lxml wheel for $1's ABI inside the staged wheel dir.
  # Primary channel is the Gitee raw mirror, fallback is the GitHub release
  # asset; both must match the manifest SHA-256 before the file is accepted.
  local venv_python="$1"
  local file_name digest candidate_path url
  file_name="$(lxml_wheel_field "$venv_python" fileName | head -n 1)"
  digest="$(lxml_wheel_field "$venv_python" sha256 | head -n 1)"
  [[ -n "$file_name" && -n "$digest" ]] || return 1
  candidate_path="$WHEEL_DIR/$file_name"
  if [[ -f "$candidate_path" ]] \
    && echo "$digest  $candidate_path" | /usr/bin/shasum -a 256 -c - >/dev/null 2>&1; then
    return 0
  fi
  rm -f "$candidate_path" "$candidate_path.tmp"
  while IFS= read -r url; do
    [[ -n "$url" ]] || continue
    if curl -fsSL --retry 2 --connect-timeout 15 -o "$candidate_path.tmp" "$url" 2>/dev/null \
      && [[ -s "$candidate_path.tmp" ]] \
      && echo "$digest  $candidate_path.tmp" | /usr/bin/shasum -a 256 -c - >/dev/null 2>&1; then
      mv "$candidate_path.tmp" "$candidate_path"
      xattr -dr com.apple.quarantine "$candidate_path" 2>/dev/null || true
      echo "已获取 $file_name（SHA-256 校验通过）。"
      return 0
    fi
    rm -f "$candidate_path.tmp"
  done < <(lxml_wheel_field "$venv_python" urls)
  return 1
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
    python_lxml_wheel_available "$candidate" || continue
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
    fail "UPDATE_PYTHON_RUNTIME_UNAVAILABLE: 未找到可复用的托管运行环境，也没有能创建 venv 且可补齐匹配 lxml 组件的 Python；当前版本未改变。请先运行完整安装包，或安装带 venv/ensurepip 的 Python 3.9+ 后重试。"
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
xattr -dr com.apple.quarantine "$VENV_DIR" 2>/dev/null || true
if python_has_print_dependencies "$VENV_DIR/bin/python3"; then
  # 0.14.32 起轻量更新包不再捆绑 lxml wheel：依赖完整的托管环境直接复用，
  # 不产生任何下载；只有环境不完整时才按固定 SHA-256 补齐缺失组件。
  echo "本机打印格式运行环境完整，直接复用。"
else
  ensure_lxml_wheel "$VENV_DIR/bin/python3" \
    || fail "UPDATE_LXML_WHEEL_UNAVAILABLE: 无法获取与当前 Python 匹配的 lxml 组件（已尝试 Gitee 主通道与 GitHub 备用通道，SHA-256 校验均未通过或下载失败）；当前版本未改变。请检查网络后重试，或使用完整安装包。"
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
fi

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
