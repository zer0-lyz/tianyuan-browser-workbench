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
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-macos-lite-release-"));

const output = execFileSync("bash", [
  path.join(repoRoot, "release", "build_macos_arm64_lite_release.sh"),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    TIANYUAN_RELEASE_OUTPUT_DIR: tempRoot,
    TIANYUAN_RELEASE_BUILD_ROOT: path.join(tempRoot, "builds"),
    TIANYUAN_WORKBENCH_ROOT: path.join(tempRoot, "workbench"),
    RELEASE_DATE: "20260728",
  },
  encoding: "utf8",
});

const archivePath = output.trim().split(/\r?\n/).find((line) => line.endsWith(".zip"));
assert.ok(archivePath, output);
assert.equal(fs.existsSync(archivePath), true);
assert.match(path.basename(archivePath), /macos-arm64-lite/);
assert.ok(fs.statSync(archivePath).size < 10 * 1024 * 1024);

const entries = JSON.parse(execFileSync("python3", [
  "-c",
  [
    "import json, sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1]) as archive:",
    "  print(json.dumps([item.filename for item in archive.infolist()], ensure_ascii=False))",
  ].join("\n"),
  archivePath,
], { encoding: "utf8" }));
const hasName = (suffix) => entries.some((entry) => entry.endsWith(suffix));

assert.equal(hasName("/安装.command"), true);
assert.equal(hasName("/native-helper/update_checker.js"), true);
assert.equal(hasName("/scripts/install-local-runtime.mjs"), true);
assert.equal(entries.some((entry) => entry.includes("/runtime/python-wheels/openpyxl-")), true);
assert.equal(entries.some((entry) => entry.endsWith("/runtime/tycpv-setup-0.1.0-macos-arm64.pkg")), false);
assert.equal(entries.some((entry) => entry.endsWith("/runtime/python-3.14.6-macos11.pkg")), false);

const versionText = execFileSync("/usr/bin/unzip", [
  "-p",
  archivePath,
  "*/VERSION.txt",
], { encoding: "utf8" });
assert.equal(versionText.includes(`version=${versionConfig.productVersion}`), true);
assert.equal(versionText.includes("package_type=lite-update"), true);
assert.equal(versionText.includes("requires_existing_runtime=true"), true);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("macOS lite release tests passed.");
