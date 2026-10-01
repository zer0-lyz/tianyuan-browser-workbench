"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const installer = fs.readFileSync(
  path.join(repoRoot, "release", "macos-arm64", "安装.command"),
  "utf8",
);
const liteBuilder = fs.readFileSync(
  path.join(repoRoot, "release", "build_macos_arm64_lite_release.sh"),
  "utf8",
);
const fullBuilder = fs.readFileSync(
  path.join(repoRoot, "release", "build_macos_arm64_release.sh"),
  "utf8",
);
const macosAdapter = fs.readFileSync(
  path.join(repoRoot, "native-helper", "platform", "macos.js"),
  "utf8",
);

assert.match(installer, /select_python_runtime\(\)/);
const installerSelfTest = spawnSync("/bin/bash", [
  path.join(repoRoot, "release", "macos-arm64", "安装.command"),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    TIANYUAN_INSTALLER_SELF_TEST: "1",
    TIANYUAN_UPDATE_MODE: "1",
  },
  encoding: "utf8",
});
assert.equal(installerSelfTest.status, 0, installerSelfTest.stderr);
assert.match(installerSelfTest.stdout, /installer self-test passed/);
assert.match(installer, /VENV_DIR\/bin\/python3/);
assert.match(installer, /configured_python_candidates/);
assert.match(installer, /command -v python3/);
assert.match(installer, /\/usr\/bin\/python3/);
assert.match(installer, /python_lxml_wheel_available/);
assert.match(installer, /UPDATE_PYTHON_RUNTIME_UNAVAILABLE/);
// 0.14.32 runtime-reuse design: complete managed environments are reused
// offline; only incomplete environments fetch the pinned lxml wheel
// (Gitee primary, GitHub fallback) with mandatory SHA-256 verification.
assert.match(installer, /python_has_print_dependencies "\$VENV_DIR\/bin\/python3"/);
assert.match(installer, /ensure_lxml_wheel/);
assert.match(installer, /lxml-wheels\.json/);
assert.match(installer, /UPDATE_LXML_WHEEL_UNAVAILABLE/);
assert.match(installer, /shasum -a 256 -c/);
assert.doesNotMatch(
  installer,
  /if \[\[ ! -x "\$PYTHON_BOOTSTRAP" \]\].*UPDATE_MODE/s,
  "lite installer must not make Python 3.14 Framework the only update prerequisite",
);

for (const builder of [liteBuilder, fullBuilder]) {
  assert.match(builder, /MACOS_PYTHON_TARGETS/);
  assert.match(builder, /--python-version/);
  assert.match(builder, /--abi "cp\$\{PYTHON_TARGET\}"/);
  assert.match(builder, /macosx_11_0_arm64/);
}
assert.match(liteBuilder, /lxml-wheels\.json/, "lite builder must emit the pinned wheel manifest");
assert.match(liteBuilder, /GITEE_RAW_BASE/);
assert.match(liteBuilder, /GITHUB_DOWNLOAD_BASE/);
assert.match(fullBuilder, /lxml-6\.1\.0-\*-macosx_\*\.whl/, "the full package still bundles lxml wheels");
assert.match(macosAdapter, /preflightUpdate|pythonRuntimePreflight/);
assert.match(macosAdapter, /UPDATE_PYTHON_RUNTIME_UNAVAILABLE/);
assert.match(macosAdapter, /ensurepip, venv/);
console.log("macOS Python runtime checks passed.");
