#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="0.3.0"
RELEASE_DATE="20260723"
PACKAGE_NAME="天源浏览器工作台-v${VERSION}-macOS-Apple芯片"
BUILD_ROOT="$ROOT_DIR/release/.build/${PACKAGE_NAME}-$(date +%s)"
STAGE="$BUILD_ROOT/$PACKAGE_NAME"
DIST_DIR="$ROOT_DIR/dist"
OUTPUT="$DIST_DIR/${PACKAGE_NAME}-${RELEASE_DATE}.zip"
OUTPUT_SHA="$OUTPUT.sha256"
CACHE_DIR="$HOME/.tianyuan-workbench/release-cache"
TYCPV_SOURCE="$HOME/.tianyuan-workbench/dependencies/天源评估系统/tycpv-setup-0.1.0-macos-arm64.pkg"
PYTHON_PKG="$CACHE_DIR/python-3.14.6-macos11.pkg"
PYTHON_URL="https://www.python.org/ftp/python/3.14.6/python-3.14.6-macos11.pkg"
PYTHON_SHA256="d3c9fff52214847e4fab03e9eaf53dd2a8e51e3534aa0b61f201b749f86bef28"
WHEEL_CACHE="$CACHE_DIR/python-wheels"

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

cat > "$STAGE/VERSION.txt" <<EOF
name=天源浏览器工作台
version=$VERSION
platform=macOS-arm64
build_date=$RELEASE_DATE
git_commit=$(git -C "$ROOT_DIR" rev-parse HEAD)
extension_id=lkflndcnklpeaejohaacoaolnmhgigoc
EOF

(
  cd "$STAGE"
  find . -type f ! -name SHA256SUMS -print0 \
    | sort -z \
    | xargs -0 /usr/bin/shasum -a 256 > SHA256SUMS
)

/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$STAGE" "$OUTPUT"
/usr/bin/shasum -a 256 "$OUTPUT" > "$OUTPUT_SHA"

echo "$OUTPUT"
echo "$OUTPUT_SHA"
