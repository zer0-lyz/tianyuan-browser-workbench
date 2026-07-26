"use strict";

const { execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const common = require("./common.js");

function createMacOSAdapter(options = {}) {
  const runFile = options.execFile || execFile;
  const runFileSync = options.execFileSync || execFileSync;
  const homeDir = options.homeDir || os.homedir();
  const runtimeRoot = path.join(homeDir, ".tianyuan-workbench");

  function runAppleScript(script, timeout = 120000) {
    return new Promise((resolve) => {
      runFile("/usr/bin/osascript", ["-e", script], { timeout }, (error, stdout) => {
        resolve(error ? common.pickerFailure(error) : common.pickerResult(stdout));
      });
    });
  }

  async function chooseDirectory(prompt) {
    const safePrompt = String(prompt || "").replace(/"/g, '\\"');
    return await runAppleScript([
      `set selectedFolder to choose folder with prompt "${safePrompt}"`,
      "POSIX path of selectedFolder",
    ].join("\n"));
  }

  async function chooseWorkbookFiles() {
    return await runAppleScript([
      "set selectedFiles to choose file with prompt \"选择需要调整打印格式的 Excel 文件\" with multiple selections allowed",
      "set outputText to \"\"",
      "repeat with selectedFile in selectedFiles",
      "set outputText to outputText & POSIX path of selectedFile & linefeed",
      "end repeat",
      "return outputText",
    ].join("\n"));
  }

  async function listenerPids(port) {
    const lsofBin = ["/usr/sbin/lsof", "/usr/bin/lsof", "lsof"].find((candidate) =>
      candidate === "lsof" || fs.existsSync(candidate)
    );
    try {
      const output = await new Promise((resolve, reject) => {
        runFile(lsofBin, [
          "-nP",
          `-iTCP:${Number(port)}`,
          "-sTCP:LISTEN",
          "-t",
        ], { timeout: 5000, encoding: "utf8" }, (error, stdout) =>
          error ? reject(error) : resolve(stdout)
        );
      });
      return [...new Set(String(output || "").split(/\s+/)
        .map(Number)
        .filter((pid) => Number.isInteger(pid) && pid > 0))];
    } catch {
      return [];
    }
  }

  async function terminateProcess(pid) {
    try {
      process.kill(pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  }

  function createCredentialReference({ service, account, fallbackPath, key, secret }) {
    try {
      runFileSync("security", [
        "add-generic-password",
        "-U",
        "-s",
        service,
        "-a",
        account,
        "-w",
        secret,
      ], { stdio: ["ignore", "ignore", "ignore"], timeout: 5000 });
      return `keychain:${service}:${account}`;
    } catch {
      return common.createFileCredentialReference({ fallbackPath, key, secret });
    }
  }

  function resolveCredentialReference(reference) {
    if (String(reference || "").startsWith("file:")) {
      return common.resolveFileCredentialReference(reference);
    }
    if (!String(reference || "").startsWith("keychain:")) return "";
    const [, service, account] = String(reference).split(":");
    if (!service || !account) return "";
    try {
      return String(runFileSync("security", [
        "find-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
      ], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }) || "").trim();
    } catch {
      return "";
    }
  }

  function diagnostics() {
    return {
      id: "macos",
      platform: "darwin",
      supported: true,
      runtimeRoot,
      filePicker: "osascript-standard-additions",
      credentialStore: "macos-keychain",
      processControl: "lsof-sigterm",
      dependencies: {
        osascript: fs.existsSync("/usr/bin/osascript"),
        security: common.commandAvailable(runFileSync, "security", ["help"]),
        lsof: fs.existsSync("/usr/sbin/lsof") || fs.existsSync("/usr/bin/lsof"),
      },
    };
  }

  return {
    id: "macos",
    platform: "darwin",
    isWindows: false,
    isMacOS: true,
    runtimeRoot,
    defaultPythonBin: "/usr/bin/python3",
    defaultPrintSkillsDir: path.join(
      runtimeRoot,
      "dependencies",
      "天源评估系统",
      "print-format-skills",
    ),
    cliCandidates: ["/usr/local/bin/tycpv"],
    cliFallback: "/usr/local/bin/tycpv",
    chooseDirectory,
    chooseWorkbookFiles,
    createCredentialReference,
    diagnostics,
    listenerPids,
    resolveCredentialReference,
    terminateProcess,
  };
}

module.exports = { createMacOSAdapter };
