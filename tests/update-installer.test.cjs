"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createWorkbenchUpdater,
  downloadFile,
} = require("../native-helper/update_installer.js");

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
  let retryCount = 0;
  const retryTarget = path.join(tempRoot, "retry.zip");
  const retryResult = await downloadFile(
    "https://github.com/example/update.zip",
    retryTarget,
    {
      retryDelayMs: 0,
      fetchImpl: async () => {
        retryCount += 1;
        if (retryCount === 1) {
          const error = new TypeError("fetch failed");
          error.cause = { code: "ECONNRESET" };
          throw error;
        }
        return new Response(archive, { status: 200 });
      },
    },
  );
  assert.equal(retryCount, 2);
  assert.equal(retryResult.attempts, 2);
  assert.equal(fs.readFileSync(retryTarget).equals(archive), true);

  await assert.rejects(
    downloadFile(
      "https://github.com/example/update.zip",
      path.join(tempRoot, "failed.zip"),
      {
        attempts: 2,
        retryDelayMs: 0,
        fetchImpl: async () => {
          const error = new TypeError("fetch failed");
          error.cause = { code: "ENETUNREACH" };
          throw error;
        },
      },
    ),
    /UPDATE_DOWNLOAD_NETWORK_ENETUNREACH/,
  );

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
        releasePublished: true,
        updateAvailable: true,
        repairRequired: false,
        latestVersion: "0.13.0",
        platform: "macos-arm64",
        asset: {
          name: "tianyuan-workbench-v0.13.0-macos-arm64.zip",
          url: "https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/download/v0.13.0/package.zip",
          apiUrl: "https://api.github.com/repos/zer0-lyz/tianyuan-browser-workbench-releases/releases/assets/1",
          size: archive.length,
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
    downloadRetryDelayMs: 0,
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
  const testResult = await updater.test({
    currentVersion: "0.13.0",
    currentBuildNumber: 2026072703,
    currentRuntimeBuildId: "current",
  });
  assert.equal(testResult.ok, true, JSON.stringify(testResult));
  assert.equal(testResult.phase, "test_complete");
  assert.equal(testResult.packageValid, true);
  assert.equal(testResult.installed, false);
  assert.equal(testResult.downloadedBytes, archive.length);
  assert.equal(launched, false);
  const selfTestRoot = path.join(platformAdapter.runtimeRoot, "updates");
  assert.equal(
    fs.readdirSync(selfTestRoot).some((name) => name.startsWith("self-test-")),
    false,
  );

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
    downloadRetryDelayMs: 0,
  });
  const mismatch = await mismatchUpdater.install({
    currentVersion: "0.12.2",
    currentBuildNumber: 2026072701,
    currentRuntimeBuildId: "old",
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "UPDATE_SHA256_MISMATCH");
  assert.equal(launched, false);

  const sizeMismatchUpdater = createWorkbenchUpdater({
    updateChecker: {
      async checkGithubUpdate() {
        const update = await updateChecker.checkGithubUpdate();
        update.asset.size = archive.length + 1;
        return update;
      },
    },
    platformAdapter,
    runtimeDirectory: path.join(tempRoot, "native-helper-size-mismatch"),
    fetchImpl,
    downloadRetryDelayMs: 0,
  });
  const sizeMismatch = await sizeMismatchUpdater.test({
    currentVersion: "0.13.0",
    currentBuildNumber: 2026072703,
    currentRuntimeBuildId: "current",
  });
  assert.equal(sizeMismatch.ok, false);
  assert.equal(sizeMismatch.reason, "UPDATE_DOWNLOAD_SIZE_MISMATCH");
  assert.equal(launched, false);

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log("Workbench update installer tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
