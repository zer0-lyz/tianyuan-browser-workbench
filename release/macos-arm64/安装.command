#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
UPDATE_MODE="${TIANYUAN_UPDATE_MODE:-0}"
if [[ -f "$ROOT_DIR/VERSION.txt" ]] && /usr/bin/grep -q '^package_type=lite-update$' "$ROOT_DIR/VERSION.txt"; then
  UPDATE_MODE="1"
fi
UPDATE_STATUS_PATH="${TIANYUAN_UPDATE_STATUS_PATH:-}"
RUNTIME_LAYOUT="${TIANYUAN_RUNTIME_LAYOUT:-}"
INSTALL_ROOT="${TIANYUAN_INSTALL_ROOT:-}"
NODE_BIN="${TIANYUAN_NODE_BIN:-}"
BUNDLED_NODE="$ROOT_DIR/runtime/node/node"
if [[ ! -x "$NODE_BIN" && -x "$BUNDLED_NODE" ]]; then NODE_BIN="$BUNDLED_NODE"; fi
if [[ ! -x "$NODE_BIN" && -n "$INSTALL_ROOT" ]]; then
  for existing_node in "$INSTALL_ROOT/workbench-runtime/native-helper/node/node" "$INSTALL_ROOT/native-helper/node/node"; do
    if [[ -x "$existing_node" ]]; then NODE_BIN="$existing_node"; break; fi
  done
fi
if [[ ! -x "$NODE_BIN" ]]; then NODE_BIN="$(command -v node || true)"; fi
ROOT_SETUP_ERROR=""
INSTALL_REPORT_PATH=""
INSTALL_RESULT=""
EXTENSION_PATH=""
CLI_BIN=""
CLI_VERSION=""
CLI_STATUS="未检查"
CLI_MESSAGE=""

if [[ -z "$INSTALL_ROOT" && "$UPDATE_MODE" == "1" ]]; then
  CONFIG_CANDIDATES=(
    "$HOME/.tianyuan-workbench/workbench-runtime/native-helper/runtime-config.json"
    "$HOME/.tianyuan-workbench/native-helper/runtime-config.json"
  )
  CONFIGURED_ROOTS=()
  for config_path in "${CONFIG_CANDIDATES[@]}"; do
    [[ -f "$config_path" ]] || continue
    if [[ -x "$NODE_BIN" ]]; then
      config_result="$("$NODE_BIN" - "$config_path" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
try {
  const configPath = process.argv[2];
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const helperRoot = path.dirname(configPath);
  const inferredVisibleRoot = path.dirname(path.dirname(helperRoot));
  const inferredLegacyRoot = path.dirname(helperRoot);
  const layout = String(config.layout || (configPath.includes("/workbench-runtime/") ? "visible-root-v1" : "legacy-hidden"));
  const root = String(config.installRoot || (layout === "visible-root-v1" ? inferredVisibleRoot : inferredLegacyRoot));
  process.stdout.write(`${path.resolve(root)}\t${layout}`);
} catch {}
NODE
)"
      [[ -n "$config_result" ]] && CONFIGURED_ROOTS+=("$config_result")
    else
      ROOT_SETUP_ERROR="LITE_INSTALL_ROOT_UNKNOWN: 无法读取已安装目录配置，请从当前工作台触发更新。"
    fi
  done
  if [[ ${#CONFIGURED_ROOTS[@]} -eq 1 ]]; then
    IFS=$'\t' read -r INSTALL_ROOT RUNTIME_LAYOUT <<<"${CONFIGURED_ROOTS[0]}"
  elif [[ ${#CONFIGURED_ROOTS[@]} -gt 1 ]]; then
    ROOT_SETUP_ERROR="INSTALL_ROOT_AMBIGUOUS: 找到多个工作台目录，请从当前工作台触发更新。"
  elif [[ -z "$ROOT_SETUP_ERROR" ]]; then
    ROOT_SETUP_ERROR="LITE_INSTALL_ROOT_UNKNOWN: 无法确认当前已安装目录，请从当前工作台触发更新或使用完整安装包。"
  fi
fi

if [[ -z "$INSTALL_ROOT" && "$UPDATE_MODE" != "1" ]]; then
  INSTALL_ROOT="$ROOT_DIR"
  RUNTIME_LAYOUT="visible-root-v1"
fi
if [[ -z "$RUNTIME_LAYOUT" ]]; then
  if [[ "$UPDATE_MODE" == "1" ]]; then
    if [[ -f "$INSTALL_ROOT/workbench-runtime/native-helper/runtime-config.json" ]]; then
      RUNTIME_LAYOUT="visible-root-v1"
    elif [[ -f "$INSTALL_ROOT/native-helper/runtime-config.json" ]]; then
      RUNTIME_LAYOUT="legacy-hidden"
    else
      ROOT_SETUP_ERROR="INSTALL_ROOT_LAYOUT_UNKNOWN: 无法确认指定目录的运行布局，不会回退到其他目录。"
    fi
  else
    RUNTIME_LAYOUT="visible-root-v1"
  fi
fi
if [[ -z "$RUNTIME_LAYOUT" && "$UPDATE_MODE" != "1" ]]; then RUNTIME_LAYOUT="visible-root-v1"; fi
if [[ "$RUNTIME_LAYOUT" == "visible-root-v1" ]]; then
  WORKBENCH_ROOT="$INSTALL_ROOT/workbench-runtime"
else
  WORKBENCH_ROOT="$INSTALL_ROOT"
fi
VENV_DIR="$WORKBENCH_ROOT/python"
PYTHON_PKG="$ROOT_DIR/runtime/python-3.14.6-macos11.pkg"
PYTHON_BOOTSTRAP="/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"
WHEEL_DIR="$ROOT_DIR/runtime/python-wheels"
LXML_WHEEL_MANIFEST="$WHEEL_DIR/lxml-wheels.json"

# 更新器/浏览器链路下载的压缩包会被 macOS 打上 quarantine 标记，
# 包内 wheel 解包后的二进制会继承该标记，导致 dlopen 被系统策略拒绝。
xattr -dr com.apple.quarantine "$ROOT_DIR" 2>/dev/null || true
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
  if declare -F write_install_report >/dev/null; then
    write_install_report "failed" >/dev/null 2>&1 || true
  fi
  write_status "failed" 0 "$message" "$error_code"
  echo "安装失败：$1" >&2
  if [[ -n "${INSTALL_REPORT_PATH:-}" ]]; then
    echo "机器可读安装结果：$INSTALL_REPORT_PATH" >&2
  fi
  pause
  exit 1
}

probe_cli() {
  local candidate="$1"
  "$NODE_BIN" - "$candidate" <<'NODE'
const { spawn } = require("node:child_process");
let child;
let timedOut = false;
let output = "";
let killTimer = null;
const terminateGroup = (signal) => {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); } catch {
    try { child.kill(signal); } catch {}
  }
};
try {
  child = spawn(process.argv[2], ["--version"], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch {
  process.exit(1);
}
const collect = (chunk) => { output = `${output}${chunk}`.slice(-8192); };
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", collect);
child.stderr.on("data", collect);
const timer = setTimeout(() => {
  timedOut = true;
  terminateGroup("SIGTERM");
  killTimer = setTimeout(() => terminateGroup("SIGKILL"), 300);
}, 5000);
child.once("error", () => {
  clearTimeout(timer);
  process.exitCode = 1;
});
child.once("close", (code) => {
  clearTimeout(timer);
  if (killTimer) clearTimeout(killTimer);
  if (timedOut || code !== 0) {
    process.exitCode = 1;
    return;
  }
  const line = String(output).trim().split(/\r?\n/, 1)[0].slice(0, 160);
  process.stdout.write(line || "可用");
});
NODE
}

write_install_report() {
  local requested_status="$1"
  local report_root="$INSTALL_ROOT"
  if [[ -z "$report_root" ]]; then
    [[ "$requested_status" == "failed" ]] || return 1
    report_root="${TMPDIR:-/tmp}/tianyuan-workbench-install-failure-$$"
  fi
  local report_path="$report_root/安装检查结果.json"
  INSTALL_REPORT_PATH="$report_path"
  mkdir -p "$report_root" || return 1
  if [[ ! -x "$NODE_BIN" || ! -f "$ROOT_DIR/extension/version.json" ]]; then
    [[ "$requested_status" == "failed" ]] || return 1
    printf '%s\n' '{"product":"天源浏览器工作台","status":"failed","allComponentsReady":false,"readinessScope":"required-components-only","optionalDependencies":{"cli":{"required":false,"status":"not_checked"}},"security":{"credentialsReturned":false,"tokenUsed":false,"secretsWritten":false}}' > "$report_path"
    return 0
  fi
  printf '%s' "${INSTALL_RESULT:-}" | "$NODE_BIN" -e '
const fs = require("node:fs");
const path = require("node:path");
const [reportPath, installRoot, extensionPathInput, runtimeRoot, pythonBin, nodeBin, cliBin, cliVersion, cliStatus, cliMessage, updateMode, pythonDependenciesOk, productRoot, requestedStatus] = process.argv.slice(1);
let install = {};
try { install = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch {}
const version = JSON.parse(fs.readFileSync(path.join(productRoot, "extension", "version.json"), "utf8"));
const extensionPath = String(install.extensionPath || extensionPathInput || path.join(installRoot, "extension"));
const managedNodeBin = String(install.nodeRuntimePath || "");
const nativeHelper = path.join(runtimeRoot, "native-helper");
const hostManifestPath = path.join(process.env.HOME || "", "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", "com.tianyuan.workbench.helper.json");
let hostManifest = {};
try { hostManifest = JSON.parse(fs.readFileSync(hostManifestPath, "utf8")); } catch {}
const components = {
  extension: fs.existsSync(path.join(extensionPath, "manifest.json")),
  nativeHelper: fs.existsSync(path.join(nativeHelper, "native_host.js")) && fs.existsSync(path.join(nativeHelper, "runtime-config.json")),
  nativeMessagingChrome: Boolean(hostManifest.path && fs.existsSync(hostManifest.path)),
  connector: Boolean(install.connector?.ok && install.connector?.connector?.ok),
  codexPluginCache: Boolean(install.codexConnectorCachePath && fs.existsSync(install.codexConnectorCachePath)),
  python: fs.existsSync(pythonBin),
  pythonDependencies: pythonDependenciesOk === "1",
  node: Boolean(managedNodeBin && fs.existsSync(managedNodeBin)),
  runtimeCompatibility: Boolean(install.runtimeCompatibility?.runtimeBuildId),
  selfTest: install.selfTest?.ok === true,
};
const allComponentsReady = Object.values(components).every(Boolean);
const status = requestedStatus === "success" && allComponentsReady ? "success" : "failed";
const report = {
  product: "天源浏览器工作台",
  status,
  allComponentsReady,
  readinessScope: "required-components-only",
  installation: { status, mode: updateMode === "1" ? "upgrade" : "full" },
  version: String(version.productVersion || "unknown"),
  buildNumber: String(version.buildNumber || "unknown"),
  platform: "macOS-arm64",
  paths: {
    installRoot: installRoot || null,
    extension: extensionPath,
    nativeHelper,
    nativeMessagingManifest: hostManifestPath,
    connector: String(install.connectorPath || ""),
    codexConnectorCache: String(install.codexConnectorCachePath || ""),
    python: pythonBin,
    node: managedNodeBin || null,
    cli: cliBin || null,
  },
  components,
  optionalDependencies: {
    cli: {
      required: false,
      status: cliBin ? "available" : (cliStatus === "未检查" ? "not_checked" : "unavailable"),
      path: cliBin || null,
      version: cliVersion || null,
      message: cliMessage || "",
    },
  },
  warnings: cliMessage ? [cliMessage] : [],
  manualActions: [
    "在浏览器扩展管理页手动加载 paths.extension；保持安装目录完整。",
    ...(!cliBin ? ["如需 CLI 相关导出，请从天源官方渠道单独安装或修复 CLI 后重新检查。"] : []),
  ],
  runtimeBuildId: String(install.runtimeCompatibility?.runtimeBuildId || ""),
  security: { credentialsReturned: false, tokenUsed: false, secretsWritten: false },
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(status);
if (!allComponentsReady && requestedStatus === "success") process.exitCode = 1;
' "$report_path" "$INSTALL_ROOT" "${EXTENSION_PATH:-}" "$WORKBENCH_ROOT" "$VENV_DIR/bin/python3" "$NODE_BIN" "$CLI_BIN" "$CLI_VERSION" "$CLI_STATUS" "$CLI_MESSAGE" "$UPDATE_MODE" "${TIANYUAN_PYTHON_DEPENDENCIES_OK:-0}" "$ROOT_DIR" "$requested_status"
}

python_version() {
  "$1" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")' 2>/dev/null
}

python_can_create_venv() {
  "$1" -c 'import ensurepip, venv' >/dev/null 2>&1
}

python_has_print_dependencies() {
  "$1" -c 'import requests, urllib3, certifi, charset_normalizer, idna, docx, et_xmlfile, lxml, openpyxl, typing_extensions' >/dev/null 2>&1
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

verify_package_checksums() {
  local line expected relative
  while IFS= read -r line; do
    [[ "$line" =~ ^([0-9a-fA-F]{64})\ \ \./(.+)$ ]] || continue
    expected="${BASH_REMATCH[1]}"
    relative="${BASH_REMATCH[2]}"
    if [[ "$relative" == "extension/runtime-compat.json" || "$relative" == "native-helper/runtime-compat.json" ]]; then
      continue
    fi
    printf '%s  ./%s\n' "$expected" "$relative" | /usr/bin/shasum -a 256 -c - >/dev/null
  done < "$ROOT_DIR/SHA256SUMS"

  "$NODE_BIN" - "$ROOT_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const version = JSON.parse(fs.readFileSync(path.join(root, "extension/version.json"), "utf8"));
const packageInfo = fs.readFileSync(path.join(root, "VERSION.txt"), "utf8");
const checksums = fs.readFileSync(path.join(root, "SHA256SUMS"), "utf8");
const runtimeBuildId = packageInfo.match(/^runtime_build_id=([0-9a-f]{64})$/m)?.[1];
if (!runtimeBuildId) throw new Error("VERSION.txt 缺少 runtime_build_id");
for (const relative of ["extension/runtime-compat.json", "native-helper/runtime-compat.json"]) {
  const checksumLine = checksums.split(/\r?\n/).find((line) => line.endsWith(`  ./${relative}`));
  if (!checksumLine || !/^[0-9a-fA-F]{64}  \.\//.test(checksumLine)) {
    throw new Error(`SHA256SUMS 缺少文件：${relative}`);
  }
  const compatibility = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  if (compatibility.version !== 2 ||
      compatibility.extensionVersion !== version.chromeVersion ||
      compatibility.bridgeProtocol !== version.bridgeProtocol ||
      compatibility.runtimeBuildId !== runtimeBuildId) {
    throw new Error(`运行时兼容信息与安装包不匹配：${relative}`);
  }
}
NODE
}

[[ -z "$ROOT_SETUP_ERROR" ]] || fail "$ROOT_SETUP_ERROR"
[[ -n "$INSTALL_ROOT" ]] || fail "INSTALL_ROOT_UNKNOWN: 未能确认安装目录，不会写入临时下载目录或隐藏默认目录。"
[[ -x "$NODE_BIN" ]] || fail "未找到可用的 Node.js 运行时。完整包提供固定版本 Node；轻量更新需要复用当前安装的 Node。"
mkdir -p "$INSTALL_ROOT" || fail "INSTALL_ROOT_UNAVAILABLE: 无法创建指定安装目录；没有回退到其他目录。"
INSTALL_ROOT="$(cd "$INSTALL_ROOT" 2>/dev/null && pwd -P)" \
  || fail "INSTALL_ROOT_UNAVAILABLE: 指定安装目录无法访问；没有回退到其他目录。"
INSTALL_ROOT_PROBE="$(/usr/bin/mktemp "$INSTALL_ROOT/.tianyuan-write-test.XXXXXXXX")" \
  || fail "INSTALL_ROOT_UNAVAILABLE: 指定安装目录不可写；没有回退到其他目录。"
/bin/rm -f "$INSTALL_ROOT_PROBE" \
  || fail "INSTALL_ROOT_UNAVAILABLE: 无法清理安装目录写入探测文件；没有回退到其他目录。"

[[ "$(uname -s)" == "Darwin" ]] || fail "此安装包仅支持 macOS。"
[[ "$(uname -m)" == "arm64" ]] || fail "此安装包仅支持 Apple Silicon。"
[[ -d "/Applications/Google Chrome.app" ]] || fail "未找到 Google Chrome，请先安装 Chrome。"

echo "1/6 校验安装包..."
write_status "installing" 83 "正在校验完整安装包"
(
  cd "$ROOT_DIR"
  verify_package_checksums
) || fail "安装包校验失败，请重新获取压缩包。"

echo "2/6 检查可选天源 CLI..."
CLI_BIN=""
CLI_VERSION=""
CLI_STATUS="可用"
CLI_MESSAGE=""
CLI_CANDIDATES=("${TYCPV_BIN:-}" "/usr/local/bin/tycpv" "/opt/homebrew/bin/tycpv" "$(command -v tycpv || true)")
for candidate in "${CLI_CANDIDATES[@]}"; do
  [[ -n "$candidate" && -x "$candidate" ]] || continue
  if CLI_VERSION="$(probe_cli "$candidate" 2>/dev/null)" && [[ -n "$CLI_VERSION" ]]; then
    CLI_BIN="$candidate"
    break
  fi
done
if [[ -n "$CLI_BIN" ]]; then
  echo "检测到可运行的天源 CLI：$CLI_VERSION（可选组件，由用户单独维护）。"
else
  CLI_STATUS="未安装/不可用（可选组件）"
  CLI_MESSAGE="天源 CLI 未安装或无法运行。请从天源官方渠道单独安装或修复后重新检查；无需先做登录授权。CLI 只影响 CLI 相关导出。"
  echo "$CLI_MESSAGE" >&2
fi

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
    "typing_extensions==4.16.0" \
    "requests==2.32.5" \
    "urllib3==2.6.3" \
    "certifi==2026.10.23" \
    "charset-normalizer==3.5.2" \
    "idna==3.20" || fail "离线安装打印格式依赖失败。"
  xattr -dr com.apple.quarantine "$VENV_DIR" 2>/dev/null || true
fi

echo "5/6 同步扩展、Helper、Bridge 和 Connector..."
write_status "installing" 88 "正在同步全部工作台组件"
export TIANYUAN_PYTHON_BIN="$VENV_DIR/bin/python3"
export TIANYUAN_NODE_BIN="$NODE_BIN"
export TIANYUAN_BUNDLED_NODE_SOURCE="$NODE_BIN"
export TIANYUAN_INSTALL_ROOT="$INSTALL_ROOT"
export TIANYUAN_RUNTIME_LAYOUT="$RUNTIME_LAYOUT"
if [[ "$RUNTIME_LAYOUT" == "visible-root-v1" ]]; then
  export TIANYUAN_PROJECT_RUNTIME_ROOT="$INSTALL_ROOT"
else
  export TIANYUAN_PROJECT_RUNTIME_ROOT="$INSTALL_ROOT/projects/天源评估系统"
fi
export TIANYUAN_NATIVE_RUNTIME_ROOT="$WORKBENCH_ROOT/native-helper"
export TIANYUAN_PRINT_SKILLS_ROOT="$WORKBENCH_ROOT/print-format-skills"
if [[ -n "$CLI_BIN" ]]; then export TYCPV_BIN="$CLI_BIN"; else unset TYCPV_BIN; fi
export TIANYUAN_UPDATE_DEFER_COMPLETE=1
INSTALL_RESULT="$("$NODE_BIN" "$ROOT_DIR/scripts/install-local-runtime.mjs")" \
  || fail "本机运行组件同步失败。"

EXTENSION_PATH="$("$NODE_BIN" -e '
const input = require("node:fs").readFileSync(0, "utf8");
process.stdout.write(JSON.parse(input).extensionPath || "");
' <<<"$INSTALL_RESULT")"
[[ -d "$EXTENSION_PATH" ]] || fail "安装完成后未找到浏览器扩展目录。"

echo "6/6 完成环境检查..."
"$VENV_DIR/bin/python3" -c "import requests, urllib3, certifi, charset_normalizer, idna, docx, et_xmlfile, lxml, openpyxl, typing_extensions; print('openpyxl', openpyxl.__version__)" \
  || fail "表格设置依赖检查失败。"
export TIANYUAN_PYTHON_DEPENDENCIES_OK=1
[[ -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tianyuan.workbench.helper.json" ]] \
  || fail "Native Host 注册文件未生成。"
write_install_report "success" >/dev/null \
  || fail "REQUIRED_COMPONENT_VALIDATION_FAILED: 扩展、Native Host、Connector、Codex 缓存、Node、Python 或运行指纹核验未通过。"
write_status "complete" 100 "工作台核心组件更新完成，浏览器扩展可重新加载"

echo
echo "工作台核心组件安装完成。"
echo "扩展目录：$EXTENSION_PATH"
echo "安装根目录：$INSTALL_ROOT"
echo "运行时目录：$WORKBENCH_ROOT"
echo "安装检查结果：$INSTALL_REPORT_PATH"
echo "Connector：$HOME/plugins/tianyuan-browser-connector"
echo "Codex 缓存：$HOME/.codex/plugins/cache/personal/tianyuan-browser-connector"
echo "天源 CLI 状态：$CLI_STATUS"
if [[ -n "$CLI_MESSAGE" ]]; then echo "$CLI_MESSAGE"; fi
echo "请在浏览器扩展管理页手动加载上述 extension 目录；保持安装目录完整，移动或删除会影响运行。"

pause
