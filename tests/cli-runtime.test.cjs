"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  cliUnavailableMessage,
  resolveExecutableCandidates,
} = require("../native-helper/cli-runtime.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-cli-runtime-"));
const cliPath = path.join(root, process.platform === "win32" ? "tycpv.cmd" : "tycpv");
const env = {
  PATH: root,
  PATHEXT: process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD",
  TYCPV_BIN: "",
};

try {
  fs.writeFileSync(cliPath, process.platform === "win32" ? "@echo off\r\necho fake\r\n" : "#!/bin/sh\necho fake\n");
  if (process.platform !== "win32") fs.chmodSync(cliPath, 0o755);
  assert.deepEqual(
    resolveExecutableCandidates({ env, configuredBin: path.join(root, "old-location", "tycpv"), fallback: "tycpv", platform: process.platform }),
    [cliPath],
    "a stale saved location must not block fresh PATH discovery",
  );

  fs.rmSync(cliPath, { force: true });
  assert.deepEqual(
    resolveExecutableCandidates({ env, configuredBin: cliPath, fallback: "tycpv", platform: process.platform }),
    [],
    "discovery must be refreshed after CLI removal",
  );

  const message = cliUnavailableMessage("TYCPV_NOT_FOUND");
  assert.match(message, /天源官方渠道/);
  assert.match(message, /无需先做登录授权/);
  assert.match(message, /只限制 CLI 相关导出/);
  assert.doesNotMatch(message, /https?:\/\//, "do not invent a download URL");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("CLI runtime discovery tests passed");
