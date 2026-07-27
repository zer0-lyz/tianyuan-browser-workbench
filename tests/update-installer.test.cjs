"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkbenchUpdater } = require("../native-helper/update_installer.js");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writePackage(extractRoot) {
  const packageRoot = path.join(extractRoot, "天源浏览器工作台");
  for (const relativePath of [
    "VERSION.txt",
    "SHA256SUMS",
    "安装.command",
    "extension/manifest.json",
    "extension/version.json",
    "native-helper/native_host.js",
    "native-helper/update_installer.js",
    "plugins/tianyuan-browser-connector/.codex-plugin/plugin.json",
    "scripts/install-local-runtime.mjs",
  ]) {
    const target = path.join(packageRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "{}\n");
  }
}

async function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-updater-"));
  const archive = Buffer.from("verified update package");
  let launched = false;
  const platformAdapter = {
    runtimeRoot: path.join(tempRoot, "runtime"),
    isWindows: false,
    async extractZip(_zipPath, destination) {
      writePackage(destination);
    },
    launchWorkbenchInstaller(input) {
      launched = true;
      assert.equal(input.installerPath.endsWith("安装.command"), true);
      return { pid: 12345 };
    },
  };
  const updateChecker = {
    async checkGithubUpdate() {
      return {
        ok: true,
        updateAvailable: true,
        repairRequired: false,
        latestVersion: "0.13.0",
        platform: "macos-arm64",
        asset: {
          name: "tianyuan-workbench-v0.13.0-macos-arm64.zip",
          url: "https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/download/v0.13.0/package.zip",
          sha256: sha256(archive),
        },
      };
    },
  };
  const fetchImpl = async () => new Response(archive, { status: 200 });
  const updater = createWorkbenchUpdater({
    updateChecker,
    platformAdapter,
    runtimeDirectory: path.join(tempRoot, "native-helper"),
    fetchImpl,
  });
  const result = await updater.install({
    currentVersion: "0.12.2",
    currentBuildNumber: 2026072701,
    currentRuntimeBuildId: "old",
  });
  assert.equal(result.ok, true);
  assert.equal(result.phase, "installing");
  assert.equal(launched, true);
  assert.equal(updater.getStatus().phase, "installing");

  launched = false;
  const mismatchUpdater = createWorkbenchUpdater({
    updateChecker: {
      async checkGithubUpdate() {
        const update = await updateChecker.checkGithubUpdate();
        update.asset.sha256 = "0".repeat(64);
        return update;
      },
    },
    platformAdapter,
    runtimeDirectory: path.join(tempRoot, "native-helper-mismatch"),
    fetchImpl,
  });
  const mismatch = await mismatchUpdater.install({
    currentVersion: "0.12.2",
    currentBuildNumber: 2026072701,
    currentRuntimeBuildId: "old",
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "UPDATE_SHA256_MISMATCH");
  assert.equal(launched, false);

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log("Workbench update installer tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
