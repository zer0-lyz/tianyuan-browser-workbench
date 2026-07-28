"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const versionConfig = JSON.parse(fs.readFileSync(
  path.join(repoRoot, "extension", "version.json"),
  "utf8",
));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-lite-release-"));

const output = execFileSync("bash", [
  path.join(repoRoot, "release", "build_windows_x64_lite_release.sh"),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    TIANYUAN_RELEASE_OUTPUT_DIR: tempRoot,
    TIANYUAN_RELEASE_BUILD_ROOT: path.join(tempRoot, "builds"),
    RELEASE_DATE: "20260728",
  },
  encoding: "utf8",
});

const archivePath = output.trim().split(/\r?\n/)[0];
assert.equal(fs.existsSync(archivePath), true);
assert.match(path.basename(archivePath), /windows-x64-lite/);
assert.ok(fs.statSync(archivePath).size < 10 * 1024 * 1024);

const entries = JSON.parse(execFileSync("python3", [
  "-c",
  [
    "import json, sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1]) as archive:",
    "  print(json.dumps([{'name': item.filename, 'flags': item.flag_bits} for item in archive.infolist()], ensure_ascii=False))",
  ].join("\n"),
  archivePath,
], { encoding: "utf8" }));
const hasName = (suffix) => entries.some((entry) => entry.name.endsWith(suffix));

assert.equal(hasName("/install.ps1"), true);
const legacyEntry = entries.find((entry) => entry.name.endsWith("/安装.ps1"));
assert.ok(legacyEntry);
assert.notEqual(legacyEntry.flags & 0x800, 0);
assert.equal(hasName("/extension/manifest.json"), true);
assert.equal(hasName("/native-helper/update_checker.js"), true);
assert.equal(hasName("/scripts/install-local-runtime.mjs"), true);
assert.equal(hasName("/runtime/node/node.exe"), false);
assert.equal(entries.some((entry) => entry.name.includes("/runtime/python-portable/")), false);
assert.equal(entries.some((entry) => entry.name.endsWith("/runtime/tycpv-setup-0.1.0-win-x64.exe")), false);

const versionText = execFileSync("/usr/bin/unzip", [
  "-p",
  archivePath,
  "*/VERSION.txt",
], { encoding: "utf8" });
assert.equal(versionText.includes(`version=${versionConfig.productVersion}`), true);
assert.equal(versionText.includes("package_type=lite-update"), true);
assert.equal(versionText.includes("requires_existing_runtime=true"), true);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Windows lite release tests passed.");
