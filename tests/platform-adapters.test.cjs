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

  const makePythonFixture = (home, label) => {
    const pythonPath = path.join(home, ".tianyuan-workbench", label, "bin", "python3");
    fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
    fs.writeFileSync(pythonPath, "#!/bin/sh\n");
    fs.chmodSync(pythonPath, 0o755);
    return pythonPath;
  };
  const unsupportedPythonHome = path.join(tempRoot, "mac-python-311");
  const unsupportedPython = makePythonFixture(unsupportedPythonHome, "python");
  const unsupportedPythonAdapter = createPlatformAdapter({
    platform: "darwin",
    homeDir: unsupportedPythonHome,
    execFileSync(command, args) {
      if (command === unsupportedPython) {
        const script = String(args?.[1] || "");
        if (script.includes("sys.version_info")) return "3.11.9\n";
        throw new Error("required dependency missing");
      }
      if (command === "which") return `${unsupportedPython}\n`;
      throw new Error("not available");
    },
  });
  const unsupportedPreflight = unsupportedPythonAdapter.preflightUpdate({
    update: { asset: { name: "tianyuan-workbench-v0.15.0-macos-arm64-lite.zip" } },
  });
  assert.equal(unsupportedPreflight.ok, false);
  assert.equal(unsupportedPreflight.reason, "UPDATE_PYTHON_RUNTIME_ABI_UNSUPPORTED");
  assert.deepEqual(unsupportedPreflight.supportedPythonAbis, ["3.9", "3.14"]);
  assert.deepEqual(unsupportedPreflight.detectedPythonVersions, ["3.11.9"]);
  assert.equal(unsupportedPreflight.currentVersionUnchanged, true);

  const createPythonHome = path.join(tempRoot, "mac-python-39");
  const createPython = makePythonFixture(createPythonHome, "python");
  const createPythonAdapter = createPlatformAdapter({
    platform: "darwin",
    homeDir: createPythonHome,
    execFileSync(command, args) {
      if (command === createPython) {
        const script = String(args?.[1] || "");
        if (script.includes("sys.version_info")) return "3.9.18\n";
        if (script.includes("ensurepip, venv")) return "";
        throw new Error("required dependency missing");
      }
      if (command === "which") return `${createPython}\n`;
      throw new Error("not available");
    },
  });
  const createPreflight = createPythonAdapter.preflightUpdate({
    update: { asset: { name: "tianyuan-workbench-v0.15.0-macos-arm64-lite.zip" } },
  });
  assert.equal(createPreflight.ok, true);
  assert.equal(createPreflight.pythonAbi, "3.9");
  assert.equal(createPreflight.dependenciesReady, false);
  assert.equal(createPreflight.canCreateVenv, true);

  const configuredPythonHome = path.join(tempRoot, "mac-configured-python");
  const configuredPython = path.join(tempRoot, "external-python311");
  fs.writeFileSync(configuredPython, "#!/bin/sh\n");
  fs.chmodSync(configuredPython, 0o755);
  const configuredRuntimeRoot = path.join(configuredPythonHome, ".tianyuan-workbench");
  fs.mkdirSync(configuredRuntimeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(configuredRuntimeRoot, "runtime-config.json"),
    JSON.stringify({ pythonBin: configuredPython }),
  );
  const configuredPythonAdapter = createPlatformAdapter({
    platform: "darwin",
    homeDir: configuredPythonHome,
    execFileSync(command, args) {
      if (command === configuredPython) {
        const script = String(args?.[1] || "");
        if (script.includes("sys.version_info")) return "3.11.9\n";
        if (script.includes("import docx")) return "";
      }
      throw new Error("not available");
    },
  });
  const configuredPreflight = configuredPythonAdapter.preflightUpdate({
    update: { asset: { name: "tianyuan-workbench-v0.15.0-macos-arm64-lite.zip" } },
  });
  assert.equal(configuredPreflight.ok, false);
  assert.equal(configuredPreflight.reason, "UPDATE_PYTHON_RUNTIME_ABI_UNSUPPORTED");
  assert.deepEqual(configuredPreflight.detectedPythonVersions, ["3.11.9"]);

  const managedPythonHome = path.join(tempRoot, "mac-managed-python");
  const managedPython = makePythonFixture(managedPythonHome, "python");
  const managedPythonAdapter = createPlatformAdapter({
    platform: "darwin",
    homeDir: managedPythonHome,
    execFileSync(command, args) {
      if (command === managedPython) {
        const script = String(args?.[1] || "");
        if (script.includes("sys.version_info")) return "3.11.9\n";
        if (script.includes("import docx")) return "";
      }
      throw new Error("not available");
    },
  });
  const managedPreflight = managedPythonAdapter.preflightUpdate({
    update: { asset: { name: "tianyuan-workbench-v0.15.0-macos-arm64-lite.zip" } },
  });
  assert.equal(managedPreflight.ok, true);
  assert.equal(managedPreflight.dependenciesReady, true);
  assert.equal(managedPreflight.pythonAbi, "3.11");

  const unavailableMac = createPlatformAdapter({
    platform: "darwin",
    homeDir: path.join(tempRoot, "mac-empty-home"),
    execFileSync() {
      throw new Error("runtime unavailable");
    },
  });
  const pythonPreflight = unavailableMac.preflightUpdate({
    update: { asset: { name: "tianyuan-workbench-v0.15.0-macos-arm64-lite.zip" } },
  });
  assert.equal(pythonPreflight.ok, false);
  assert.equal(pythonPreflight.reason, "UPDATE_PYTHON_RUNTIME_UNAVAILABLE");
  assert.equal(pythonPreflight.currentVersionUnchanged, true);

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
