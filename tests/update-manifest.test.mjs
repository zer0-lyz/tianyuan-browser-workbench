import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
assert.equal(manifest.source, "static-manifest");
assert.equal(manifest.channel, versionConfig.channel);
assert.equal(fs.readFileSync(path.join(tempRoot, `tianyuan-workbench-v${version}-macos-arm64.zip`), "utf8"), "mac-full");

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
assert.equal(fs.readFileSync(staleTarget, "utf8"), "lite");
assert.equal(fs.readFileSync(path.join(tempRoot, `tianyuan-workbench-v${version}-macos-arm64.zip`), "utf8"), "mac-lite");

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Update manifest tests passed.");
