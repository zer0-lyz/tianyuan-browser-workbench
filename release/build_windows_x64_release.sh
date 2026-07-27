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
  PACKAGE_SUFFIX="-测试版"
fi
PACKAGE_NAME="天源浏览器工作台-v${VERSION}-Windows-x64${PACKAGE_SUFFIX}"
WORKBENCH_ROOT="${TIANYUAN_WORKBENCH_ROOT:-$HOME/.tianyuan-workbench}"
BUILD_BASE="${TIANYUAN_RELEASE_BUILD_ROOT:-$WORKBENCH_ROOT/release-builds}"
BUILD_ROOT="$BUILD_BASE/${PACKAGE_NAME}-$(date +%s)"
STAGE="$BUILD_ROOT/$PACKAGE_NAME"
DIST_DIR="${TIANYUAN_RELEASE_OUTPUT_DIR:-$WORKBENCH_ROOT/releases}"
OUTPUT="$DIST_DIR/${PACKAGE_NAME}-${RELEASE_DATE}.zip"
OUTPUT_SHA="$OUTPUT.sha256"

CACHE_DIR="$WORKBENCH_ROOT/release-cache"
WINDOWS_CACHE="$CACHE_DIR/windows-x64"
WHEEL_CACHE="$CACHE_DIR/python-wheels"
POSTJECT_DIR="$CACHE_DIR/postject"
TYCPV_SOURCE="$WORKBENCH_ROOT/dependencies/天源评估系统/tycpv-setup-0.1.0-win-x64.exe"

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
SOURCE_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"
SOURCE_DIRTY=false
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  SOURCE_DIRTY=true
fi

RUNTIME_BUILD_ID="$(node - "$ROOT_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const root = process.argv[2];
const roots = [
  "extension",
  "native-helper",
  "plugins/tianyuan-browser-connector",
  "scripts/install-local-runtime.mjs",
];
const files = [];
for (const relativeRoot of roots) {
  const absoluteRoot = path.join(root, relativeRoot);
  const stats = fs.statSync(absoluteRoot);
  if (stats.isFile()) {
    files.push(relativeRoot);
    continue;
  }
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".DS_Store" || entry.name.startsWith("._") || entry.name === "runtime-compat.json") continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(path.relative(root, absolutePath));
    }
  };
  visit(absoluteRoot);
}
const hash = createHash("sha256");
for (const relativePath of files.sort()) {
  hash.update(relativePath);
  hash.update("\0");
  hash.update(fs.readFileSync(path.join(root, relativePath)));
  hash.update("\0");
}
process.stdout.write(hash.digest("hex"));
NODE
)"

mkdir -p "$STAGE/runtime/python-portable/Lib/site-packages" \
  "$STAGE/runtime/python-wheels" \
  "$STAGE/runtime/node" \
  "$STAGE/native-helper/platform" \
  "$STAGE/skills" \
  "$STAGE/scripts" \
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
cp "$WINDOWS_NODE" "$STAGE/runtime/node/node.exe"
"$POSTJECT_BIN" \
  "$STAGE/native-helper/native_host.exe" \
  NODE_SEA_BLOB \
  "$SEA_BLOB" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
cp "$ROOT_DIR/native-helper/native_host.js" "$STAGE/native-helper/native_host.js"
cp "$ROOT_DIR/native-helper/connector_bridge.js" "$STAGE/native-helper/connector_bridge.js"
cp "$ROOT_DIR/native-helper/process_launcher.js" "$STAGE/native-helper/process_launcher.js"
cp "$ROOT_DIR/native-helper/update_checker.js" "$STAGE/native-helper/update_checker.js"
cp "$ROOT_DIR/native-helper/update_installer.js" "$STAGE/native-helper/update_installer.js"
cp "$ROOT_DIR/native-helper/platform/"*.js "$STAGE/native-helper/platform/"
cat > "$STAGE/native-helper/runtime-compat.json" <<EOF
{
  "version": 2,
  "extensionVersion": "$CHROME_VERSION",
  "bridgeProtocol": "connector-agent-binding-v3",
  "buildId": "2026-07-24-browser-contract-v2-capability-matrix",
  "runtimeBuildId": "$RUNTIME_BUILD_ID",
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

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
cp "$STAGE/native-helper/runtime-compat.json" "$STAGE/extension/runtime-compat.json"
/usr/bin/ditto "$ROOT_DIR/skills" "$STAGE/skills"
/usr/bin/ditto "$ROOT_DIR/plugins" "$STAGE/plugins"
cp "$ROOT_DIR/scripts/install-local-runtime.mjs" "$STAGE/scripts/install-local-runtime.mjs"
cp "$TYCPV_SOURCE" "$STAGE/runtime/tycpv-setup-0.1.0-win-x64.exe"

node "$ROOT_DIR/scripts/prepare-windows-launchers.mjs" \
  "$ROOT_DIR/release/windows-x64" \
  "$STAGE" >/dev/null
cp "$ROOT_DIR/release/windows-x64/安装使用说明.md" "$STAGE/安装使用说明.md"
cp "$ROOT_DIR/release/windows-x64/交给Agent安装.md" "$STAGE/AGENT_INSTALL_PROMPT.md"

find "$STAGE" -type f \( -name ".DS_Store" -o -name "._*" \) -delete
find "$STAGE" -type d -name "__MACOSX" -prune -exec rm -rf {} +

cat > "$STAGE/VERSION.txt" <<EOF
name=天源浏览器工作台
version=$VERSION
platform=Windows-x64
release_channel=$RELEASE_CHANNEL
build_number=$BUILD_NUMBER
build_date=$RELEASE_DATE
git_commit=$SOURCE_COMMIT
source_dirty=$SOURCE_DIRTY
runtime_build_id=$RUNTIME_BUILD_ID
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
(
  cd "$DIST_DIR"
  /usr/bin/shasum -a 256 "$(basename "$OUTPUT")" > "$(basename "$OUTPUT_SHA")"
)

echo "$OUTPUT"
echo "$OUTPUT_SHA"
