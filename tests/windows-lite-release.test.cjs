"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const versionConfig = JSON.parse(fs.readFileSync(
  path.join(repoRoot, "extension", "version.json"),
  "utf8",
));
let runtimePython = process.env.TIANYUAN_TEST_PYTHON_BIN || process.env.TIANYUAN_PYTHON_BIN || "";
const shell = process.env.TIANYUAN_BASH_BIN || (process.platform === "win32" ? "" : "/bin/bash");
if (!runtimePython && process.platform !== "win32") {
  try {
    runtimePython = execFileSync("python", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
  } catch {
  }
}

if (!runtimePython || !shell || !fs.existsSync(shell)) {
  test.skip("Windows lite shell-builder test requires explicit runtime paths on Windows", () => {});
} else {
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-lite-release-"));

try {
  const output = execFileSync(shell, [
    path.join(repoRoot, "release", "build_windows_x64_lite_release.sh"),
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      TIANYUAN_PYTHON_BIN: runtimePython,
      TIANYUAN_WORKBENCH_ROOT: path.join(tempRoot, "workbench"),
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

  const archiveInfo = JSON.parse(execFileSync(runtimePython, [
    "-c",
    [
      "import json, sys, zipfile",
      "with zipfile.ZipFile(sys.argv[1]) as archive:",
      "  entries = archive.infolist()",
      "  version_entries = [item for item in entries if item.filename.endswith('/VERSION.txt')]",
      "  if len(version_entries) != 1: raise SystemExit('expected one VERSION.txt')",
      "  result = {'entries': [{'name': item.filename, 'flags': item.flag_bits} for item in entries], 'versionText': archive.read(version_entries[0]).decode('utf-8')}",
      "  print(json.dumps(result, ensure_ascii=False))",
    ].join("\n"),
    archivePath,
  ], { encoding: "utf8" }));
  const { entries, versionText } = archiveInfo;
  const hasName = (suffix) => entries.some((entry) => entry.name.endsWith(suffix));

  assert.ok(entries.every((entry) => entry.name.startsWith("TianyuanWorkbench/")));
  assert.ok(entries.every((entry) => !entry.name.split("/").includes("..")));
  assert.equal(hasName("/install.ps1"), true);
  const legacyEntry = entries.find((entry) => entry.name.endsWith("/安装.ps1"));
  assert.ok(legacyEntry);
  assert.notEqual(legacyEntry.flags & 0x800, 0);
  assert.equal(hasName("/extension/manifest.json"), true);
  assert.equal(hasName("/native-helper/update_checker.js"), true);
  assert.equal(hasName("/native-helper/native_host_bootstrap.js"), true);
  assert.equal(hasName("/native-helper/alibaba-auction.js"), true);
  assert.equal(hasName("/native-helper/codex_catalog.js"), true);
  assert.equal(hasName("/native-helper/anjuke-property.js"), true);
  assert.equal(hasName("/scripts/install-local-runtime.mjs"), true);
  assert.equal(hasName("/scripts/runtime-fingerprint.mjs"), true);
  assert.equal(hasName("/runtime/node/node.exe"), false);
  assert.equal(entries.some((entry) => entry.name.includes("/runtime/python-portable/")), false);
  assert.equal(entries.some((entry) => entry.name.endsWith("/runtime/tycpv-setup-0.1.0-win-x64.exe")), false);

  assert.equal(versionText.includes(`version=${versionConfig.productVersion}`), true);
  assert.equal(versionText.includes("package_type=lite-update"), true);
  assert.equal(versionText.includes("requires_existing_runtime=true"), true);

  console.log("Windows lite release tests passed.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
}
