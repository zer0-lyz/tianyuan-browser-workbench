#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require(process.argv[1]).productVersion" "$ROOT_DIR/extension/version.json")"
CHROME_VERSION="$(node -p "require(process.argv[1]).chromeVersion" "$ROOT_DIR/extension/version.json")"
BUILD_NUMBER="$(node -p "require(process.argv[1]).buildNumber" "$ROOT_DIR/extension/version.json")"
RELEASE_CHANNEL="$(node -p "require(process.argv[1]).channel" "$ROOT_DIR/extension/version.json")"
RELEASE_DATE="${RELEASE_DATE:-$(TZ=Asia/Shanghai date +%Y%m%d)}"
PACKAGE_SUFFIX=""
if [[ "$RELEASE_CHANNEL" != "stable" ]]; then
  PACKAGE_SUFFIX="-beta"
fi
PACKAGE_NAME="tianyuan-workbench-v${VERSION}-windows-x64-lite${PACKAGE_SUFFIX}"
WORKBENCH_ROOT="${TIANYUAN_WORKBENCH_ROOT:-$HOME/.tianyuan-workbench}"
BUILD_BASE="${TIANYUAN_RELEASE_BUILD_ROOT:-$WORKBENCH_ROOT/release-builds}"
BUILD_ROOT="$BUILD_BASE/${PACKAGE_NAME}-$(date +%s)"
STAGE="$BUILD_ROOT/$PACKAGE_NAME"
DIST_DIR="${TIANYUAN_RELEASE_OUTPUT_DIR:-$WORKBENCH_ROOT/releases}"
OUTPUT="$DIST_DIR/${PACKAGE_NAME}-${RELEASE_DATE}.zip"
OUTPUT_SHA="$OUTPUT.sha256"
WHEEL_CACHE="$WORKBENCH_ROOT/release-cache/python-wheels"
SOURCE_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"
SOURCE_DIRTY=false
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  SOURCE_DIRTY=true
fi

# 运行指纹统一由 scripts/runtime-fingerprint.mjs 计算，这里只调用封装脚本。
RUNTIME_BUILD_ID="$(node "$ROOT_DIR/scripts/print-runtime-build-id.mjs" "$ROOT_DIR")"

mkdir -p "$STAGE/native-helper/platform" "$STAGE/skills" "$STAGE/scripts" "$STAGE/runtime/python-wheels" "$DIST_DIR" "$WHEEL_CACHE"

python3 -m pip download \
  --quiet \
  --disable-pip-version-check \
  --no-deps \
  --dest "$WHEEL_CACHE" \
  "openpyxl==3.1.5" \
  "et_xmlfile==2.0.0" \
  "python-docx==1.2.0" \
  "typing_extensions==4.16.0"
python3 -m pip download \
  --quiet \
  --disable-pip-version-check \
  --only-binary=:all: \
  --platform win_amd64 \
  --python-version 3.14 \
  --implementation cp \
  --abi cp314 \
  --no-deps \
  --dest "$WHEEL_CACHE" \
  "lxml==6.1.0"

/usr/bin/ditto "$ROOT_DIR/native-helper" "$STAGE/native-helper"
cat > "$STAGE/native-helper/runtime-compat.json" <<EOF
{
  "version": 2,
  "extensionVersion": "$CHROME_VERSION",
  "bridgeProtocol": "connector-agent-binding-v3",
  "buildId": "2026-07-28-lite-update-source-v1",
  "runtimeBuildId": "$RUNTIME_BUILD_ID",
  "runtimeBuildKind": "release",
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

/usr/bin/ditto "$ROOT_DIR/extension" "$STAGE/extension"
cp "$STAGE/native-helper/runtime-compat.json" "$STAGE/extension/runtime-compat.json"
/usr/bin/ditto "$ROOT_DIR/skills" "$STAGE/skills"
/usr/bin/ditto "$ROOT_DIR/plugins" "$STAGE/plugins"
cp "$ROOT_DIR/scripts/install-local-runtime.mjs" "$STAGE/scripts/install-local-runtime.mjs"
cp "$ROOT_DIR/scripts/runtime-fingerprint.mjs" "$STAGE/scripts/runtime-fingerprint.mjs"
cp "$ROOT_DIR/scripts/print-runtime-build-id.mjs" "$STAGE/scripts/print-runtime-build-id.mjs"
cp "$WHEEL_CACHE"/openpyxl-3.1.5-*.whl "$WHEEL_CACHE"/et_xmlfile-2.0.0-*.whl "$WHEEL_CACHE"/python_docx-1.2.0-*.whl "$WHEEL_CACHE"/typing_extensions-*.whl "$WHEEL_CACHE"/lxml-6.1.0-*-win_amd64.whl "$STAGE/runtime/python-wheels/"

node "$ROOT_DIR/scripts/prepare-windows-launchers.mjs" \
  "$ROOT_DIR/release/windows-x64" \
  "$STAGE" >/dev/null

find "$STAGE" -type f \( -name ".DS_Store" -o -name "._*" \) -delete
find "$STAGE" -type d -name "__MACOSX" -prune -exec rm -rf {} +

cat > "$STAGE/VERSION.txt" <<EOF
name=天源浏览器工作台
version=$VERSION
platform=Windows-x64
package_type=lite-update
release_channel=$RELEASE_CHANNEL
build_number=$BUILD_NUMBER
build_date=$RELEASE_DATE
git_commit=$SOURCE_COMMIT
source_dirty=$SOURCE_DIRTY
runtime_build_id=$RUNTIME_BUILD_ID
extension_id=lkflndcnklpeaejohaacoaolnmhgigoc
requires_existing_runtime=true
EOF

(
  cd "$STAGE"
  find . -type f ! -name SHA256SUMS -print0 \
    | sort -z \
    | xargs -0 /usr/bin/shasum -a 256 > SHA256SUMS
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
