"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const WINDOWS_CLI_REGISTRY_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
  "$roots = @(",
  "  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
  "  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
  "  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
  ")",
  "$items = @(",
  "  foreach ($root in $roots) {",
  "    Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |",
  "      Where-Object { [string]$_.DisplayName -match '^tycpv(?:\\s|$)' } |",
  "      ForEach-Object { [pscustomobject]@{ installLocation = [string]$_.InstallLocation; displayIcon = [string]$_.DisplayIcon } }",
  "  }",
  ")",
  "[Console]::WriteLine((ConvertTo-Json -InputObject $items -Compress -Depth 3))",
].join("\n");

const WINDOWS_REGISTRY_CACHE_MS = 15_000;
let windowsRegistryCandidatesCache = [];
let windowsRegistryCandidatesReadAt = 0;

function expandWindowsEnvironmentVariables(value, env) {
  const normalizedEnv = Object.entries(env || {});
  return String(value || "").replace(/%([^%]+)%/g, (match, requestedName) => {
    const entry = normalizedEnv.find(([name]) => name.toLowerCase() === requestedName.toLowerCase());
    return entry ? String(entry[1]) : match;
  });
}

function discoverWindowsCliCandidates({
  env = process.env,
  platform = process.platform,
  now = Date.now(),
  runPowerShell = execFileSync,
} = {}) {
  if (platform !== "win32") return [];
  if (windowsRegistryCandidatesReadAt && now - windowsRegistryCandidatesReadAt < WINDOWS_REGISTRY_CACHE_MS) {
    return [...windowsRegistryCandidatesCache];
  }

  windowsRegistryCandidatesReadAt = now;
  windowsRegistryCandidatesCache = [];
  try {
    const encodedScript = Buffer.from(WINDOWS_CLI_REGISTRY_SCRIPT, "utf16le").toString("base64");
    const output = runPowerShell(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodedScript,
      ],
      {
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
        windowsHide: true,
      },
    );
    const parsed = JSON.parse(String(output || "[]").trim() || "[]");
    const records = Array.isArray(parsed) ? parsed : [parsed];
    const candidates = [];
    const add = (candidate) => {
      const normalized = String(candidate || "").trim().replace(/^"|"$/g, "");
      if (!normalized || !path.win32.isAbsolute(normalized)) return;
      const key = normalized.toLowerCase();
      if (!candidates.some((item) => item.toLowerCase() === key)) candidates.push(normalized);
    };

    for (const record of records) {
      const installLocation = expandWindowsEnvironmentVariables(record?.installLocation, env)
        .trim()
        .replace(/^"|"$/g, "");
      if (installLocation && path.win32.isAbsolute(installLocation)) {
        for (const relativePath of [
          "tycpv.exe",
          path.win32.join("bin", "tycpv.exe"),
          "tycpv.cmd",
          path.win32.join("bin", "tycpv.cmd"),
        ]) {
          add(path.win32.join(installLocation, relativePath));
        }
      }

      const rawIcon = expandWindowsEnvironmentVariables(record?.displayIcon, env).trim();
      const quotedIcon = rawIcon.match(/^"([^"]+)"(?:,\s*-?\d+)?$/);
      const iconPath = quotedIcon ? quotedIcon[1] : rawIcon.replace(/,\s*-?\d+$/, "").trim();
      if (["tycpv.exe", "tycpv.cmd"].includes(path.win32.basename(iconPath).toLowerCase())) {
        add(iconPath);
      }
    }

    windowsRegistryCandidatesCache = candidates;
  } catch {
    // Registry discovery is best-effort; fixed install locations and PATH remain available.
  }
  return [...windowsRegistryCandidatesCache];
}

function isUsableFile(filePath, platform) {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    fs.accessSync(filePath, platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveExecutableCandidates({
  env = process.env,
  configuredBin = "",
  candidates = [],
  fallback = "",
  platform = process.platform,
} = {}) {
  const pathEntries = String(env.PATH || env.Path || "")
    .split(path.delimiter)
    .filter(Boolean);
  const extensions = platform === "win32"
    ? [...new Set(["", ...String(env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")])]
    : [""];
  const input = [env.TYCPV_BIN, configuredBin, ...candidates, fallback, "tycpv"];
  const resolved = [];
  const seen = new Set();

  const add = (candidate) => {
    const raw = String(candidate || "").trim().replace(/^"|"$/g, "");
    if (!raw) return;
    const hasPath = path.isAbsolute(raw) || /[\\/]/.test(raw);
    if (hasPath) {
      if (!isUsableFile(raw, platform)) return;
      const absolute = path.resolve(raw);
      const key = platform === "win32" ? absolute.toLowerCase() : absolute;
      if (!seen.has(key)) {
        seen.add(key);
        resolved.push(absolute);
      }
      return;
    }
    for (const directory of pathEntries) {
      for (const extension of extensions) {
        const withExtension = extension && !path.extname(raw) ? `${raw}${extension.toLowerCase()}` : raw;
        const absolute = path.resolve(directory, withExtension);
        if (!isUsableFile(absolute, platform)) continue;
        const key = platform === "win32" ? absolute.toLowerCase() : absolute;
        if (!seen.has(key)) {
          seen.add(key);
          resolved.push(absolute);
        }
      }
    }
  };

  for (const candidate of input) add(candidate);
  return resolved;
}

async function probeExecutableCandidates({
  candidates = [],
  args = [],
  commandLaunchSpec,
  execFile,
  env = process.env,
  timeoutMs = 15_000,
  maxDurationMs = 30_000,
} = {}) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return { ok: false, reason: "TYCPV_NOT_FOUND" };
  }
  if (typeof commandLaunchSpec !== "function" || typeof execFile !== "function") {
    return { ok: false, reason: "TYCPV_VERSION_FAILED" };
  }

  const deadline = Date.now() + maxDurationMs;
  let lastResult = { ok: false, reason: "TYCPV_VERSION_FAILED" };
  for (const candidate of candidates) {
    let retriedTimeout = false;
    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now();
      const launch = commandLaunchSpec(candidate, args);
      const result = await new Promise((resolve) => {
        let timedOut = false;
        let settled = false;
        let timeout = null;
        let child = null;
        const finish = (error, stdout, stderr) => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          if (timedOut) {
            resolve({ ok: false, candidate, reason: "TYCPV_TIMEOUT" });
            return;
          }
          if (!error) {
            resolve({ ok: true, candidate, stdout, stderr });
            return;
          }
          const reason = error.code === "ENOENT"
            ? "TYCPV_NOT_FOUND"
            : ((error.code === "EACCES" || error.code === "EPERM")
              ? "TYCPV_EXECUTION_BLOCKED"
              : "TYCPV_VERSION_FAILED");
          resolve({ ok: false, candidate, reason });
        };
        try {
          child = execFile(launch.command, launch.args, {
            env: launch.env || env,
            windowsHide: true,
          }, finish);
        } catch (error) {
          finish(error);
          return;
        }
        timeout = setTimeout(() => {
          if (settled) return;
          timedOut = true;
          const killChild = () => {
            if (child?.exitCode === null) child.kill();
          };
          if (process.platform === "win32" && child?.pid) {
            execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
              timeout: 5000,
              windowsHide: true,
            }, killChild);
          } else {
            killChild();
          }
        }, Math.max(1, Math.min(timeoutMs, remainingMs)));
      });

      if (result.ok) return result;
      lastResult = result;
      if (result.reason === "TYCPV_TIMEOUT" && !retriedTimeout) {
        retriedTimeout = true;
        continue;
      }
      break;
    }
    if (Date.now() >= deadline) break;
  }

  return lastResult;
}

function cliUnavailableMessage(reason) {
  const unavailable = reason === "TYCPV_NOT_FOUND"
    ? "未检测到可运行的天源 CLI。"
    : (reason === "TYCPV_TIMEOUT"
      ? "检测到天源 CLI，但启动检查超时；这不代表 CLI 未安装。"
      : (reason === "TYCPV_EXECUTION_BLOCKED"
        ? "检测到天源 CLI，但当前 Windows 环境阻止了启动。"
        : "检测到天源 CLI，但启动检查失败。"));
  if (reason === "TYCPV_TIMEOUT") {
    return unavailable + "请稍后重新检查。无需先做登录授权。CLI 不可用只限制 CLI 相关导出，目录选择、打印等其他工作台功能仍可使用。";
  }
  if (reason === "TYCPV_EXECUTION_BLOCKED") {
    return unavailable + "请检查运行权限或安全软件策略。无需先做登录授权。CLI 不可用只限制 CLI 相关导出，目录选择、打印等其他工作台功能仍可使用。";
  }
  return `${unavailable}请从天源官方渠道单独安装或修复 CLI，完成后重新检查；无需先做登录授权。CLI 不可用只限制 CLI 相关导出，目录选择、打印等其他工作台功能仍可使用。`;
}

module.exports = {
  cliUnavailableMessage,
  discoverWindowsCliCandidates,
  probeExecutableCandidates,
  resolveExecutableCandidates,
};
