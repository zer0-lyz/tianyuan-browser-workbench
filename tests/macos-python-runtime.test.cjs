"use strict";

const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMacOSAdapter } = require("../native-helper/platform/macos.js");

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
assert.match(installer, /package_type=lite-update/);
assert.match(installer, /visible-root-v1/);
assert.match(installer, /workbench-runtime/);
assert.match(installer, /write_install_report "success"/);
assert.match(installer, /required: false/);
assert.match(installer, /spawn\(process\.argv\[2\]/);
assert.doesNotMatch(installer, /TYCPV_PKG/);
assert.doesNotMatch(installer, /\/usr\/local\/bin\/tycpv" --version \|\| fail/);
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
assert.match(fullBuilder, /node-v\$\{NODE_VERSION\}-darwin-arm64\.tar\.gz/);
assert.match(fullBuilder, /c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428/);
assert.doesNotMatch(fullBuilder, /TYCPV_SOURCE|tycpv-setup-0\.1\.0-macos-arm64\.pkg/);
assert.match(macosAdapter, /preflightUpdate|pythonRuntimePreflight/);
assert.match(macosAdapter, /UPDATE_PYTHON_RUNTIME_UNAVAILABLE/);
assert.match(macosAdapter, /ensurepip, venv/);
assert.match(macosAdapter, /runtimeConfig\.pythonBin/);
assert.match(macosAdapter, /installRoot,/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-macos-visible-layout-"));
try {
  const installRoot = path.join(tempRoot, "visible install root");
  const runtimeRoot = path.join(installRoot, "workbench-runtime");
  const nativeRuntimeRoot = path.join(runtimeRoot, "native-helper");
  const pythonBin = path.join(runtimeRoot, "python", "bin", "python3");
  const nodeBin = path.join(nativeRuntimeRoot, "node", "node");
  fs.mkdirSync(path.dirname(pythonBin), { recursive: true });
  fs.mkdirSync(path.dirname(nodeBin), { recursive: true });
  fs.mkdirSync(nativeRuntimeRoot, { recursive: true });
  fs.writeFileSync(pythonBin, "fixture interpreter");
  fs.writeFileSync(nodeBin, "fixture node");
  fs.writeFileSync(path.join(nativeRuntimeRoot, "runtime-config.json"), JSON.stringify({
    installRoot,
    layout: "visible-root-v1",
    pythonBin,
    nodeBin,
    printSkillsDir: path.join(runtimeRoot, "print-format-skills"),
  }));

  const child = new EventEmitter();
  child.pid = 54321;
  child.unref = () => {};
  const adapter = createMacOSAdapter({
    homeDir: path.join(tempRoot, "home"),
    env: { PATH: "", TIANYUAN_PYTHON_BIN: "" },
    runtimeConfig: JSON.parse(fs.readFileSync(path.join(nativeRuntimeRoot, "runtime-config.json"), "utf8")),
    execFileSync(command, args) {
      if (command === pythonBin && args[0] === "-c") {
        return args[1].includes("sys.version_info") ? "3.14.6\n" : "";
      }
      throw new Error("expected only the configured temporary Python runtime");
    },
    spawn() { return child; },
  });

  assert.equal(adapter.installRoot, installRoot);
  assert.equal(adapter.runtimeRoot, runtimeRoot);
  const preflight = adapter.preflightUpdate({
    update: { asset: { name: "tianyuan-workbench-v0.14.33-macos-arm64-lite.zip" } },
  });
  assert.equal(preflight.ok, true);
  assert.equal(preflight.pythonBin, pythonBin, "lite preflight must use the configured visible-root Python");

  const statusPath = path.join(nativeRuntimeRoot, "workbench-update-status.json");
  const logPath = path.join(nativeRuntimeRoot, "workbench-update.log");
  const launched = adapter.launchWorkbenchInstaller({
    installerPath: path.join(tempRoot, "download staging", "安装.command"),
    statusPath,
    logPath,
    parentPid: 54322,
  });
  const runner = fs.readFileSync(launched.runnerPath, "utf8");
  assert.equal(launched.pid, child.pid);
  assert.ok(runner.includes(`TIANYUAN_INSTALL_ROOT='${installRoot}'`));
  assert.match(runner, /TIANYUAN_RUNTIME_LAYOUT='visible-root-v1'/);
  assert.ok(runner.includes(`TIANYUAN_PYTHON_BIN='${pythonBin}'`));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macOS Python runtime checks passed.");
