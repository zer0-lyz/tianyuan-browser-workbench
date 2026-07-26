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
fs.writeFileSync(staleTarget, "stale");
fs.writeFileSync(freshSource, "fresh");
const oldTime = new Date("2026-07-25T00:00:00Z");
const newTime = new Date("2026-07-26T00:00:00Z");
fs.utimesSync(staleTarget, oldTime, oldTime);
fs.utimesSync(freshSource, newTime, newTime);

execFileSync(process.execPath, [
  path.join(repoRoot, "scripts", "generate-update-manifest.mjs"),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    TIANYUAN_RELEASE_OUTPUT_DIR: tempRoot,
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
assert.equal(manifest.channel, versionConfig.channel);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Update manifest tests passed.");
