"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-release-zip-"));
const packageRoot = path.join(
  tempRoot,
  "tianyuan-workbench-v0.14.8-windows-x64",
);
const archivePath = path.join(tempRoot, "windows.zip");
const extractRoot = path.join(tempRoot, "extracted");

fs.mkdirSync(packageRoot, { recursive: true });
fs.writeFileSync(path.join(packageRoot, "install.ps1"), "ascii installer\n");
fs.writeFileSync(path.join(packageRoot, "安装.ps1"), "legacy installer\n");

execFileSync("python3", [
  path.join(repoRoot, "scripts", "create-release-zip.py"),
  packageRoot,
  archivePath,
]);

const inspection = JSON.parse(execFileSync("python3", [
  "-c",
  [
    "import json, sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1]) as archive:",
    "  rows = [{'name': item.filename, 'flags': item.flag_bits} for item in archive.infolist()]",
    "  archive.extractall(sys.argv[2])",
    "print(json.dumps(rows, ensure_ascii=False))",
  ].join("\n"),
  archivePath,
  extractRoot,
], { encoding: "utf8" }));

const legacyEntry = inspection.find((entry) => entry.name.endsWith("/安装.ps1"));
assert.ok(legacyEntry, "ZIP must preserve the exact legacy installer name");
assert.notEqual(
  legacyEntry.flags & 0x800,
  0,
  "legacy installer ZIP entry must declare UTF-8 filename encoding",
);
assert.equal(
  fs.existsSync(path.join(extractRoot, path.basename(packageRoot), "安装.ps1")),
  true,
  "UTF-8 aware extraction must produce the exact legacy installer path",
);

const buildScript = fs.readFileSync(
  path.join(repoRoot, "release", "build_windows_x64_release.sh"),
  "utf8",
);
assert.equal(buildScript.includes("scripts/create-release-zip.py"), true);
assert.equal(buildScript.includes("/usr/bin/zip -X"), false);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Windows release ZIP tests passed.");
