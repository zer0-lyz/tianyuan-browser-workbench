"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function main() {
const repoRoot = path.resolve(__dirname, "..");
const versionConfig = JSON.parse(fs.readFileSync(
  path.join(repoRoot, "extension", "version.json"),
  "utf8",
));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-macos-lite-release-"));

if (process.platform !== "darwin" || process.arch !== "arm64") {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log("macOS lite release test skipped: requires macOS arm64.");
  return;
}

let output;
try {
  output = execFileSync("bash", [
    path.join(repoRoot, "release", "build_macos_arm64_lite_release.sh"),
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      TIANYUAN_RELEASE_OUTPUT_DIR: tempRoot,
      TIANYUAN_RELEASE_BUILD_ROOT: path.join(tempRoot, "builds"),
      TIANYUAN_WORKBENCH_ROOT: path.join(tempRoot, "workbench"),
      RELEASE_DATE: "20260728",
      PIP_DEFAULT_TIMEOUT: "8",
      PIP_RETRIES: "0",
    },
    encoding: "utf8",
  });
} catch (error) {
  const details = `${error?.stdout || ""}\n${error?.stderr || ""}`;
  if (/files\.pythonhosted\.org|ReadTimeout|timed out|network/i.test(details)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    console.log("macOS lite release test skipped: public wheel download unavailable.");
    return;
  }
  throw error;
}

const archivePath = output.trim().split(/\r?\n/).find((line) => line.endsWith(".zip"));
assert.ok(archivePath, output);
assert.equal(fs.existsSync(archivePath), true);
assert.match(path.basename(archivePath), /macos-arm64-lite/);
// Since 0.14.32 the lite package reuses the machine's installed runtime and
// no longer bundles the two ~8.5 MB lxml universal2 wheels. It must stay far
// below the Gitee anonymous raw download limit while still carrying the
// pinned wheel manifest used to repair incomplete environments.
assert.ok(fs.statSync(archivePath).size > 512 * 1024, "lite package is unexpectedly small");
assert.ok(fs.statSync(archivePath).size < 5 * 1024 * 1024, "lite package must stay below the Gitee anonymous raw limit");

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
const lxmlWheels = entries.filter((entry) => /\/lxml-.*-macosx_.*\.whl$/.test(entry));
assert.deepEqual(lxmlWheels, [], "lite package must not bundle lxml wheels");
assert.equal(hasName("/runtime/python-wheels/lxml-wheels.json"), true, "lite package must carry the pinned lxml wheel manifest");

assert.equal(hasName("/安装.command"), true);
assert.equal(hasName("/native-helper/update_checker.js"), true);
assert.equal(hasName("/scripts/install-local-runtime.mjs"), true);
assert.equal(hasName("/scripts/runtime-fingerprint.mjs"), true);
assert.equal(entries.some((entry) => entry.includes("/runtime/python-wheels/openpyxl-")), true);
assert.equal(entries.some((entry) => entry.endsWith("/runtime/tycpv-setup-0.1.0-macos-arm64.pkg")), false);
assert.equal(entries.some((entry) => entry.endsWith("/runtime/python-3.14.6-macos11.pkg")), false);

const wheelManifest = JSON.parse(execFileSync("/usr/bin/unzip", [
  "-p",
  archivePath,
  "*/runtime/python-wheels/lxml-wheels.json",
], { encoding: "utf8" }));
assert.equal(Array.isArray(wheelManifest), true);
assert.equal(wheelManifest.length, 2);
const seenTargets = new Set();
for (const entry of wheelManifest) {
  assert.match(entry.fileName, /^lxml-6\.1\.0-cp\d+-cp\d+-macosx_.*\.whl$/);
  assert.match(entry.pythonTarget, /^cp\d+$/);
  seenTargets.add(entry.pythonTarget);
  assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.ok(entry.size > 1024 * 1024, "lxml wheel asset must be a real binary wheel");
  assert.deepEqual(entry.urls.length, 2);
  assert.equal(entry.urls[0], `https://gitee.com/zer0_y/tianyuan-browser-workbench-releases/raw/master/${entry.fileName}`);
  assert.match(entry.urls[0], /^https:\/\/gitee\.com\//);
  assert.match(entry.urls[1], /^https:\/\/github\.com\/zer0-lyz\/tianyuan-browser-workbench-releases\/releases\/download\//);
  assert.ok(entry.urls[1].endsWith(`/${entry.fileName}`));
}
assert.deepEqual([...seenTargets].sort(), ["cp314", "cp39"], "both CPython 3.9 and 3.14 must stay supported");

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
}

main();
