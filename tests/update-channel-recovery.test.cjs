"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { checkGithubUpdate } = require("../native-helper/update_checker.js");
const { createWorkbenchUpdater } = require("../native-helper/update_installer.js");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return payload; },
  };
}

function writePackage(root) {
  const packageRoot = path.join(root, "TianyuanWorkbench");
  for (const relative of [
    "VERSION.txt",
    "SHA256SUMS",
    "安装.command",
    "extension/manifest.json",
    "extension/version.json",
    "native-helper/native_host.js",
    "native-helper/connector_bridge.js",
    "native-helper/codex_catalog.js",
    "native-helper/anjuke-property.js",
    "native-helper/update_installer.js",
    "plugins/tianyuan-browser-connector/.codex-plugin/plugin.json",
    "scripts/install-local-runtime.mjs",
    "scripts/runtime-fingerprint.mjs",
    "scripts/print-runtime-build-id.mjs",
  ]) {
    const target = path.join(packageRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "{}\n");
  }
}

async function run() {
  const directManifest = "https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/latest/download/update-manifest.json";
  const apiAsset = "https://api.github.com/repos/zer0-lyz/tianyuan-browser-workbench-releases/releases/assets/42";
  const directAsset = "https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/download/v0.15.0/package.zip";
  const checked = await checkGithubUpdate({
    currentVersion: "0.14.30",
    currentBuildNumber: 2026092501,
    updateManifestUrls: [directManifest],
    platform: "darwin",
    architecture: "arm64",
  }, {
    fetchImpl: async (url) => {
      const value = String(url);
      if (value === directManifest) throw new Error("ETIMEDOUT");
      assert.match(value, /api\.github\.com\/repos\/.*\/releases\/latest$/);
      return response(200, {
        tag_name: "v0.15.0",
        name: "v0.15.0",
        html_url: "https://github.com/example/releases/tag/v0.15.0",
        assets: [{
          id: 42,
          name: "tianyuan-workbench-v0.15.0-macos-arm64.zip",
          browser_download_url: directAsset,
          url: apiAsset,
          size: 4,
          digest: `sha256:${"a".repeat(64)}`,
        }],
      });
    },
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.source, "github-api");
  assert.equal(checked.preferredDownloadChannel, "github-api");
  assert.equal(checked.downloadCandidates[0].source, "github-api");
  assert.equal(checked.downloadCandidates[0].url, apiAsset);
  assert.equal(checked.sourceHealth.githubRelease.status, "failed");
  assert.equal(checked.sourceHealth.githubApi.status, "ok");
  assert.equal(checked.sourceHealth.githubRelease.reason, "ETIMEDOUT");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-channel-recovery-"));
  const archive = Buffer.from("channel-recovery-package");

  const manifestDirectAsset = "https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/download/v0.15.0/tianyuan-workbench-v0.15.0-macos-arm64.zip";
  const manifestApiAsset = "https://api.github.com/repos/zer0-lyz/tianyuan-browser-workbench-releases/releases/assets/142";
  const manifestArchive = Buffer.from("manifest-channel-recovery-package");
  const manifestChecked = await checkGithubUpdate({
    currentVersion: "0.14.30",
    currentBuildNumber: 2026092501,
    updateManifestUrls: [directManifest],
    platform: "darwin",
    architecture: "arm64",
  }, {
    fetchImpl: async (url) => {
      const value = String(url);
      if (value === directManifest) {
        return response(200, {
          productVersion: "0.15.0",
          buildNumber: 2026093001,
          assets: {
            "macos-arm64": {
              fileName: "tianyuan-workbench-v0.15.0-macos-arm64.zip",
              url: manifestDirectAsset,
              size: manifestArchive.length,
              sha256: sha256(manifestArchive),
            },
          },
        });
      }
      assert.match(value, /api\.github\.com\/repos\/.*\/releases\/latest$/);
      return response(200, {
        tag_name: "v0.15.0",
        assets: [{
          id: 142,
          name: "tianyuan-workbench-v0.15.0-macos-arm64.zip",
          browser_download_url: manifestDirectAsset,
          url: manifestApiAsset,
          size: manifestArchive.length,
          digest: `sha256:${sha256(manifestArchive)}`,
        }],
      });
    },
  });
  assert.equal(manifestChecked.source, "manifest");
  assert.equal(manifestChecked.downloadCandidates.length, 2);
  assert.equal(manifestChecked.downloadCandidates[0].url, manifestDirectAsset);
  assert.equal(manifestChecked.downloadCandidates[1].source, "github-api");
  assert.equal(manifestChecked.downloadCandidates[1].url, manifestApiAsset);

  const manifestDownloadCalls = [];
  const manifestUpdater = createWorkbenchUpdater({
    updateChecker: { async checkGithubUpdate() { return structuredClone(manifestChecked); } },
    platformAdapter: {
      runtimeRoot: path.join(tempRoot, "manifest-runtime"),
      isWindows: false,
      async extractZip(_zipPath, destination) { writePackage(destination); },
    },
    runtimeDirectory: path.join(tempRoot, "manifest-helper"),
    fetchImpl: async (url) => {
      manifestDownloadCalls.push(String(url));
      if (String(url) === manifestDirectAsset) throw new Error("large direct asset unavailable");
      assert.equal(String(url), manifestApiAsset);
      return new Response(manifestArchive, { status: 200 });
    },
    downloadRetryDelayMs: 0,
    downloadAttempts: 1,
  });
  const manifestRecovered = await manifestUpdater.test({ currentVersion: "0.14.30" });
  assert.equal(manifestRecovered.ok, true);
  assert.equal(manifestRecovered.phase, "test_complete");
  assert.deepEqual(manifestDownloadCalls, [manifestDirectAsset, manifestApiAsset]);

  const update = {
    ok: true,
    releasePublished: true,
    updateAvailable: true,
    latestVersion: "0.15.0",
    asset: {
      name: "tianyuan-workbench-v0.15.0-macos-arm64.zip",
      size: archive.length,
      sha256: sha256(archive),
    },
    preferredDownloadChannel: "github-api",
    downloadCandidates: [
      { id: "github-api-42", source: "github-api", url: apiAsset, headers: { accept: "application/octet-stream" }, priority: 1 },
      { id: "github-release-package", source: "github-release", url: directAsset, headers: {}, priority: 2 },
    ],
  };
  const calls = [];
  const platformAdapter = {
    runtimeRoot: path.join(tempRoot, "runtime"),
    isWindows: false,
    async extractZip(_zipPath, destination) { writePackage(destination); },
    launchWorkbenchInstaller() { return { pid: 43210 }; },
  };
  const updater = createWorkbenchUpdater({
    updateChecker: { async checkGithubUpdate() { return structuredClone(update); } },
    platformAdapter,
    runtimeDirectory: path.join(tempRoot, "native-helper"),
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url) === apiAsset) throw new Error("api unavailable");
      return new Response(archive, { status: 200 });
    },
    downloadRetryDelayMs: 0,
    downloadAttempts: 1,
  });
  const recovered = await updater.install({ currentVersion: "0.14.30" });
  assert.equal(recovered.ok, true);
  assert.deepEqual(calls, [apiAsset, directAsset]);
  const recoveredStatus = updater.getStatus();
  assert.equal(recoveredStatus.recovered, true);
  assert.equal(recoveredStatus.channelAttempts[0].status, "failed");
  assert.equal(recoveredStatus.channelAttempts[1].status, "succeeded");

  const giteeAsset = "https://gitee.com/example/tianyuan/raw/main/tianyuan-workbench-v0.15.0-macos-arm64-lite.zip";
  const giteeReleaseAsset = "https://github.com/example/releases/download/v0.15.0/tianyuan-workbench-v0.15.0-macos-arm64-lite.zip";
  const giteeUpdate = {
    ...update,
    preferredDownloadChannel: "gitee",
    asset: {
      ...update.asset,
      name: "tianyuan-workbench-v0.15.0-macos-arm64-lite.zip",
      size: archive.length,
      sha256: sha256(archive),
    },
    downloadCandidates: [
      { id: "gitee-lite", source: "gitee", url: giteeAsset, priority: 1, size: archive.length, sha256: sha256(archive) },
      { id: "github-release-lite", source: "github-release", url: giteeReleaseAsset, priority: 2, size: archive.length, sha256: sha256(archive) },
    ],
  };
  const giteeSuccessCalls = [];
  const giteeSuccessUpdater = createWorkbenchUpdater({
    updateChecker: { async checkGithubUpdate() { return structuredClone(giteeUpdate); } },
    platformAdapter: {
      ...platformAdapter,
      runtimeRoot: path.join(tempRoot, "gitee-success-runtime"),
    },
    runtimeDirectory: path.join(tempRoot, "gitee-success-helper"),
    fetchImpl: async (url) => {
      giteeSuccessCalls.push(String(url));
      assert.equal(String(url), giteeAsset);
      return new Response(archive, { status: 200 });
    },
    downloadRetryDelayMs: 0,
    downloadAttempts: 1,
  });
  const giteeSuccess = await giteeSuccessUpdater.test({ currentVersion: "0.14.30" });
  assert.equal(giteeSuccess.ok, true);
  assert.deepEqual(giteeSuccessCalls, [giteeAsset]);
  assert.equal(giteeSuccess.downloadChannel, "gitee");

  const giteeCalls = [];
  const giteeUpdater = createWorkbenchUpdater({
    updateChecker: { async checkGithubUpdate() { return structuredClone(giteeUpdate); } },
    platformAdapter: {
      ...platformAdapter,
      runtimeRoot: path.join(tempRoot, "gitee-runtime"),
    },
    runtimeDirectory: path.join(tempRoot, "gitee-helper"),
    fetchImpl: async (url) => {
      giteeCalls.push(String(url));
      if (String(url) === giteeAsset) throw new Error("GITEE_UNAVAILABLE");
      assert.equal(String(url), giteeReleaseAsset);
      return new Response(archive, { status: 200 });
    },
    downloadRetryDelayMs: 0,
    downloadAttempts: 1,
  });
  const giteeRecovered = await giteeUpdater.install({ currentVersion: "0.14.30" });
  assert.equal(giteeRecovered.ok, true);
  assert.deepEqual(giteeCalls, [giteeAsset, giteeReleaseAsset]);
  assert.equal(giteeUpdater.getStatus().recovered, true);

  const failed = createWorkbenchUpdater({
    updateChecker: { async checkGithubUpdate() { return structuredClone(update); } },
    platformAdapter,
    runtimeDirectory: path.join(tempRoot, "failed-helper"),
    fetchImpl: async () => { throw new Error("ENETUNREACH"); },
    downloadRetryDelayMs: 0,
    downloadAttempts: 1,
  });
  const result = await failed.test({ currentVersion: "0.14.30" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "UPDATE_DOWNLOAD_CHANNELS_FAILED");
  assert.equal(result.stage, "downloading");
  assert.equal(result.currentVersionUnchanged, true);
  assert.equal(result.channelAttempts.length, 2);
  assert.equal(result.channelAttempts.every((attempt) => attempt.status === "failed"), true);

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log("Update channel recovery tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
