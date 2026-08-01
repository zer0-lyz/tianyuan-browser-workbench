"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const repairScript = fs.readFileSync(
  path.join(repoRoot, "release", "windows-x64", "repair-update-source.cmd"),
  "utf8",
);

assert.equal(repairScript.includes("TianyuanWorkbench\\native-helper\\update-sources.json"), true);
assert.equal(
  repairScript.includes("https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/latest/download/update-manifest.json"),
  true,
);
assert.equal(repairScript.includes("ExecutionPolicy Bypass"), true);

console.log("Windows update source repair script tests passed.");
