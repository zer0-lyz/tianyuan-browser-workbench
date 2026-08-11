"use strict";

const assert = require("node:assert/strict");
const {
  parseSemver,
  compareSemver,
  platformKey,
  configuredManifestUrls,
  isAuthoritativeLatestManifestUrl,
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
  assert.equal(
    isAuthoritativeLatestManifestUrl(
      "https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/latest/download/update-manifest.json",
    ),
    true,
  );
  assert.equal(
    isAuthoritativeLatestManifestUrl(
      "https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/download/v0.14.17/update-manifest.json",
    ),
    false,
  );
  assert.equal(configuredManifestUrls({
    updateManifestUrls: ["https://gitee.com/example/tianyuan/raw/main/update-manifest.json"],
  }).includes("https://gitee.com/example/tianyuan/raw/main/update-manifest.json"), true);

  const mirrorUpdate = await checkGithubUpdate({
    currentVersion: "0.9.0",
    currentBuildNumber: 2026072601,
    platform: "win32",
    architecture: "x64",
    updateManifestUrls: ["https://gitee.com/example/tianyuan/raw/main/update-manifest.json"],
  }, {
    fetchImpl: async (url) => {
      assert.equal(String(url), "https://gitee.com/example/tianyuan/raw/main/update-manifest.json");
      return response(200, {
        source: "gitee",
        productVersion: "0.9.2",
        buildNumber: 2026072602,
        runtimeBuildId: "gitee-build",
        releaseUrl: "https://gitee.com/example/tianyuan",
        releaseNotes: ["国内镜像轻量更新"],
        assets: {
          "windows-x64": {
            fileName: "tianyuan-workbench-v0.9.2-windows-x64-lite.zip",
            url: "tianyuan-workbench-v0.9.2-windows-x64-lite.zip",
            sha256: "c".repeat(64),
            size: 1024,
          },
        },
      });
    },
  });
  assert.equal(mirrorUpdate.source, "gitee");
  assert.equal(mirrorUpdate.latestVersion, "0.9.2");
  assert.equal(
    mirrorUpdate.asset.url,
    "https://gitee.com/example/tianyuan/raw/main/tianyuan-workbench-v0.9.2-windows-x64-lite.zip",
  );
  assert.equal(mirrorUpdate.asset.sha256, "c".repeat(64));

  const staleMirrorFallback = await checkGithubUpdate({
    currentVersion: "0.14.18",
    currentBuildNumber: 2026080204,
    platform: "win32",
    architecture: "x64",
    updateManifestUrls: ["https://gitee.com/example/tianyuan/raw/main/update-manifest.json"],
  }, {
    fetchImpl: async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes("gitee.com")) {
        return response(200, {
          productVersion: "0.14.12",
          buildNumber: 2026072813,
          assets: {
            "windows-x64": {
              fileName: "tianyuan-workbench-v0.14.12-windows-x64.zip",
              url: "https://gitee.com/example/tianyuan/raw/main/tianyuan-workbench-v0.14.12-windows-x64.zip",
              sha256: "d".repeat(64),
              size: 100,
            },
          },
        });
      }
      if (requestUrl.includes("releases/download")) {
        return response(200, {
          productVersion: "0.14.12",
          buildNumber: 2026072813,
          assets: {},
        });
      }
      if (requestUrl.includes("api.github.com")) {
        return response(200, {
          tag_name: "v0.14.19",
          name: "天源浏览器工作台 v0.14.19",
          assets: [
            {
              name: "tianyuan-workbench-v0.14.19-windows-x64.zip",
              browser_download_url: "https://github.com/example/package.zip",
              size: 100,
            },
            {
              name: "update-manifest.json",
              browser_download_url: "https://github.com/example/update-manifest.json",
              size: 200,
            },
          ],
        });
      }
      return response(200, {
        productVersion: "0.14.19",
        buildNumber: 2026080205,
        assets: {
          "windows-x64": {
            fileName: "tianyuan-workbench-v0.14.19-windows-x64.zip",
            sha256: "e".repeat(64),
            size: 100,
          },
        },
      });
    },
  });
  assert.equal(staleMirrorFallback.latestVersion, "0.14.19");
  assert.equal(staleMirrorFallback.updateAvailable, true);
  assert.equal(staleMirrorFallback.asset.name, "tianyuan-workbench-v0.14.19-windows-x64.zip");

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
    fetchImpl: async (url) => {
      if (String(url).includes("gitee.com")) return response(404, {});
      if (!String(url).includes("api.github.com")
        && !String(url).includes("releases/download/v0.9.0/update-manifest.json")) {
        return response(404, {});
      }
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

  let authoritativeRequestCount = 0;
  const authoritativeCurrent = await checkGithubUpdate({
    currentVersion: "0.14.21",
    currentBuildNumber: 2026080209,
    currentRuntimeBuildId: "current-build",
    platform: "win32",
    architecture: "x64",
  }, {
    fetchImpl: async (url) => {
      authoritativeRequestCount += 1;
      assert.equal(
        String(url),
        "https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/latest/download/update-manifest.json",
      );
      return response(200, {
        productVersion: "0.14.21",
        buildNumber: 2026080209,
        runtimeBuildId: "current-build",
        assets: {
          "windows-x64": {
            fileName: "tianyuan-workbench-v0.14.21-windows-x64.zip",
            url: "tianyuan-workbench-v0.14.21-windows-x64.zip",
            sha256: "f".repeat(64),
            size: 100,
          },
        },
      });
    },
  });
  assert.equal(authoritativeCurrent.ok, true);
  assert.equal(authoritativeCurrent.updateAvailable, false);
  assert.equal(authoritativeCurrent.latestVersion, "0.14.21");
  assert.equal(authoritativeRequestCount, 1);

  await assert.rejects(
    checkGithubUpdate({
      currentVersion: "0.14.21",
      currentBuildNumber: 2026080209,
      platform: "win32",
      architecture: "x64",
    }, {
      checkTimeoutMs: 20,
      timeoutMs: 5,
      fetchImpl: async () => new Promise(() => {}),
    }),
    /UPDATE_CHECK_TIMEOUT/,
  );

  console.log("GitHub update checker tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
