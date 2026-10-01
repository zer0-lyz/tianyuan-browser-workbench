import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "extension", "version.json"), "utf8"),
);
const version = versionConfig.productVersion;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-update-manifest-"));
const staleTarget = path.join(
  tempRoot,
  `tianyuan-workbench-v${version}-windows-x64.zip`,
);
const freshSource = path.join(
  tempRoot,
  `天源浏览器工作台-v${version}-Windows-x64-20260726.zip`,
);
const liteSource = path.join(
  tempRoot,
  `tianyuan-workbench-v${version}-windows-x64-lite-20260727.zip`,
);
const macFullSource = path.join(
  tempRoot,
  `天源浏览器工作台-v${version}-macOS-Apple芯片-20260726.zip`,
);
const macLiteSource = path.join(
  tempRoot,
  `tianyuan-workbench-v${version}-macos-arm64-lite-20260727.zip`,
);
fs.writeFileSync(staleTarget, "stale");
fs.writeFileSync(freshSource, "fresh");
fs.writeFileSync(liteSource, "lite");
fs.writeFileSync(macFullSource, "mac-full");
fs.writeFileSync(macLiteSource, "mac-lite");
const oldTime = new Date("2026-07-25T00:00:00Z");
const newTime = new Date("2026-07-26T00:00:00Z");
fs.utimesSync(staleTarget, oldTime, oldTime);
fs.utimesSync(freshSource, newTime, newTime);
fs.utimesSync(liteSource, new Date("2026-07-27T00:00:00Z"), new Date("2026-07-27T00:00:00Z"));
fs.utimesSync(macFullSource, newTime, newTime);
fs.utimesSync(macLiteSource, new Date("2026-07-27T00:00:00Z"), new Date("2026-07-27T00:00:00Z"));

execFileSync(process.execPath, [
  path.join(repoRoot, "scripts", "generate-update-manifest.mjs"),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    TIANYUAN_RELEASE_OUTPUT_DIR: tempRoot,
    TIANYUAN_RELEASE_BASE_URL: "https://gitee.com/example/tianyuan/raw/main",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

assert.equal(fs.readFileSync(staleTarget, "utf8"), "fresh");
const manifest = JSON.parse(
  fs.readFileSync(path.join(tempRoot, "update-manifest.json"), "utf8"),
);
assert.equal(
  manifest.assets["windows-x64"].fileName,
  `tianyuan-workbench-v${version}-windows-x64.zip`,
);
assert.equal(
  manifest.assets["windows-x64"].url,
  `https://gitee.com/example/tianyuan/raw/main/tianyuan-workbench-v${version}-windows-x64.zip`,
);
assert.equal(
  manifest.releaseUrl,
  "https://gitee.com/example/tianyuan",
);
assert.equal(manifest.source, "static-manifest");
assert.equal(manifest.channel, versionConfig.channel);
assert.equal(fs.readFileSync(path.join(tempRoot, `tianyuan-workbench-v${version}-macos-arm64.zip`), "utf8"), "mac-full");
assert.equal(manifest.handoff.windowsCodex.fileName, "WINDOWS_CODEX_HANDOFF.md");
assert.equal(
  manifest.handoff.windowsCodex.url,
  "https://gitee.com/example/tianyuan/raw/main/WINDOWS_CODEX_HANDOFF.md",
);
const handoff = fs.readFileSync(path.join(tempRoot, "WINDOWS_CODEX_HANDOFF.md"), "utf8");
assert.equal(handoff.includes(`Windows Codex 打包发布交接 — v${version}`), true);
assert.equal(handoff.includes(`构建编号：\`${versionConfig.buildNumber}\``), true);
assert.equal(handoff.includes(`tianyuan-workbench-v${version}-windows-x64.zip`), true);
assert.equal(handoff.includes("桌面必须出现“天源工作台-浏览器扩展”入口"), true);
assert.equal(handoff.includes("测试更新模块"), true);
assert.equal(handoff.includes("gh release upload"), true);
assert.equal(handoff.includes("macOS 主线只交付源码和交接要求"), true);
assert.equal(handoff.includes("完整包目标名"), true);

execFileSync(process.execPath, [
  path.join(repoRoot, "scripts", "generate-update-manifest.mjs"),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    TIANYUAN_RELEASE_OUTPUT_DIR: tempRoot,
    TIANYUAN_RELEASE_BASE_URL: "https://gitee.com/example/tianyuan/raw/main",
    TIANYUAN_WINDOWS_PACKAGE_MODE: "lite",
    TIANYUAN_MACOS_PACKAGE_MODE: "lite",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
  assert.equal(fs.readFileSync(staleTarget, "utf8"), "fresh");
  assert.equal(
    fs.readFileSync(path.join(tempRoot, `tianyuan-workbench-v${version}-windows-x64-lite.zip`), "utf8"),
    "lite",
  );
  assert.equal(fs.readFileSync(path.join(tempRoot, `tianyuan-workbench-v${version}-macos-arm64.zip`), "utf8"), "mac-full");
  assert.equal(
    fs.readFileSync(path.join(tempRoot, `tianyuan-workbench-v${version}-macos-arm64-lite.zip`), "utf8"),
    "mac-lite",
  );
  const liteManifest = JSON.parse(
    fs.readFileSync(path.join(tempRoot, "update-manifest.json"), "utf8"),
  );
  assert.equal(
    liteManifest.assets["windows-x64"].fileName,
    `tianyuan-workbench-v${version}-windows-x64-lite.zip`,
  );
  assert.equal(
    liteManifest.assets["macos-arm64"].fileName,
    `tianyuan-workbench-v${version}-macos-arm64-lite.zip`,
  );

execFileSync(process.execPath, [
  path.join(repoRoot, "scripts", "generate-update-manifest.mjs"),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    TIANYUAN_RELEASE_OUTPUT_DIR: tempRoot,
    TIANYUAN_RELEASE_BASE_URL: "",
    TIANYUAN_GITEE_BASE_URL: "https://gitee.com/example/tianyuan/raw/main",
    TIANYUAN_GITHUB_BASE_URL: `https://github.com/example/releases/download/v${version}`,
    TIANYUAN_GITEE_RELEASE_URL: "https://gitee.com/example/tianyuan",
    TIANYUAN_WINDOWS_PACKAGE_MODE: "lite",
    TIANYUAN_MACOS_PACKAGE_MODE: "lite",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const dualManifest = JSON.parse(
  fs.readFileSync(path.join(tempRoot, "update-manifest.json"), "utf8"),
);
for (const key of ["windows-x64", "macos-arm64"]) {
  const asset = dualManifest.assets[key];
  assert.equal(asset.fileName.includes("-lite.zip"), true);
  assert.equal(asset.downloadCandidates.length, 2);
  assert.equal(asset.downloadCandidates[0].source, "gitee");
  assert.equal(asset.downloadCandidates[1].source, "github-release");
  assert.equal(asset.downloadCandidates[0].name, asset.fileName);
  assert.equal(asset.downloadCandidates[1].name, asset.fileName);
  assert.equal(asset.downloadCandidates[0].size, asset.size);
  assert.equal(asset.downloadCandidates[1].size, asset.size);
  assert.equal(asset.downloadCandidates[0].sha256, asset.sha256);
  assert.equal(asset.downloadCandidates[1].sha256, asset.sha256);
  assert.equal(
    asset.url,
    `https://gitee.com/example/tianyuan/raw/main/${asset.fileName}`,
  );
  assert.equal(
    asset.downloadCandidates[1].url,
    `https://github.com/example/releases/download/v${version}/${asset.fileName}`,
  );
  const bytes = fs.readFileSync(path.join(tempRoot, asset.fileName));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
}
assert.equal(dualManifest.releaseUrl, "https://gitee.com/example/tianyuan");

execFileSync(process.execPath, [
  path.join(repoRoot, "scripts", "generate-update-manifest.mjs"),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    TIANYUAN_RELEASE_OUTPUT_DIR: tempRoot,
    TIANYUAN_RELEASE_BASE_URL: `https://github.com/example/releases/download/v${version}`,
    TIANYUAN_GITEE_BASE_URL: "",
    TIANYUAN_GITHUB_BASE_URL: "",
    TIANYUAN_RELEASE_URL: "",
    TIANYUAN_RELEASE_PAGE_URL: "",
    TIANYUAN_GITEE_RELEASE_URL: "",
    TIANYUAN_GITHUB_RELEASE_URL: "",
    TIANYUAN_WINDOWS_PACKAGE_MODE: "full",
    TIANYUAN_MACOS_PACKAGE_MODE: "full",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const legacyManifest = JSON.parse(
  fs.readFileSync(path.join(tempRoot, "update-manifest.json"), "utf8"),
);
assert.equal(
  legacyManifest.assets["windows-x64"].url,
  `https://github.com/example/releases/download/v${version}/${legacyManifest.assets["windows-x64"].fileName}`,
);
assert.equal(legacyManifest.assets["windows-x64"].downloadCandidates.length, 1);
assert.equal(legacyManifest.assets["windows-x64"].downloadCandidates[0].source, "github-release");
assert.equal(
  legacyManifest.releaseUrl,
  `https://github.com/example/releases/tag/v${version}`,
);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Update manifest tests passed.");
