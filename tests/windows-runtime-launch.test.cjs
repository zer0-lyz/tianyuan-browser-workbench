"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  commandLaunchSpec,
  normalizeRuntimeConfig,
  runtimeDirectory,
  selfLaunchSpec,
} = require("../native-helper/process_launcher.js");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-launch-"));
const scriptPath = path.join(tempRoot, "native_host.js");
fs.writeFileSync(scriptPath, "");

const scriptLaunch = selfLaunchSpec(["--connector-bridge"], {
  argv: ["node.exe", scriptPath, "--start-connector"],
  execPath: "C:\\Program Files\\nodejs\\node.exe",
  env: {},
});
assert.equal(scriptLaunch.mode, "node-script");
assert.deepEqual(scriptLaunch.args, [scriptPath, "--connector-bridge"]);

const seaLaunch = selfLaunchSpec(["--connector-bridge"], {
  argv: ["C:\\TianyuanWorkbench\\native_host.exe", "--start-connector"],
  execPath: "C:\\TianyuanWorkbench\\native_host.exe",
  env: {},
});
assert.equal(seaLaunch.mode, "standalone-executable");
assert.deepEqual(seaLaunch.args, ["--connector-bridge"]);

assert.equal(runtimeDirectory({
  argv: ["node.exe", scriptPath],
  execPath: "C:\\Program Files\\nodejs\\node.exe",
  env: {},
}), tempRoot);
assert.equal(runtimeDirectory({
  argv: ["native_host.exe"],
  execPath: path.join(tempRoot, "native_host.exe"),
  env: {},
}), tempRoot);

const direct = commandLaunchSpec("C:\\Tools\\tycpv.exe", ["--version"], {
  platform: "win32",
  env: { TEST: "1" },
});
assert.equal(direct.mode, "direct");
assert.equal(direct.command, "C:\\Tools\\tycpv.exe");

const wrapper = commandLaunchSpec(
  "C:\\Tools\\tycpv.cmd",
  ["export", "--out-dir", "C:\\Exports\\A & B"],
  {
    platform: "win32",
    env: { TEST: "1" },
  },
);
assert.equal(wrapper.mode, "windows-command-wrapper");
assert.equal(wrapper.command, "powershell.exe");
assert.equal(wrapper.args.includes("-EncodedCommand"), true);
const payload = JSON.parse(
  Buffer.from(wrapper.env.TIANYUAN_PROCESS_PAYLOAD, "base64").toString("utf8"),
);
assert.equal(payload.command, "C:\\Tools\\tycpv.cmd");
assert.deepEqual(payload.args, ["export", "--out-dir", "C:\\Exports\\A & B"]);
assert.equal(wrapper.args.join(" ").includes("A & B"), false);

assert.deepEqual(normalizeRuntimeConfig({
  cli: "C:\\Old\\tycpv.cmd",
  python: "C:\\Python\\python.exe",
}), {
  cli: "C:\\Old\\tycpv.cmd",
  python: "C:\\Python\\python.exe",
  tycpvBin: "C:\\Old\\tycpv.cmd",
  pythonBin: "C:\\Python\\python.exe",
  printSkillsDir: "",
});

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Windows runtime launch tests passed.");
