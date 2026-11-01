"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const installerPath = path.join(repoRoot, "release", "macos-arm64", "安装.command");
const installerSource = fs.readFileSync(installerPath, "utf8");
assert.match(
  installerSource,
  /printf '%s' "\$\{INSTALL_RESULT:-\}" \| "\$NODE_BIN" -e/,
  "the report generator must pass an empty string when the installer result is unavailable",
);

const reportScriptMatch = installerSource.match(
  /printf '%s' "\$\{INSTALL_RESULT:-\}" \| "\$NODE_BIN" -e '([\s\S]*?)'\s+"\$report_path"/,
);
assert.ok(reportScriptMatch, "could not locate the inline installation report generator");
const reportScript = reportScriptMatch[1];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-macos-install-report-"));
let paths;

function writeFile(filePath, content = "fixture\n") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function runReport(install, requestedStatus, reportName) {
  const reportPath = path.join(tempRoot, reportName);
  const args = [
    reportPath,
    paths.installRoot,
    paths.extension,
    paths.runtimeRoot,
    paths.pythonBin,
    paths.sourceNodeBin,
    "",
    "",
    "未安装/不可用（可选组件）",
    "天源 CLI 未安装；该组件为可选项。",
    "0",
    "1",
    repoRoot,
    requestedStatus,
  ];
  const result = spawnSync(process.execPath, ["-e", reportScript, ...args], {
    env: { ...process.env, HOME: paths.home },
    input: install === null ? "" : JSON.stringify(install),
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(fs.existsSync(reportPath), true, result.stderr);
  return { ...result, report: JSON.parse(fs.readFileSync(reportPath, "utf8")) };
}

try {
  paths = {
    installRoot: path.join(tempRoot, "install-root"),
    runtimeRoot: path.join(tempRoot, "install-root", "workbench-runtime"),
    extension: path.join(tempRoot, "install-root", "extension"),
    pythonBin: path.join(tempRoot, "install-root", "workbench-runtime", "python", "bin", "python3"),
    sourceNodeBin: path.join(tempRoot, "package", "runtime", "node", "node"),
    managedNodeBin: path.join(tempRoot, "install-root", "workbench-runtime", "native-helper", "node", "node"),
    connectorPath: path.join(tempRoot, "home", "plugins", "tianyuan-browser-connector"),
    codexConnectorCachePath: path.join(tempRoot, "home", ".codex", "plugins", "cache", "personal", "tianyuan-browser-connector"),
    home: path.join(tempRoot, "home"),
  };
  const nativeHelper = path.join(paths.runtimeRoot, "native-helper");
  const hostManifestPath = path.join(
    paths.home,
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "NativeMessagingHosts",
    "com.tianyuan.workbench.helper.json",
  );
  writeFile(path.join(paths.extension, "manifest.json"), "{}\n");
  writeFile(path.join(nativeHelper, "native_host.js"));
  writeFile(path.join(nativeHelper, "runtime-config.json"), "{}\n");
  writeFile(path.join(nativeHelper, "native_host_launcher.sh"));
  writeFile(paths.pythonBin);
  writeFile(paths.sourceNodeBin);
  writeFile(paths.managedNodeBin);
  writeFile(path.join(paths.connectorPath, "index.js"));
  writeFile(path.join(paths.codexConnectorCachePath, "plugin.json"));
  writeFile(hostManifestPath, JSON.stringify({ path: path.join(nativeHelper, "native_host_launcher.sh") }));

  const install = {
    extensionPath: paths.extension,
    connectorPath: paths.connectorPath,
    codexConnectorCachePath: paths.codexConnectorCachePath,
    connector: { ok: true, connector: { ok: true } },
    nodeRuntimePath: paths.managedNodeBin,
    runtimeCompatibility: { runtimeBuildId: "fixture-build" },
    selfTest: { ok: true },
  };
  const success = runReport(install, "success", "success-no-cli.json");
  assert.equal(success.status, 0, success.stderr);
  assert.equal(success.report.status, "success");
  assert.equal(success.report.allComponentsReady, true);
  assert.equal(success.report.components.node, true);
  assert.equal(success.report.paths.node, paths.managedNodeBin, "the report must expose the installed managed Node path");
  assert.equal(success.report.optionalDependencies.cli.required, false);
  assert.equal(success.report.optionalDependencies.cli.status, "unavailable");
  assert.match(success.report.optionalDependencies.cli.message, /可选项/);

  const coreFailure = runReport({ ...install, connector: { ok: false, connector: { ok: false } } }, "success", "core-failure.json");
  assert.equal(coreFailure.status, 1);
  assert.equal(coreFailure.report.status, "failed");
  assert.equal(coreFailure.report.allComponentsReady, false);
  assert.equal(coreFailure.report.components.connector, false);
  assert.equal(coreFailure.report.components.node, true, "a core failure must not misreport the installed Node runtime");
  assert.equal(coreFailure.report.paths.node, paths.managedNodeBin);

  const emptyInstall = runReport(null, "failed", "empty-install-result.json");
  assert.equal(emptyInstall.status, 0, emptyInstall.stderr);
  assert.equal(emptyInstall.report.status, "failed");
  assert.equal(emptyInstall.report.allComponentsReady, false);
  assert.equal(emptyInstall.report.paths.node, null);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macOS install report tests passed.");
