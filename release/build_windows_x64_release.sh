#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="0.3.0"
REVISION="r2"
RELEASE_DATE="20260723"
PACKAGE_NAME="天源浏览器工作台-v${VERSION}-Windows-x64-测试版-${REVISION}"
BUILD_ROOT="$ROOT_DIR/release/.build/${PACKAGE_NAME}-$(date +%s)"
STAGE="$BUILD_ROOT/$PACKAGE_NAME"
DIST_DIR="$ROOT_DIR/dist"
OUTPUT="$DIST_DIR/${PACKAGE_NAME}-${RELEASE_DATE}.zip"
OUTPUT_SHA="$OUTPUT.sha256"

CACHE_DIR="$HOME/.tianyuan-workbench/release-cache"
WINDOWS_CACHE="$CACHE_DIR/windows-x64"
WHEEL_CACHE="$CACHE_DIR/python-wheels"
POSTJECT_DIR="$CACHE_DIR/postject"
TYCPV_SOURCE="$HOME/.tianyuan-workbench/dependencies/天源评估系统/tycpv-setup-0.1.0-win-x64.exe"

NODE_VERSION="24.14.0"
NODE_ARCHIVE="$WINDOWS_CACHE/node-v${NODE_VERSION}-win-x64.zip"
NODE_SHASUMS="$WINDOWS_CACHE/SHASUMS256-node-v${NODE_VERSION}.txt"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
NODE_SHASUMS_URL="https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"

PYTHON_VERSION="3.14.6"
PYTHON_ARCHIVE="$WINDOWS_CACHE/python-${PYTHON_VERSION}-embed-amd64.zip"
PYTHON_URL="https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip"

POSTJECT_VERSION="1.0.0-alpha.6"
POSTJECT_BIN="$POSTJECT_DIR/node_modules/.bin/postject"

mkdir -p "$STAGE/runtime/python-portable/Lib/site-packages" \
  "$STAGE/runtime/python-wheels" \
  "$STAGE/native-helper" \
  "$STAGE/skills" \
  "$DIST_DIR" \
  "$WINDOWS_CACHE" \
  "$WHEEL_CACHE"

[[ -f "$TYCPV_SOURCE" ]] || {
  echo "Missing Windows tycpv installer: $TYCPV_SOURCE" >&2
  exit 1
}

if [[ ! -f "$NODE_ARCHIVE" ]]; then
  curl -L --fail --retry 3 --output "$NODE_ARCHIVE" "$NODE_URL"
fi
if [[ ! -f "$NODE_SHASUMS" ]]; then
  curl -L --fail --retry 3 --output "$NODE_SHASUMS" "$NODE_SHASUMS_URL"
fi
NODE_SHA256="$(awk -v name="$(basename "$NODE_ARCHIVE")" '$2 == name { print $1 }' "$NODE_SHASUMS")"
[[ -n "$NODE_SHA256" ]] || {
  echo "Node checksum not found." >&2
  exit 1
}
echo "$NODE_SHA256  $NODE_ARCHIVE" | /usr/bin/shasum -a 256 -c -

if [[ ! -f "$PYTHON_ARCHIVE" ]]; then
  curl -L --fail --retry 3 --output "$PYTHON_ARCHIVE" "$PYTHON_URL"
fi
PYTHON_SHA256="$(/usr/bin/shasum -a 256 "$PYTHON_ARCHIVE" | awk '{ print $1 }')"

python3 -m pip download \
  --disable-pip-version-check \
  --dest "$WHEEL_CACHE" \
  "openpyxl==3.1.5" \
  "et_xmlfile==2.0.0"

if [[ ! -x "$POSTJECT_BIN" ]]; then
  npm install \
    --prefix "$POSTJECT_DIR" \
    --no-audit \
    --no-fund \
    "postject@${POSTJECT_VERSION}"
fi

NODE_UNPACK="$BUILD_ROOT/node"
mkdir -p "$NODE_UNPACK"
/usr/bin/unzip -q "$NODE_ARCHIVE" -d "$NODE_UNPACK"
WINDOWS_NODE="$NODE_UNPACK/node-v${NODE_VERSION}-win-x64/node.exe"
[[ -f "$WINDOWS_NODE" ]] || {
  echo "node.exe not found after extraction." >&2
  exit 1
}

SEA_CONFIG="$BUILD_ROOT/sea-config.json"
SEA_BLOB="$BUILD_ROOT/native-host.blob"
cat > "$SEA_CONFIG" <<EOF
{
  "main": "$ROOT_DIR/native-helper/native_host.js",
  "output": "$SEA_BLOB",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "useCodeCache": false,
  "execArgvExtension": "none"
}
EOF

node --experimental-sea-config "$SEA_CONFIG"
cp "$WINDOWS_NODE" "$STAGE/native-helper/native_host.exe"
"$POSTJECT_BIN" \
  "$STAGE/native-helper/native_host.exe" \
  NODE_SEA_BLOB \
  "$SEA_BLOB" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
cp "$ROOT_DIR/native-helper/native_host.js" "$STAGE/native-helper/native_host.js"

/usr/bin/unzip -q "$PYTHON_ARCHIVE" -d "$STAGE/runtime/python-portable"
for wheel in "$WHEEL_CACHE"/openpyxl-3.1.5-*.whl "$WHEEL_CACHE"/et_xmlfile-2.0.0-*.whl; do
  /usr/bin/unzip -q "$wheel" -d "$STAGE/runtime/python-portable/Lib/site-packages"
  cp "$wheel" "$STAGE/runtime/python-wheels/"
done
cat > "$STAGE/runtime/python-portable/python314._pth" <<'EOF'
python314.zip
.
Lib/site-packages
import site
EOF

/usr/bin/ditto "$ROOT_DIR/extension" "$STAGE/extension"
/usr/bin/ditto "$ROOT_DIR/skills/appraisal-detail-print-format" "$STAGE/skills/appraisal-detail-print-format"
/usr/bin/ditto "$ROOT_DIR/skills/appraisal-declaration-print-format" "$STAGE/skills/appraisal-declaration-print-format"
cp "$TYCPV_SOURCE" "$STAGE/runtime/tycpv-setup-0.1.0-win-x64.exe"

cp "$ROOT_DIR/release/windows-x64/安装.cmd" "$STAGE/安装.cmd"
cp "$ROOT_DIR/release/windows-x64/安装.ps1" "$STAGE/安装.ps1"
cp "$ROOT_DIR/release/windows-x64/卸载.cmd" "$STAGE/卸载.cmd"
cp "$ROOT_DIR/release/windows-x64/卸载.ps1" "$STAGE/卸载.ps1"
cp "$ROOT_DIR/release/windows-x64/安装使用说明.md" "$STAGE/安装使用说明.md"
cp "$ROOT_DIR/release/windows-x64/交给Agent安装.md" "$STAGE/交给Agent安装.md"

cat > "$STAGE/VERSION.txt" <<EOF
name=天源浏览器工作台
version=$VERSION
platform=Windows-x64
release_channel=test
release_revision=$REVISION
build_date=$RELEASE_DATE
git_commit=$(git -C "$ROOT_DIR" rev-parse HEAD)
extension_id=lkflndcnklpeaejohaacoaolnmhgigoc
node_version=$NODE_VERSION
node_sha256=$NODE_SHA256
python_version=$PYTHON_VERSION
python_embed_sha256=$PYTHON_SHA256
tycpv_version=0.1.0
tycpv_sha256=$(/usr/bin/shasum -a 256 "$TYCPV_SOURCE" | awk '{ print $1 }')
postject_version=$POSTJECT_VERSION
EOF

(
  cd "$STAGE"
  find . -type f ! -name SHA256SUMS -print0 \
    | sort -z \
    | xargs -0 /usr/bin/shasum -a 256 > SHA256SUMS
)

TEMP_OUTPUT="$BUILD_ROOT/${PACKAGE_NAME}.zip"
(
  cd "$BUILD_ROOT"
  COPYFILE_DISABLE=1 /usr/bin/zip -X -q -r "$TEMP_OUTPUT" "$PACKAGE_NAME"
)
cp -f "$TEMP_OUTPUT" "$OUTPUT"
/usr/bin/shasum -a 256 "$OUTPUT" > "$OUTPUT_SHA"

echo "$OUTPUT"
echo "$OUTPUT_SHA"
