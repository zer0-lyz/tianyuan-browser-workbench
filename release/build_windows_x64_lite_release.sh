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

mkdir -p "$STAGE/native-helper/platform" "$STAGE/skills" "$STAGE/scripts" "$DIST_DIR"

cp "$ROOT_DIR/native-helper/native_host.js" "$STAGE/native-helper/native_host.js"
cp "$ROOT_DIR/native-helper/connector_bridge.js" "$STAGE/native-helper/connector_bridge.js"
cp "$ROOT_DIR/native-helper/process_launcher.js" "$STAGE/native-helper/process_launcher.js"
cp "$ROOT_DIR/native-helper/update_checker.js" "$STAGE/native-helper/update_checker.js"
cp "$ROOT_DIR/native-helper/update_installer.js" "$STAGE/native-helper/update_installer.js"
cp "$ROOT_DIR/native-helper/platform/"*.js "$STAGE/native-helper/platform/"
if [[ -f "$ROOT_DIR/native-helper/update-sources.json" ]]; then
  cp "$ROOT_DIR/native-helper/update-sources.json" "$STAGE/native-helper/update-sources.json"
fi
cat > "$STAGE/native-helper/runtime-compat.json" <<EOF
{
  "version": 2,
  "extensionVersion": "$CHROME_VERSION",
  "bridgeProtocol": "connector-agent-binding-v3",
  "buildId": "2026-07-28-lite-update-source-v1",
  "runtimeBuildId": "$RUNTIME_BUILD_ID",
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

/usr/bin/ditto "$ROOT_DIR/extension" "$STAGE/extension"
cp "$STAGE/native-helper/runtime-compat.json" "$STAGE/extension/runtime-compat.json"
/usr/bin/ditto "$ROOT_DIR/skills" "$STAGE/skills"
/usr/bin/ditto "$ROOT_DIR/plugins" "$STAGE/plugins"
cp "$ROOT_DIR/scripts/install-local-runtime.mjs" "$STAGE/scripts/install-local-runtime.mjs"

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
