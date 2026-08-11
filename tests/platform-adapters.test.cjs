"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPlatformAdapter } = require("../native-helper/platform/index.js");

async function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-platform-"));
  const windowsHome = path.join(tempRoot, "windows-home");
  const windowsEnv = {
    LOCALAPPDATA: path.join(tempRoot, "local-app-data"),
    ProgramFiles: path.join(tempRoot, "program-files"),
  };
  const windowsExecFileSync = (_command, _args, options = {}) => {
    if (options.env?.TIANYUAN_CONNECTOR_SECRET) {
      return Buffer.from(options.env.TIANYUAN_CONNECTOR_SECRET, "utf8").toString("base64");
    }
    if (options.env?.TIANYUAN_CONNECTOR_PROTECTED_SECRET) {
      return Buffer.from(options.env.TIANYUAN_CONNECTOR_PROTECTED_SECRET, "base64").toString("utf8");
    }
    return "available";
  };
  const windows = createPlatformAdapter({
    platform: "win32",
    homeDir: windowsHome,
    env: windowsEnv,
    execFileSync: windowsExecFileSync,
    execFile(_command, _args, _options, callback) {
      callback(null, "C:\\Exports\r\n");
    },
  });
  assert.equal(windows.id, "windows");
  assert.equal(windows.runtimeRoot, path.join(windowsEnv.LOCALAPPDATA, "TianyuanWorkbench"));
  assert.equal(windows.defaultPythonBin.endsWith(path.join("python", "python.exe")), true);
  const windowsSelection = await windows.chooseDirectory("选择目录");
  assert.deepEqual(windowsSelection.paths, ["C:\\Exports"]);
  const windowsCredentialPath = path.join(tempRoot, "windows-credentials.json");
  const windowsReference = windows.createCredentialReference({
    fallbackPath: windowsCredentialPath,
    key: "codex-test",
    secret: "windows-secret",
  });
  assert.equal(windowsReference.startsWith("dpapi:"), true);
  assert.equal(windows.resolveCredentialReference(windowsReference), "windows-secret");
  assert.equal(windows.diagnostics().credentialStore, "windows-dpapi");

  const keychain = new Map();
  const mac = createPlatformAdapter({
    platform: "darwin",
    homeDir: path.join(tempRoot, "mac-home"),
    execFile(_command, args, _options, callback) {
      if (args?.[0] === "-e" && String(args?.[1] || "").includes("frontProcessName")) {
        callback(null, "ok\twechat\tWeChat\t测试群\t\n");
        return;
      }
      callback(null, "/Users/test/Exports/\n");
    },
    execFileSync(command, args) {
      if (command === "security" && args[0] === "add-generic-password") {
        keychain.set(`${args[3]}:${args[5]}`, args[7]);
        return "";
      }
      if (command === "security" && args[0] === "find-generic-password") {
        return keychain.get(`${args[2]}:${args[4]}`) || "";
      }
      return "available";
    },
  });
  assert.equal(mac.id, "macos");
  assert.equal(mac.runtimeRoot, path.join(tempRoot, "mac-home", ".tianyuan-workbench"));
  const macSelection = await mac.chooseDirectory("选择目录");
  assert.deepEqual(macSelection.paths, ["/Users/test/Exports/"]);
  const activeConversation = await mac.inspectActiveConversation();
  assert.equal(activeConversation.available, true);
  assert.equal(activeConversation.appType, "wechat");
  assert.equal(activeConversation.conversationName, "测试群");
  const macReference = mac.createCredentialReference({
    service: "com.tianyuan.test",
    account: "connector",
    fallbackPath: path.join(tempRoot, "mac-credentials.json"),
    key: "codex-test",
    secret: "mac-secret",
  });
  assert.equal(macReference, "keychain:com.tianyuan.test:connector");
  assert.equal(mac.resolveCredentialReference(macReference), "mac-secret");
  assert.equal(mac.diagnostics().credentialStore, "macos-keychain");

  const unsupported = createPlatformAdapter({
    platform: "linux",
    homeDir: path.join(tempRoot, "linux-home"),
  });
  assert.equal(unsupported.diagnostics().supported, false);
  assert.equal((await unsupported.chooseDirectory("选择目录")).reason, "PLATFORM_FILE_PICKER_UNSUPPORTED");

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log("Platform adapter tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
