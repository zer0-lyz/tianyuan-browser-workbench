#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require(process.argv[1]).productVersion" "$ROOT_DIR/extension/version.json")"
CHROME_VERSION="$(node -p "require(process.argv[1]).chromeVersion" "$ROOT_DIR/extension/version.json")"
BUILD_NUMBER="$(node -p "require(process.argv[1]).buildNumber" "$ROOT_DIR/extension/version.json")"
RELEASE_CHANNEL="$(node -p "require(process.argv[1]).channel" "$ROOT_DIR/extension/version.json")"
SOURCE_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"
SOURCE_DIRTY=false
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  SOURCE_DIRTY=true
fi
RELEASE_DATE="${RELEASE_DATE:-$(TZ=Asia/Shanghai date +%Y%m%d)}"
PACKAGE_NAME="tianyuan-workbench-v${VERSION}-macos-arm64-lite"
WORKBENCH_ROOT="${TIANYUAN_WORKBENCH_ROOT:-$HOME/.tianyuan-workbench}"
BUILD_BASE="${TIANYUAN_RELEASE_BUILD_ROOT:-$WORKBENCH_ROOT/release-builds}"
BUILD_ROOT="$BUILD_BASE/${PACKAGE_NAME}-$(date +%s)"
STAGE="$BUILD_ROOT/$PACKAGE_NAME"
DIST_DIR="${TIANYUAN_RELEASE_OUTPUT_DIR:-$WORKBENCH_ROOT/releases}"
OUTPUT="$DIST_DIR/${PACKAGE_NAME}-${RELEASE_DATE}.zip"
OUTPUT_SHA="$OUTPUT.sha256"
CACHE_DIR="$WORKBENCH_ROOT/release-cache"
WHEEL_CACHE="$CACHE_DIR/python-wheels"
MACOS_PYTHON_TARGETS="${TIANYUAN_MACOS_PYTHON_TARGETS:-39 314}"
PIP_DOWNLOAD_TIMEOUT="${PIP_DOWNLOAD_TIMEOUT:-30}"
PIP_DOWNLOAD_RETRIES="${PIP_DOWNLOAD_RETRIES:-2}"

# 运行指纹统一由 scripts/runtime-fingerprint.mjs 计算，这里只调用封装脚本。
RUNTIME_BUILD_ID="$(node "$ROOT_DIR/scripts/print-runtime-build-id.mjs" "$ROOT_DIR")"

[[ "$(uname -s)" == "Darwin" ]] || { echo "macOS required" >&2; exit 1; }
[[ "$(uname -m)" == "arm64" ]] || { echo "arm64 required" >&2; exit 1; }
mkdir -p "$STAGE/runtime/python-wheels" "$STAGE/scripts" "$DIST_DIR" "$WHEEL_CACHE"

# Keep pure-Python dependencies independent of the builder interpreter. The
# binary lxml wheel is fetched once per supported CPython ABI so a macOS 3.9
# machine is never offered a cp314-only package. Since 0.14.32 the lite
# package itself no longer bundles the ~8.5 MB lxml universal2 wheels: the
# installer reuses the already-installed runtime environment, and only fetches
# a pinned lxml wheel when the local environment is incomplete. The wheels are
# still downloaded here to pin their SHA-256 and to publish them as release
# assets for that fetch path.
python3 -m pip download \
  --quiet \
  --disable-pip-version-check \
  --timeout "$PIP_DOWNLOAD_TIMEOUT" \
  --retries "$PIP_DOWNLOAD_RETRIES" \
  --only-binary=:all: \
  --dest "$WHEEL_CACHE" \
  "openpyxl==3.1.5" \
  "et_xmlfile==2.0.0" \
  "python-docx==1.2.0" \
  "typing_extensions==4.16.0"
for PYTHON_TARGET in $MACOS_PYTHON_TARGETS; do
  python3 -m pip download \
    --quiet \
    --disable-pip-version-check \
    --timeout "$PIP_DOWNLOAD_TIMEOUT" \
    --retries "$PIP_DOWNLOAD_RETRIES" \
    --only-binary=:all: \
    --no-deps \
    --platform macosx_11_0_arm64 \
    --implementation cp \
    --python-version "$PYTHON_TARGET" \
    --abi "cp${PYTHON_TARGET}" \
    --dest "$WHEEL_CACHE" \
    "lxml==6.1.0"
done

/usr/bin/ditto "$ROOT_DIR/extension" "$STAGE/extension"
/usr/bin/ditto "$ROOT_DIR/native-helper" "$STAGE/native-helper"
cat > "$STAGE/native-helper/runtime-compat.json" <<EOF
{
  "version": 2,
  "extensionVersion": "$CHROME_VERSION",
  "bridgeProtocol": "connector-agent-binding-v3",
  "buildId": "2026-07-28-lite-update-source-v2",
  "runtimeBuildId": "$RUNTIME_BUILD_ID",
  "runtimeBuildKind": "release",
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
cp "$STAGE/native-helper/runtime-compat.json" "$STAGE/extension/runtime-compat.json"
/usr/bin/ditto "$ROOT_DIR/skills" "$STAGE/skills"
/usr/bin/ditto "$ROOT_DIR/plugins" "$STAGE/plugins"
cp "$ROOT_DIR/scripts/install-local-runtime.mjs" "$STAGE/scripts/install-local-runtime.mjs"
cp "$ROOT_DIR/scripts/runtime-fingerprint.mjs" "$STAGE/scripts/runtime-fingerprint.mjs"
cp "$ROOT_DIR/scripts/print-runtime-build-id.mjs" "$STAGE/scripts/print-runtime-build-id.mjs"
cp "$WHEEL_CACHE"/openpyxl-3.1.5-*.whl "$WHEEL_CACHE"/et_xmlfile-2.0.0-*.whl "$WHEEL_CACHE"/python_docx-1.2.0-*.whl "$WHEEL_CACHE"/typing_extensions-*.whl "$STAGE/runtime/python-wheels/"

# Publish the pinned lxml wheels next to the package (not inside it) so the
# installer can fetch exactly these bytes when a machine lacks them, and so
# the release channels can carry the same file for SHA-256 verification.
GITEE_RAW_BASE="${TIANYUAN_GITEE_RAW_BASE:-https://gitee.com/zer0_y/tianyuan-browser-workbench-releases/raw/master}"
GITHUB_DOWNLOAD_BASE="${TIANYUAN_GITHUB_DOWNLOAD_BASE:-https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/download/v${VERSION}}"
python3 - "$WHEEL_CACHE" "$MACOS_PYTHON_TARGETS" "$STAGE/runtime/python-wheels/lxml-wheels.json" "$GITEE_RAW_BASE" "$GITHUB_DOWNLOAD_BASE" <<'PY'
import hashlib
import json
import pathlib
import sys

wheel_cache = pathlib.Path(sys.argv[1])
targets = sys.argv[2].split()
output = pathlib.Path(sys.argv[3])
gitee_raw_base = sys.argv[4].rstrip("/")
github_download_base = sys.argv[5].rstrip("/")

entries = []
for target in targets:
    matches = sorted(wheel_cache.glob(f"lxml-6.1.0-cp{target}-cp{target}-macosx_*.whl"))
    if not matches:
        raise SystemExit(f"missing lxml 6.1.0 wheel for cp{target} in wheel cache")
    wheel = matches[-1]
    digest = hashlib.sha256(wheel.read_bytes()).hexdigest()
    entries.append({
        "fileName": wheel.name,
        "pythonTarget": f"cp{target}",
        "size": wheel.stat().st_size,
        "sha256": digest,
        "urls": [
            f"{gitee_raw_base}/{wheel.name}",
            f"{github_download_base}/{wheel.name}",
        ],
    })
output.write_text(json.dumps(entries, indent=2) + "\n")
PY
for PYTHON_TARGET in $MACOS_PYTHON_TARGETS; do
  LXML_WHEEL_FILE="$(ls "$WHEEL_CACHE"/lxml-6.1.0-cp${PYTHON_TARGET}-cp${PYTHON_TARGET}-macosx_*.whl | tail -1)"
  LXML_WHEEL_BASE="$(basename "$LXML_WHEEL_FILE")"
  cp -f "$LXML_WHEEL_FILE" "$DIST_DIR/$LXML_WHEEL_BASE"
  (
    cd "$DIST_DIR"
    /usr/bin/shasum -a 256 "$LXML_WHEEL_BASE" > "$LXML_WHEEL_BASE.sha256"
  )
done
cp "$ROOT_DIR/release/macos-arm64/安装.command" "$STAGE/安装.command"
cp "$ROOT_DIR/release/macos-arm64/卸载.command" "$STAGE/卸载.command"
cp "$ROOT_DIR/release/macos-arm64/安装使用说明.md" "$STAGE/安装使用说明.md"
chmod +x "$STAGE/安装.command" "$STAGE/卸载.command" "$STAGE/native-helper/install_native_host.sh"
find "$STAGE" -type f \( -name ".DS_Store" -o -name "._*" \) -delete
while IFS= read -r -d '' MACOSX_DIR; do
  find "$MACOSX_DIR" -depth -delete
done < <(find "$STAGE" -type d -name "__MACOSX" -print0)

cat > "$STAGE/VERSION.txt" <<EOF
name=天源浏览器工作台
version=$VERSION
platform=macOS-arm64
package_type=lite-update
release_channel=$RELEASE_CHANNEL
build_date=$RELEASE_DATE
build_number=$BUILD_NUMBER
git_commit=$SOURCE_COMMIT
source_dirty=$SOURCE_DIRTY
runtime_build_id=$RUNTIME_BUILD_ID
extension_id=lkflndcnklpeaejohaacoaolnmhgigoc
requires_existing_runtime=true
EOF

(
  cd "$STAGE"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 /usr/bin/shasum -a 256 > SHA256SUMS
)

TEMP_OUTPUT="$BUILD_ROOT/${PACKAGE_NAME}.zip"
python3 "$ROOT_DIR/scripts/create-release-zip.py" "$STAGE" "$TEMP_OUTPUT"
cp -f "$TEMP_OUTPUT" "$OUTPUT"
(
  cd "$DIST_DIR"
  /usr/bin/shasum -a 256 "$(basename "$OUTPUT")" > "$(basename "$OUTPUT_SHA")"
)

echo "$OUTPUT"
echo "$OUTPUT_SHA"
