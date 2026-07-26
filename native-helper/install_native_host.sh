#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST_SCRIPT="$ROOT_DIR/native-helper/native_host.js"
HOST_NAME="com.tianyuan.workbench.helper"
EXTENSION_ID="lkflndcnklpeaejohaacoaolnmhgigoc"
LEGACY_EXTENSION_ID="fdbllnmaaklkcmoacoapbibiggnndkfpa"
HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_JSON="$HOST_DIR/$HOST_NAME.json"
INSTALL_DIR="$HOME/.tianyuan-workbench/native-helper"
INSTALLED_HOST_SCRIPT="$INSTALL_DIR/native_host.js"
INSTALLED_SERVER_SCRIPT="$INSTALL_DIR/server.js"
INSTALLED_CONNECTOR_SCRIPT="$INSTALL_DIR/connector_bridge.js"
INSTALLED_UPDATE_CHECKER="$INSTALL_DIR/update_checker.js"
INSTALLED_PLATFORM_DIR="$INSTALL_DIR/platform"
INSTALLED_RUNTIME_COMPAT="$INSTALL_DIR/runtime-compat.json"
HOST_LAUNCHER="$INSTALL_DIR/native_host_launcher.sh"
SERVER_LAUNCHER="$INSTALL_DIR/server_launcher.sh"
HOST_LOG="$INSTALL_DIR/native_host.log"
SERVER_LOG="$INSTALL_DIR/server.log"
PRINT_SKILLS_DIR="$HOME/.tianyuan-workbench/dependencies/天源评估系统/print-format-skills"
NODE_BIN="$(command -v node || true)"
TYCPV_NODE="/Library/Application Support/tycpv/node"
WORKBENCH_PYTHON="$HOME/.tianyuan-workbench/python/bin/python3"
PYTHON_BIN="$(command -v python3 || true)"

if [[ -z "$NODE_BIN" && -x "$TYCPV_NODE" ]]; then
  NODE_BIN="$TYCPV_NODE"
fi
if [[ -x "$WORKBENCH_PYTHON" ]]; then
  PYTHON_BIN="$WORKBENCH_PYTHON"
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Node.js not found. Install tycpv or Node.js first." >&2
  exit 1
fi
if [[ -z "$PYTHON_BIN" || ! -x "$PYTHON_BIN" ]]; then
  echo "Python 3 not found. Install Python 3 first." >&2
  exit 1
fi

mkdir -p "$HOST_DIR"
mkdir -p "$INSTALL_DIR"
mkdir -p "$PRINT_SKILLS_DIR/appraisal-detail-print-format/scripts"
mkdir -p "$PRINT_SKILLS_DIR/appraisal-declaration-print-format/scripts"
chmod +x "$HOST_SCRIPT"
cp "$HOST_SCRIPT" "$INSTALLED_HOST_SCRIPT"
cp "$ROOT_DIR/native-helper/server.js" "$INSTALLED_SERVER_SCRIPT"
cp "$ROOT_DIR/native-helper/connector_bridge.js" "$INSTALLED_CONNECTOR_SCRIPT"
cp "$ROOT_DIR/native-helper/update_checker.js" "$INSTALLED_UPDATE_CHECKER"
rm -rf "$INSTALLED_PLATFORM_DIR"
cp -R "$ROOT_DIR/native-helper/platform" "$INSTALLED_PLATFORM_DIR"
if [[ -f "$ROOT_DIR/native-helper/runtime-compat.json" ]]; then
  cp "$ROOT_DIR/native-helper/runtime-compat.json" "$INSTALLED_RUNTIME_COMPAT"
fi
cp "$ROOT_DIR/skills/appraisal-detail-print-format/SKILL.md" "$PRINT_SKILLS_DIR/appraisal-detail-print-format/SKILL.md"
cp "$ROOT_DIR/skills/appraisal-detail-print-format/scripts/adjust_appraisal_detail_print.py" "$PRINT_SKILLS_DIR/appraisal-detail-print-format/scripts/adjust_appraisal_detail_print.py"
cp "$ROOT_DIR/skills/appraisal-declaration-print-format/SKILL.md" "$PRINT_SKILLS_DIR/appraisal-declaration-print-format/SKILL.md"
cp "$ROOT_DIR/skills/appraisal-declaration-print-format/scripts/adjust_appraisal_declaration_print.py" "$PRINT_SKILLS_DIR/appraisal-declaration-print-format/scripts/adjust_appraisal_declaration_print.py"
chmod +x "$INSTALLED_HOST_SCRIPT"
chmod +x "$INSTALLED_SERVER_SCRIPT"

SELF_TEST_OUTPUT="$(
  TIANYUAN_PYTHON_BIN="$PYTHON_BIN" \
  TIANYUAN_PRINT_SKILLS_DIR="$PRINT_SKILLS_DIR" \
  "$NODE_BIN" "$INSTALLED_HOST_SCRIPT" --self-test
)" || {
  echo "Native Host self-test failed: $SELF_TEST_OUTPUT" >&2
  exit 1
}
echo "$SELF_TEST_OUTPUT" | "$PYTHON_BIN" -c '
import json
import sys

payload = json.load(sys.stdin)
adapter = payload.get("platformAdapter") or {}
if not payload.get("ok") or not adapter.get("supported"):
    raise SystemExit("Native Host platform adapter self-test failed")
print("Native Host self-test:", adapter.get("id"), adapter.get("credentialStore"), adapter.get("filePicker"))
'

cat > "$HOST_LAUNCHER" <<SH
#!/bin/bash
echo "\$(date '+%Y-%m-%d %H:%M:%S') start native host" >> "$HOST_LOG"
export TIANYUAN_PYTHON_BIN="$PYTHON_BIN"
exec "$NODE_BIN" "$INSTALLED_HOST_SCRIPT" 2>> "$HOST_LOG"
SH
chmod +x "$HOST_LAUNCHER"

cat > "$SERVER_LAUNCHER" <<SH
#!/bin/bash
echo "\$(date '+%Y-%m-%d %H:%M:%S') start helper server" >> "$SERVER_LOG"
exec "$NODE_BIN" "$INSTALLED_SERVER_SCRIPT" 2>> "$SERVER_LOG"
SH
chmod +x "$SERVER_LAUNCHER"

"$PYTHON_BIN" - <<PY
import json
from pathlib import Path

path = Path("$HOST_JSON")
payload = {
    "name": "$HOST_NAME",
    "description": "Tianyuan Browser Workbench native helper",
    "path": "$HOST_LAUNCHER",
    "type": "stdio",
    "allowed_origins": [
        "chrome-extension://$EXTENSION_ID/",
        "chrome-extension://$LEGACY_EXTENSION_ID/"
    ],
}
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
print(path)
PY

echo "Native host installed for extension IDs: $EXTENSION_ID, $LEGACY_EXTENSION_ID"
echo "Local runtime installed at: $INSTALL_DIR"
