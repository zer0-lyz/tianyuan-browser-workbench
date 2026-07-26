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
PACKAGE_NAME="天源浏览器工作台-v${VERSION}-macOS-Apple芯片"
WORKBENCH_ROOT="${TIANYUAN_WORKBENCH_ROOT:-$HOME/.tianyuan-workbench}"
BUILD_BASE="${TIANYUAN_RELEASE_BUILD_ROOT:-$WORKBENCH_ROOT/release-builds}"
BUILD_ROOT="$BUILD_BASE/${PACKAGE_NAME}-$(date +%s)"
STAGE="$BUILD_ROOT/$PACKAGE_NAME"
DIST_DIR="${TIANYUAN_RELEASE_OUTPUT_DIR:-$WORKBENCH_ROOT/releases}"
OUTPUT="$DIST_DIR/${PACKAGE_NAME}-${RELEASE_DATE}.zip"
OUTPUT_SHA="$OUTPUT.sha256"
CACHE_DIR="$WORKBENCH_ROOT/release-cache"
TYCPV_SOURCE="$WORKBENCH_ROOT/dependencies/天源评估系统/tycpv-setup-0.1.0-macos-arm64.pkg"
PYTHON_PKG="$CACHE_DIR/python-3.14.6-macos11.pkg"
PYTHON_URL="https://www.python.org/ftp/python/3.14.6/python-3.14.6-macos11.pkg"
PYTHON_SHA256="d3c9fff52214847e4fab03e9eaf53dd2a8e51e3534aa0b61f201b749f86bef28"
WHEEL_CACHE="$CACHE_DIR/python-wheels"

RUNTIME_BUILD_ID="$(node - "$ROOT_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const root = process.argv[2];
const roots = ["extension", "native-helper", "plugins/tianyuan-browser-connector", "scripts/install-local-runtime.mjs"];
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

[[ "$(uname -s)" == "Darwin" ]] || { echo "macOS required" >&2; exit 1; }
[[ "$(uname -m)" == "arm64" ]] || { echo "arm64 required" >&2; exit 1; }
[[ -f "$TYCPV_SOURCE" ]] || { echo "Missing tycpv pkg: $TYCPV_SOURCE" >&2; exit 1; }

mkdir -p "$STAGE/runtime/python-wheels" "$DIST_DIR" "$CACHE_DIR" "$WHEEL_CACHE"

if [[ ! -f "$PYTHON_PKG" ]]; then
  curl -L --fail --output "$PYTHON_PKG" "$PYTHON_URL"
fi
echo "$PYTHON_SHA256  $PYTHON_PKG" | /usr/bin/shasum -a 256 -c -

python3 -m pip download \
  --disable-pip-version-check \
  --dest "$WHEEL_CACHE" \
  "openpyxl==3.1.5" \
  "et_xmlfile==2.0.0"

/usr/bin/ditto "$ROOT_DIR/extension" "$STAGE/extension"
/usr/bin/ditto "$ROOT_DIR/native-helper" "$STAGE/native-helper"
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
cp "$STAGE/native-helper/runtime-compat.json" "$STAGE/extension/runtime-compat.json"
mkdir -p "$STAGE/skills"
/usr/bin/ditto "$ROOT_DIR/skills/appraisal-detail-print-format" "$STAGE/skills/appraisal-detail-print-format"
/usr/bin/ditto "$ROOT_DIR/skills/appraisal-declaration-print-format" "$STAGE/skills/appraisal-declaration-print-format"
cp "$TYCPV_SOURCE" "$STAGE/runtime/tycpv-setup-0.1.0-macos-arm64.pkg"
cp "$PYTHON_PKG" "$STAGE/runtime/python-3.14.6-macos11.pkg"
cp "$WHEEL_CACHE"/*.whl "$STAGE/runtime/python-wheels/"
cp "$ROOT_DIR/release/macos-arm64/安装.command" "$STAGE/安装.command"
cp "$ROOT_DIR/release/macos-arm64/卸载.command" "$STAGE/卸载.command"
cp "$ROOT_DIR/release/macos-arm64/安装使用说明.md" "$STAGE/安装使用说明.md"
chmod +x "$STAGE/安装.command" "$STAGE/卸载.command" "$STAGE/native-helper/install_native_host.sh"
find "$STAGE" -type f \( -name ".DS_Store" -o -name "._*" \) -delete
find "$STAGE" -type d -name "__MACOSX" -prune -exec rm -rf {} +

cat > "$STAGE/VERSION.txt" <<EOF
name=天源浏览器工作台
version=$VERSION
platform=macOS-arm64
release_channel=$RELEASE_CHANNEL
build_date=$RELEASE_DATE
build_number=$BUILD_NUMBER
git_commit=$SOURCE_COMMIT
source_dirty=$SOURCE_DIRTY
runtime_build_id=$RUNTIME_BUILD_ID
extension_id=lkflndcnklpeaejohaacoaolnmhgigoc
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
