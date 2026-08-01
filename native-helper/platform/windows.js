"use strict";

const { execFile, execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const common = require("./common.js");

function createWindowsAdapter(options = {}) {
  const runFile = options.execFile || execFile;
  const runFileSync = options.execFileSync || execFileSync;
  const launchProcess = options.spawn || spawn;
  const env = options.env || process.env;
  const homeDir = options.homeDir || os.homedir();
  const localAppData = env.LOCALAPPDATA || path.join(homeDir, "AppData", "Local");
  const runtimeRoot = path.join(localAppData, "TianyuanWorkbench");

  function runPowerShell(script, timeout = 120000, extraEnv = {}) {
    return new Promise((resolve) => {
      const encodedCommand = Buffer.from(script, "utf16le").toString("base64");
      runFile("powershell.exe", [
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodedCommand,
      ], {
        timeout,
        windowsHide: true,
        encoding: "utf8",
        env: { ...env, ...extraEnv },
      }, (error, stdout) => {
        resolve(error ? common.pickerFailure(error) : common.pickerResult(stdout));
      });
    });
  }

  function powerShellPreamble() {
    return [
      "$ErrorActionPreference = 'Stop'",
      "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
      "Add-Type -AssemblyName System.Windows.Forms",
    ].join("\n");
  }

  async function chooseDirectory(prompt) {
    const safePrompt = String(prompt || "").replace(/'/g, "''");
    return await runPowerShell([
      powerShellPreamble(),
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      `$dialog.Description = '${safePrompt}'`,
      "$dialog.ShowNewFolderButton = $true",
      "if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }",
      "[Console]::Out.WriteLine($dialog.SelectedPath)",
    ].join("\n"));
  }

  async function chooseWorkbookFiles() {
    return await runPowerShell([
      powerShellPreamble(),
      "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
      "$dialog.Title = '选择需要调整打印格式的 Excel 文件'",
      "$dialog.Filter = 'Excel 工作簿 (*.xlsx;*.xlsm)|*.xlsx;*.xlsm'",
      "$dialog.Multiselect = $true",
      "if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }",
      "$dialog.FileNames | ForEach-Object { [Console]::Out.WriteLine($_) }",
    ].join("\n"));
  }

  async function listenerPids(port) {
    try {
      const output = await new Promise((resolve, reject) => {
        runFile("netstat.exe", ["-ano", "-p", "tcp"], {
          timeout: 5000,
          encoding: "utf8",
        }, (error, stdout) => error ? reject(error) : resolve(stdout));
      });
      const portPattern = new RegExp(
        `(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\]|\\[::\\]):${Number(port)}\\s+\\S+\\s+LISTENING\\s+(\\d+)`,
        "i",
      );
      return [...new Set(String(output || "").split(/\r?\n/)
        .map((line) => line.match(portPattern)?.[1])
        .filter(Boolean)
        .map(Number)
        .filter((pid) => Number.isInteger(pid) && pid > 0))];
    } catch {
      return [];
    }
  }

  async function terminateProcess(pid) {
    return await new Promise((resolve) => {
      runFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        timeout: 5000,
        windowsHide: true,
      }, (error) => resolve(!error));
    });
  }

  async function extractZip(zipPath, destination) {
    fs.mkdirSync(destination, { recursive: true });
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `Expand-Archive -LiteralPath '${String(zipPath).replace(/'/g, "''")}' -DestinationPath '${String(destination).replace(/'/g, "''")}' -Force`,
    ].join("\n");
    await new Promise((resolve, reject) => {
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      runFile("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ], { timeout: 180000, windowsHide: true }, (error) =>
        error ? reject(error) : resolve()
      );
    });
  }

  function launchWorkbenchInstaller({
    installerPath,
    statusPath,
    logPath,
    parentPid,
  }) {
    const runnerPath = path.join(path.dirname(statusPath), "run-update.ps1");
    const quote = (value) => String(value).replace(/'/g, "''");
    fs.writeFileSync(runnerPath, [
      "$ErrorActionPreference = 'Stop'",
      `$ParentPid = ${Number(parentPid)}`,
      "$RunnerPid = $PID",
      `$StatusPath = '${quote(statusPath)}'`,
      `$LogPath = '${quote(logPath)}'`,
      "$InstallerPid = $RunnerPid",
      "function Protect-UpdateMessage([string]$Message) { return ($Message -replace '(?i)(bearer\\s+)[^\\s]+', '$1[REDACTED]' -replace '(?i)(authorization|cookie|password|验证码|token)\\s*[:=]\\s*[^\\s,;]+', '$1=[REDACTED]') }",
      "function Write-UpdateStatus([string]$Phase, [int]$Percent, [string]$Message, [string]$Reason = '', [int]$ExitCode = 0) {",
      "  $payload = [ordered]@{ ok = $Phase -ne 'failed'; action = 'workbench_update'; phase = $Phase; percent = $Percent; message = $Message; reason = (Protect-UpdateMessage $Reason); exitCode = $ExitCode; installerPid = $InstallerPid; updatedAt = [DateTime]::UtcNow.ToString('o'); logPath = $LogPath; security = @{ credentialsReturned = $false; tokenUsed = $false } }",
      "  New-Item -ItemType Directory -Path (Split-Path -Parent $StatusPath) -Force | Out-Null",
      "  $temporary = \"$StatusPath.tmp-$PID\"",
      "  $payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporary -Encoding UTF8",
      "  Move-Item -LiteralPath $temporary -Destination $StatusPath -Force",
      "}",
      "$LogDirectory = Split-Path -Parent $LogPath",
      "New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null",
      "\"runnerPid=$RunnerPid\" | Set-Content -LiteralPath $LogPath -Encoding UTF8",
      "Write-UpdateStatus 'preparing' 74 '更新程序已启动，正在准备停止工作台服务'",
      "$Deadline = (Get-Date).AddSeconds(15)",
      "while ((Get-Date) -lt $Deadline -and (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 200 }",
      "if (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) { throw 'UPDATE_PARENT_PROCESS_NOT_EXITED' }",
      "Write-UpdateStatus 'stopping_services' 76 '正在停止工作台服务并等待文件释放'",
      "$env:TIANYUAN_UPDATE_MODE = '1'",
      `$env:TIANYUAN_UPDATE_STATUS_PATH = '${quote(statusPath)}'`,
      `$env:TIANYUAN_UPDATE_LOG_PATH = '${quote(logPath)}'`,
      "$env:TIANYUAN_UPDATE_INSTALLER_PID = \"$InstallerPid\"",
      `& '${quote(installerPath)}' *>> '${quote(logPath)}'`,
      "$InstallerExitCode = [int]$LASTEXITCODE",
      "if ($InstallerExitCode -ne 0) { throw \"UPDATE_INSTALLER_EXIT_$InstallerExitCode\" }",
      "if (-not (Test-Path -LiteralPath $StatusPath)) { throw 'UPDATE_COMPLETION_STATUS_MISSING' }",
      "$final = Get-Content -LiteralPath $StatusPath -Raw -Encoding UTF8 | ConvertFrom-Json",
      "if ($final.phase -notin @('complete')) { throw 'UPDATE_COMPLETION_STATUS_MISSING' }",
      "exit 0",
      "",
      "trap {",
      "  $reason = Protect-UpdateMessage $_.Exception.Message",
      "  try { $existing = if (Test-Path -LiteralPath $StatusPath) { Get-Content -LiteralPath $StatusPath -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null } } catch { $existing = $null }",
      "  if ($existing -and $existing.phase -eq 'failed' -and $existing.reason) { $reason = Protect-UpdateMessage ([string]$existing.reason) }",
      "  $failedPercent = 0; if ($existing -and $existing.percent) { $failedPercent = [int]$existing.percent }",
      "  try { Write-UpdateStatus 'failed' $failedPercent '工作台更新失败' $reason ([int]($LASTEXITCODE)) } catch {}",
      "  exit 1",
      "}",
    ].join("\r\n"), "utf8");
    const child = launchProcess("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      runnerPath,
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...env },
    });
    child.once("error", (error) => {
      const reason = String(error?.code === "ENOENT" ? "UPDATE_RUNNER_NOT_FOUND" : error?.message || error)
        .replace(/bearer\s+\S+/gi, "Bearer [REDACTED]")
        .replace(/(authorization|cookie|password|验证码|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
        .slice(0, 500);
      try {
        const current = fs.existsSync(statusPath)
          ? JSON.parse(fs.readFileSync(statusPath, "utf8"))
          : {};
        const next = {
          ...current,
          ok: false,
          action: "workbench_update",
          phase: "failed",
          reason,
          message: "更新程序启动失败",
          installerPid: child.pid || null,
          logPath,
          updatedAt: new Date().toISOString(),
          security: { credentialsReturned: false, tokenUsed: false },
        };
        const temporary = `${statusPath}.spawn-error-${process.pid}`;
        fs.writeFileSync(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600 });
        fs.renameSync(temporary, statusPath);
      } catch {
        // The detached runner will write the durable failure state when possible.
      }
    });
    child.unref();
    return { pid: child.pid, runnerPath };
  }

  function createCredentialReference({ fallbackPath, key, secret }) {
    try {
      const script = [
        "$ErrorActionPreference = 'Stop'",
        "$plain = [Text.Encoding]::UTF8.GetBytes($env:TIANYUAN_CONNECTOR_SECRET)",
        "$protected = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
        "[Console]::Out.Write([Convert]::ToBase64String($protected))",
      ].join("\n");
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      const protectedSecret = String(runFileSync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ], {
        encoding: "utf8",
        windowsHide: true,
        env: { ...env, TIANYUAN_CONNECTOR_SECRET: secret },
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }) || "").trim();
      if (!protectedSecret) throw new Error("DPAPI_EMPTY_RESULT");
      const values = common.readJson(fallbackPath, { protected: {} });
      values.protected = values.protected || {};
      values.protected[key] = protectedSecret;
      common.writeJson(fallbackPath, values);
      return `dpapi:${fallbackPath}#${key}`;
    } catch {
      return common.createFileCredentialReference({ fallbackPath, key, secret });
    }
  }

  function resolveCredentialReference(reference) {
    if (String(reference || "").startsWith("file:")) {
      return common.resolveFileCredentialReference(reference);
    }
    if (!String(reference || "").startsWith("dpapi:")) return "";
    const [filePart, key] = String(reference).slice(6).split("#");
    if (!filePart || !key) return "";
    try {
      const values = common.readJson(filePart, {});
      const protectedSecret = String(values?.protected?.[key] || "");
      if (!protectedSecret) return "";
      const script = [
        "$ErrorActionPreference = 'Stop'",
        "$protected = [Convert]::FromBase64String($env:TIANYUAN_CONNECTOR_PROTECTED_SECRET)",
        "$plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
        "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))",
      ].join("\n");
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      return String(runFileSync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ], {
        encoding: "utf8",
        windowsHide: true,
        env: { ...env, TIANYUAN_CONNECTOR_PROTECTED_SECRET: protectedSecret },
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }) || "").trim();
    } catch {
      return "";
    }
  }

  function diagnostics() {
    return {
      id: "windows",
      platform: "win32",
      supported: true,
      runtimeRoot,
      filePicker: "powershell-winforms",
      credentialStore: "windows-dpapi",
      processControl: "netstat-taskkill",
      dependencies: {
        powershell: common.commandAvailable(runFileSync, "powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$PSVersionTable.PSVersion.ToString()",
        ]),
        netstat: common.commandAvailable(runFileSync, "netstat.exe", ["-ano", "-p", "tcp"]),
        taskkill: common.commandAvailable(runFileSync, "taskkill.exe", ["/?"]),
      },
    };
  }

  return {
    id: "windows",
    platform: "win32",
    isWindows: true,
    isMacOS: false,
    runtimeRoot,
    defaultPythonBin: path.join(runtimeRoot, "python", "python.exe"),
    defaultPrintSkillsDir: path.join(runtimeRoot, "print-format-skills"),
    cliCandidates: [
      path.join(localAppData, "Programs", "tycpv", "tycpv.exe"),
      path.join(localAppData, "Programs", "tycpv", "bin", "tycpv.exe"),
      path.join(localAppData, "Programs", "tycpv", "tycpv.cmd"),
      path.join(localAppData, "Programs", "tycpv", "bin", "tycpv.cmd"),
      path.join(localAppData, "tycpv", "tycpv.exe"),
      path.join(localAppData, "tycpv", "bin", "tycpv.exe"),
      path.join(localAppData, "tycpv", "tycpv.cmd"),
      path.join(localAppData, "tycpv", "bin", "tycpv.cmd"),
      env.ProgramFiles && path.join(env.ProgramFiles, "tycpv", "tycpv.exe"),
      env.ProgramFiles && path.join(env.ProgramFiles, "tycpv", "bin", "tycpv.exe"),
      env.ProgramFiles && path.join(env.ProgramFiles, "tycpv", "tycpv.cmd"),
      env.ProgramFiles && path.join(env.ProgramFiles, "tycpv", "bin", "tycpv.cmd"),
      env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "tycpv", "tycpv.exe"),
      env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "tycpv", "bin", "tycpv.exe"),
      env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "tycpv", "tycpv.cmd"),
      env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "tycpv", "bin", "tycpv.cmd"),
      path.join(homeDir, ".tycpv", "bin", "tycpv.exe"),
      path.join(homeDir, ".tycpv", "bin", "tycpv.cmd"),
    ].filter(Boolean),
    cliFallback: "tycpv.cmd",
    chooseDirectory,
    chooseWorkbookFiles,
    createCredentialReference,
    diagnostics,
    listenerPids,
    extractZip,
    launchWorkbenchInstaller,
    resolveCredentialReference,
    terminateProcess,
  };
}

module.exports = { createWindowsAdapter };
