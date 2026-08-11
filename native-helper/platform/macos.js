"use strict";

const { execFile, execFileSync, spawn } = require("node:child_process");
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

  async function inspectActiveConversation() {
    const script = [
      "tell application \"System Events\"",
      "set separator to ASCII character 9",
      "set frontProcessName to name of first process whose frontmost is true",
      "set candidates to {{\"微信\", \"wechat\"}, {\"WeChat\", \"wechat\"}, {\"企业微信\", \"wecom\"}, {\"WeCom\", \"wecom\"}}",
      "repeat with candidate in candidates",
      "set processName to item 1 of candidate",
      "set appType to item 2 of candidate",
      "if processName is frontProcessName then",
      "tell process processName",
      "if (count windows) > 0 then",
      "set targetWindow to front window",
      "set windowTitle to \"\"",
      "set focusedTitle to \"\"",
      "set focusedDescription to \"\"",
      "try",
      "set windowTitle to name of targetWindow",
      "end try",
      "try",
      "set focusedElement to value of attribute \"AXFocusedUIElement\" of targetWindow",
      "set focusedTitle to value of attribute \"AXTitle\" of focusedElement",
      "end try",
      "try",
      "set focusedDescription to value of attribute \"AXDescription\" of focusedElement",
      "end try",
      "return \"ok\" & separator & appType & separator & windowTitle & separator & focusedTitle & separator & focusedDescription",
      "end if",
      "end tell",
      "end if",
      "end repeat",
      "return \"none\"",
      "end tell",
    ].join("\n");
    return await new Promise((resolve) => {
      runFile("/usr/bin/osascript", ["-e", script], { timeout: 10000, encoding: "utf8" }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            available: false,
            reason: "ACCESSIBILITY_READ_FAILED",
            message: "无法读取 macOS 界面。请在“系统设置 -> 隐私与安全性 -> 辅助功能”中允许承载插件的应用访问界面后重试。",
            security: common.security(),
          });
          return;
        }
        const parts = String(stdout || "").trim().split("\t");
        if (parts[0] !== "ok") {
          resolve({
            ok: true,
            available: false,
            reason: "NO_FRONTMOST_CHAT_WINDOW",
            message: "请先把微信或企业微信的目标聊天窗口置于最前面。",
            security: common.security(),
          });
          return;
        }
        const [, appType, windowName, focusedTitle, focusedDescription] = parts;
        const appNames = appType === "wecom" ? ["企业微信", "WeCom"] : ["微信", "WeChat"];
        const candidateNames = [focusedTitle, focusedDescription, windowName]
          .map((value) => String(value || "").trim())
          .filter((value) => value && !appNames.includes(value));
        resolve({
          ok: true,
          available: Boolean(candidateNames[0]),
          appType,
          windowName: String(windowName || "").trim(),
          conversationName: candidateNames[0] || "",
          observedLabels: candidateNames.slice(0, 5),
          confidence: candidateNames[0] ? "low" : "none",
          requiresConfirmation: true,
          message: candidateNames[0]
            ? "已读取到可见会话标识，请人工确认后再绑定。"
            : "已找到前台窗口，但应用没有暴露可识别的会话名称。",
          security: common.security(),
        });
      });
    });
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

  async function extractZip(zipPath, destination) {
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    await new Promise((resolve, reject) => {
      runFile("/usr/bin/ditto", ["-x", "-k", zipPath, destination], {
        timeout: 180000,
      }, (error) => error ? reject(error) : resolve());
    });
  }

  function launchWorkbenchInstaller({
    installerPath,
    statusPath,
    logPath,
    parentPid,
  }) {
    const runnerPath = path.join(path.dirname(statusPath), "run-update.sh");
    fs.writeFileSync(runnerPath, [
      "#!/bin/bash",
      "set +e",
      `deadline=$(( $(/bin/date +%s) + 5 ))`,
      `while [ $(/bin/date +%s) -lt "$deadline" ] && /bin/kill -0 ${Number(parentPid)} 2>/dev/null; do /bin/sleep 0.2; done`,
      `export TIANYUAN_UPDATE_MODE=1`,
      `export TIANYUAN_UPDATE_STATUS_PATH=${JSON.stringify(statusPath)}`,
      `/bin/bash ${JSON.stringify(installerPath)} >> ${JSON.stringify(logPath)} 2>&1`,
      "exit $?",
      "",
    ].join("\n"), { mode: 0o700 });
    const child = spawn("/bin/bash", [runnerPath], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();
    return { pid: child.pid, runnerPath };
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
    inspectActiveConversation,
    createCredentialReference,
    diagnostics,
    listenerPids,
    extractZip,
    launchWorkbenchInstaller,
    resolveCredentialReference,
    terminateProcess,
  };
}

module.exports = { createMacOSAdapter };
