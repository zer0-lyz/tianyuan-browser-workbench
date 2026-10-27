"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const uninstallPath = path.join(repoRoot, "release", "macos-arm64", "卸载.command");
const uninstallSource = fs.readFileSync(uninstallPath, "utf8");

assert.doesNotMatch(
  uninstallSource,
  /if \[\[ -z "\$INSTALL_ROOT" && -f "\$HOST_JSON" \]\]/,
  "the host manifest must not be used to discover an uninstall target",
);

if (process.platform !== "darwin") {
  console.log("macOS uninstall root-selection integration test skipped outside macOS.");
  process.exit(0);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-macos-uninstall-root-"));
try {
  const packageRoot = path.join(tempRoot, "fresh-package");
  const oldRoot = path.join(tempRoot, "previous-install");
  const oldNativeRoot = path.join(oldRoot, "workbench-runtime", "native-helper");
  const hostManifestPath = path.join(tempRoot, "simulated-chrome-host.json");
  const runtimeConfigPath = path.join(oldNativeRoot, "runtime-config.json");
  const launcherPath = path.join(oldNativeRoot, "native_host_launcher.sh");
  const sentinelPath = path.join(oldRoot, "workbench-runtime", "do-not-delete-sentinel.txt");
  const copiedUninstallPath = path.join(packageRoot, "卸载.command");

  fs.mkdirSync(packageRoot, { recursive: true });
  fs.mkdirSync(oldNativeRoot, { recursive: true });
  fs.copyFileSync(uninstallPath, copiedUninstallPath);
  fs.writeFileSync(runtimeConfigPath, JSON.stringify({
    installRoot: oldRoot,
    layout: "visible-root-v1",
    nodeBin: process.execPath,
  }), "utf8");
  fs.writeFileSync(launcherPath, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  fs.writeFileSync(hostManifestPath, JSON.stringify({ path: launcherPath }), "utf8");
  fs.writeFileSync(sentinelPath, "preserve previous installation\n", "utf8");

  const result = spawnSync("bash", [copiedUninstallPath], {
    cwd: packageRoot,
    env: {
      ...process.env,
      HOME: path.join(tempRoot, "home"),
      TIANYUAN_INSTALL_ROOT: "",
      TIANYUAN_RUNTIME_LAYOUT: "",
      TIANYUAN_NODE_BIN: process.execPath,
      TIANYUAN_HOST_MANIFEST_PATH: hostManifestPath,
    },
    input: "YES\n",
    encoding: "utf8",
    timeout: 30000,
  });

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 2, output);
  assert.match(output, /此目录未安装，未删除任何文件/);
  assert.doesNotMatch(output, /将清理安装根/);
  assert.equal(fs.readFileSync(sentinelPath, "utf8"), "preserve previous installation\n");
  assert.equal(fs.existsSync(hostManifestPath), true, "the simulated Chrome registration must remain untouched");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macOS uninstall root-selection tests passed.");
