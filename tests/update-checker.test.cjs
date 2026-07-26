"use strict";

const assert = require("node:assert/strict");
const {
  parseSemver,
  compareSemver,
  platformKey,
  checkGithubUpdate,
} = require("../native-helper/update_checker.js");

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return payload;
    },
  };
}

async function run() {
  assert.deepEqual(parseSemver("v1.2.3-beta.2"), {
    raw: "1.2.3-beta.2",
    major: 1,
    minor: 2,
    patch: 3,
    prerelease: ["beta", "2"],
  });
  assert.equal(compareSemver("1.10.0", "1.9.0"), 1);
  assert.equal(compareSemver("1.2.0-beta.2", "1.2.0-beta.10"), -1);
  assert.equal(compareSemver("1.2.0", "1.2.0-beta.10"), 1);
  assert.equal(platformKey("win32", "x64"), "windows-x64");
  assert.equal(platformKey("darwin", "arm64"), "macos-arm64");

  const noRelease = await checkGithubUpdate({
    currentVersion: "0.9.0",
    currentBuildNumber: 2026072601,
    platform: "win32",
    architecture: "x64",
  }, {
    fetchImpl: async () => response(404, { message: "Not Found" }),
  });
  assert.equal(noRelease.ok, true);
  assert.equal(noRelease.releasePublished, false);
  assert.equal(noRelease.updateAvailable, false);

  const release = {
    tag_name: "v0.9.1",
    name: "天源浏览器工作台 0.9.1",
    html_url: "https://github.com/zer0-lyz/tianyuan-browser-workbench/releases/tag/v0.9.1",
    published_at: "2026-07-26T08:00:00Z",
    prerelease: false,
    body: "- 修复更新检查\n- 更新 Windows 安装包",
    assets: [
      {
        name: "天源浏览器工作台-v0.9.1-Windows-x64.zip",
        browser_download_url: "https://github.com/zer0-lyz/tianyuan-browser-workbench/releases/download/v0.9.1/windows.zip",
        url: "https://api.github.com/repos/zer0-lyz/tianyuan-browser-workbench/releases/assets/1",
        size: 100,
        digest: `sha256:${"a".repeat(64)}`,
      },
    ],
  };
  const update = await checkGithubUpdate({
    currentVersion: "0.9.0",
    currentBuildNumber: 2026072601,
    platform: "win32",
    architecture: "x64",
  }, {
    fetchImpl: async () => response(200, release),
  });
  assert.equal(update.updateAvailable, true);
  assert.equal(update.latestVersion, "0.9.1");
  assert.equal(update.asset.name, release.assets[0].name);
  assert.equal(update.asset.sha256, "a".repeat(64));
  assert.deepEqual(update.notes, ["修复更新检查", "更新 Windows 安装包"]);

  const manifestRelease = {
    ...release,
    tag_name: "v0.9.0",
    assets: [
      ...release.assets,
      {
        name: "update-manifest.json",
        browser_download_url: "https://github.com/zer0-lyz/tianyuan-browser-workbench/releases/download/v0.9.0/update-manifest.json",
        url: "https://api.github.com/repos/zer0-lyz/tianyuan-browser-workbench/releases/assets/2",
        size: 200,
      },
    ],
  };
  let requestCount = 0;
  const repair = await checkGithubUpdate({
    currentVersion: "0.9.0",
    currentBuildNumber: 2026072601,
    currentRuntimeBuildId: "old-build",
    platform: "win32",
    architecture: "x64",
  }, {
    fetchImpl: async () => {
      requestCount += 1;
      return requestCount === 1
        ? response(200, manifestRelease)
        : response(200, {
            productVersion: "0.9.0",
            buildNumber: 2026072601,
            runtimeBuildId: "new-build",
            assets: {
              "windows-x64": {
                fileName: release.assets[0].name,
                sha256: "b".repeat(64),
              },
            },
          });
    },
  });
  assert.equal(repair.updateAvailable, true);
  assert.equal(repair.repairRequired, true);
  assert.equal(repair.manifestFound, true);
  assert.equal(repair.asset.sha256, "b".repeat(64));

  console.log("GitHub update checker tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
