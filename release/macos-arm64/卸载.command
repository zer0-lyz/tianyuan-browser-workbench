#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
HOST_JSON="${TIANYUAN_HOST_MANIFEST_PATH:-$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tianyuan.workbench.helper.json}"
INSTALL_ROOT="${TIANYUAN_INSTALL_ROOT:-}"
RUNTIME_LAYOUT="${TIANYUAN_RUNTIME_LAYOUT:-}"
PACKAGE_RUNTIME_CONFIG=""
NODE_BIN="${TIANYUAN_NODE_BIN:-}"
if [[ -z "$NODE_BIN" && -x "$ROOT_DIR/runtime/node/node" ]]; then NODE_BIN="$ROOT_DIR/runtime/node/node"; fi
if [[ -z "$NODE_BIN" && -x "$ROOT_DIR/workbench-runtime/native-helper/node/node" ]]; then NODE_BIN="$ROOT_DIR/workbench-runtime/native-helper/node/node"; fi
if [[ -z "$NODE_BIN" ]]; then NODE_BIN="$(command -v node || true)"; fi

read_runtime_config() {
  local config_path="$1"
  [[ -f "$config_path" && -x "$NODE_BIN" ]] || return 1
  "$NODE_BIN" - "$config_path" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
try {
  const configPath = path.resolve(process.argv[2]);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const helperRoot = path.dirname(configPath);
  const visible = config.layout === "visible-root-v1" || configPath.includes(`${path.sep}workbench-runtime${path.sep}`);
  const inferredRoot = visible ? path.dirname(path.dirname(helperRoot)) : path.dirname(helperRoot);
  const root = path.resolve(String(config.installRoot || inferredRoot));
  const layout = visible ? "visible-root-v1" : "legacy-hidden";
  process.stdout.write(`${root}\t${layout}`);
} catch {
  process.exitCode = 1;
}
NODE
}

if [[ -z "$INSTALL_ROOT" && -f "$ROOT_DIR/workbench-runtime/native-helper/runtime-config.json" ]]; then
  PACKAGE_RUNTIME_CONFIG="$ROOT_DIR/workbench-runtime/native-helper/runtime-config.json"
  config_result="$(read_runtime_config "$PACKAGE_RUNTIME_CONFIG" || true)"
  if [[ -n "$config_result" ]]; then IFS=$'\t' read -r INSTALL_ROOT RUNTIME_LAYOUT <<<"$config_result"; fi
fi
if [[ -z "$INSTALL_ROOT" && -f "$ROOT_DIR/native-helper/runtime-config.json" ]]; then
  PACKAGE_RUNTIME_CONFIG="$ROOT_DIR/native-helper/runtime-config.json"
  config_result="$(read_runtime_config "$PACKAGE_RUNTIME_CONFIG" || true)"
  if [[ -n "$config_result" ]]; then IFS=$'\t' read -r INSTALL_ROOT RUNTIME_LAYOUT <<<"$config_result"; fi
fi
if [[ -z "$INSTALL_ROOT" ]]; then
  printf '%s\n' '此目录未安装，未删除任何文件。请从已安装的工作台目录运行“卸载.command”，或显式设置 TIANYUAN_INSTALL_ROOT。' >&2
  exit 2
fi
INSTALL_ROOT="$(cd "$INSTALL_ROOT" 2>/dev/null && pwd -P)" || {
  printf '%s\n' '安装根目录不存在或无法访问；没有删除任何文件。' >&2
  exit 2
}
if [[ -n "$PACKAGE_RUNTIME_CONFIG" && "$INSTALL_ROOT" != "$ROOT_DIR" ]]; then
  printf '%s\n' '当前目录中的运行配置未指向此目录；为保护其他安装，没有删除任何文件。' >&2
  exit 2
fi
[[ -n "$INSTALL_ROOT" && "$INSTALL_ROOT" != "/" && "$INSTALL_ROOT" != "$HOME" ]] || {
  printf '%s\n' '安装根目录不安全；没有删除任何文件。' >&2
  exit 2
}

if [[ -z "$RUNTIME_LAYOUT" ]]; then
  if [[ -f "$INSTALL_ROOT/workbench-runtime/native-helper/runtime-config.json" ]]; then
    RUNTIME_LAYOUT="visible-root-v1"
  elif [[ -f "$INSTALL_ROOT/native-helper/runtime-config.json" ]]; then
    RUNTIME_LAYOUT="legacy-hidden"
  else
    printf '%s\n' '指定目录没有可核验的工作台运行配置；没有删除任何文件。' >&2
    exit 2
  fi
fi

if [[ "$RUNTIME_LAYOUT" == "visible-root-v1" ]]; then
  NATIVE_HELPER_ROOT="$INSTALL_ROOT/workbench-runtime/native-helper"
  MANAGED_PATHS=("$INSTALL_ROOT/workbench-runtime")
elif [[ "$RUNTIME_LAYOUT" == "legacy-hidden" ]]; then
  NATIVE_HELPER_ROOT="$INSTALL_ROOT/native-helper"
  MANAGED_PATHS=(
    "$INSTALL_ROOT/native-helper"
    "$INSTALL_ROOT/python"
    "$INSTALL_ROOT/print-format-skills"
    "$INSTALL_ROOT/projects/天源评估系统/extension"
  )
else
  printf '%s\n' '运行配置中的布局不受支持；没有删除任何文件。' >&2
  exit 2
fi
CONFIG_PATH="$NATIVE_HELPER_ROOT/runtime-config.json"
[[ -f "$CONFIG_PATH" ]] || {
  printf '%s\n' '目标目录缺少运行配置；没有删除任何文件。' >&2
  exit 2
}
config_result="$(read_runtime_config "$CONFIG_PATH" || true)"
configured_root=""
configured_layout=""
if [[ -n "$config_result" ]]; then IFS=$'\t' read -r configured_root configured_layout <<<"$config_result"; fi
[[ "$configured_root" == "$INSTALL_ROOT" && "$configured_layout" == "$RUNTIME_LAYOUT" ]] || {
  printf '%s\n' '运行配置与目标安装根不一致；没有删除任何文件。' >&2
  exit 2
}

HOST_MATCHES=false
if [[ -f "$HOST_JSON" && -x "$NODE_BIN" ]]; then
  HOST_TARGET="$("$NODE_BIN" - "$HOST_JSON" <<'NODE'
const fs = require("node:fs");
try {
  const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  process.stdout.write(String(manifest.path || ""));
} catch {}
NODE
)"
  if [[ -n "$HOST_TARGET" && "$HOST_TARGET" == "$NATIVE_HELPER_ROOT/native_host_launcher.sh" ]]; then HOST_MATCHES=true; fi
fi
if [[ "$HOST_MATCHES" != true ]]; then
  printf '%s\n' '当前 Chrome Native Messaging 注册没有指向此安装目录；为保护其他安装，没有删除任何文件。' >&2
  exit 2
fi
for managed_path in "${MANAGED_PATHS[@]}"; do
  case "$managed_path" in
    "$INSTALL_ROOT"/*) ;;
    *) printf '%s\n' "拒绝处理安装根以外的路径：$managed_path" >&2; exit 3 ;;
  esac
  parent_path="$(dirname "$managed_path")"
  while [[ "$parent_path" != "$INSTALL_ROOT" ]]; do
    [[ "$parent_path" == "$INSTALL_ROOT"/* && ! -L "$parent_path" ]] || {
      printf '%s\n' "受管目录的父路径含符号链接或越界：$parent_path；没有删除任何文件。" >&2
      exit 3
    }
    parent_path="$(dirname "$parent_path")"
  done
done

printf '%s\n' "将清理安装根“$INSTALL_ROOT”内受工作台管理的运行副本，并移除此安装对应的 Chrome Native Messaging 注册。"
printf '%s\n' '浏览器扩展源码、共享 Connector/Codex 缓存、系统 Python、天源 CLI 和用户文件会保留。'
read -r -p '确认卸载？输入 YES 继续：' answer
[[ "$answer" == 'YES' ]] || exit 0

/bin/rm -f "$HOST_JSON"
for managed_path in "${MANAGED_PATHS[@]}"; do
  [[ -e "$managed_path" || -L "$managed_path" ]] || continue
  if [[ -L "$managed_path" ]]; then /bin/rm -f "$managed_path"; else /bin/rm -rf "$managed_path"; fi
done

printf '\n%s\n' '本次安装对应的本机运行文件已清理。'
printf '%s\n' '请在 Chrome 扩展管理页手动移除“天源浏览器工作台”。'
open -a 'Google Chrome' 'chrome://extensions/' || true
read -r -n 1 -p '按任意键关闭此窗口...'
printf '\n'
