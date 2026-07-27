"use strict";

const { createHash, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

function security() {
  return { credentialsReturned: false, tokenUsed: false };
}

function safeReason(error) {
  return String(error?.message || error || "WORKBENCH_UPDATE_FAILED")
    .replace(/bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/zhmcp_[A-Za-z0-9._-]+/gi, "[REDACTED]")
    .slice(0, 500);
}

function writePrivateJson(targetPath, payload) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const temporary = `${targetPath}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, targetPath);
  if (process.platform !== "win32") fs.chmodSync(targetPath, 0o600);
}

function readJson(targetPath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function allowedDownloadUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || !ALLOWED_DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new Error("UPDATE_DOWNLOAD_URL_FORBIDDEN");
  }
  return url;
}

async function downloadFile(urlValue, targetPath, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("UPDATE_FETCH_UNAVAILABLE");
  const url = allowedDownloadUrl(urlValue);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Tianyuan-Workbench-Updater" },
    });
    if (!response.ok || !response.body) {
      throw new Error(`UPDATE_DOWNLOAD_HTTP_${response.status}`);
    }
    allowedDownloadUrl(response.url || url.href);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(targetPath, { mode: 0o600 }));
    return {
      size: fs.statSync(targetPath).size,
      finalUrl: response.url || url.href,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sha256File(targetPath) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(targetPath)) hash.update(chunk);
  return hash.digest("hex");
}

async function expectedSha256(update, options) {
  const direct = String(update?.asset?.sha256 || "").trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(direct)) return direct;
  const checksumUrl = String(update?.checksumAsset?.url || "");
  if (!checksumUrl) throw new Error("UPDATE_SHA256_MISSING");
  const response = await (options.fetchImpl || globalThis.fetch)(allowedDownloadUrl(checksumUrl), {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": "Tianyuan-Workbench-Updater" },
  });
  if (!response.ok) throw new Error(`UPDATE_CHECKSUM_HTTP_${response.status}`);
  allowedDownloadUrl(response.url || checksumUrl);
  const text = await response.text();
  const match = text.match(/\b([0-9a-f]{64})\b/i);
  if (!match) throw new Error("UPDATE_SHA256_INVALID");
  return match[1].toLowerCase();
}

function findPackageRoot(extractRoot, platformAdapter) {
  const installerName = platformAdapter.isWindows ? "安装.ps1" : "安装.command";
  const queue = [{ directory: extractRoot, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (fs.existsSync(path.join(current.directory, installerName))) {
      return current.directory;
    }
    if (current.depth >= 2) continue;
    for (const entry of fs.readdirSync(current.directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        queue.push({
          directory: path.join(current.directory, entry.name),
          depth: current.depth + 1,
        });
      }
    }
  }
  throw new Error("UPDATE_INSTALLER_NOT_FOUND");
}

function validatePackage(packageRoot, platformAdapter) {
  const required = [
    "VERSION.txt",
    "SHA256SUMS",
    path.join("extension", "manifest.json"),
    path.join("extension", "version.json"),
    path.join("native-helper", "native_host.js"),
    path.join("native-helper", "update_installer.js"),
    path.join("plugins", "tianyuan-browser-connector", ".codex-plugin", "plugin.json"),
    path.join("scripts", "install-local-runtime.mjs"),
    platformAdapter.isWindows ? "安装.ps1" : "安装.command",
  ];
  for (const relativePath of required) {
    if (!fs.existsSync(path.join(packageRoot, relativePath))) {
      throw new Error(`UPDATE_PACKAGE_FILE_MISSING:${relativePath}`);
    }
  }
}

function createWorkbenchUpdater({
  updateChecker,
  platformAdapter,
  runtimeDirectory,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!updateChecker || !platformAdapter || !runtimeDirectory) {
    throw new Error("UPDATE_INSTALLER_CONFIGURATION_INVALID");
  }
  const statusPath = path.join(runtimeDirectory, "workbench-update-status.json");
  const logPath = path.join(runtimeDirectory, "workbench-update.log");

  function status(payload) {
    const next = {
      ok: payload.ok !== false,
      action: "workbench_update",
      phase: payload.phase || "idle",
      percent: Number(payload.percent || 0),
      updatedAt: new Date().toISOString(),
      ...payload,
      security: security(),
    };
    writePrivateJson(statusPath, next);
    return next;
  }

  async function install(input = {}) {
    const updateId = `update-${Date.now()}-${randomBytes(4).toString("hex")}`;
    try {
      status({ updateId, phase: "checking", percent: 5, message: "正在检查官方更新" });
      const update = await updateChecker.checkGithubUpdate({
        currentVersion: input.currentVersion,
        currentBuildNumber: input.currentBuildNumber,
        currentRuntimeBuildId: input.currentRuntimeBuildId,
        platform: process.platform,
        architecture: process.arch,
      }, { fetchImpl });
      if (!update?.ok) throw new Error(update?.reason || "GITHUB_UPDATE_CHECK_FAILED");
      if (!update.updateAvailable && !update.repairRequired) throw new Error("UPDATE_NOT_REQUIRED");
      if (!update.asset?.url) throw new Error("UPDATE_ASSET_NOT_FOUND");

      const expected = await expectedSha256(update, { fetchImpl });
      const updateRoot = path.join(
        platformAdapter.runtimeRoot,
        "updates",
        `v${update.latestVersion}-${update.platform}`,
      );
      const packagePath = path.join(updateRoot, update.asset.name || "workbench-update.zip");
      const extractRoot = path.join(updateRoot, "extracted");
      fs.rmSync(updateRoot, { recursive: true, force: true });
      fs.mkdirSync(updateRoot, { recursive: true, mode: 0o700 });

      status({
        updateId,
        phase: "downloading",
        percent: 20,
        latestVersion: update.latestVersion,
        message: "正在下载完整安装包",
      });
      await downloadFile(update.asset.url, packagePath, { fetchImpl });

      status({
        updateId,
        phase: "verifying",
        percent: 55,
        latestVersion: update.latestVersion,
        message: "正在校验安装包",
      });
      const actual = await sha256File(packagePath);
      if (actual !== expected) throw new Error("UPDATE_SHA256_MISMATCH");

      status({
        updateId,
        phase: "extracting",
        percent: 70,
        latestVersion: update.latestVersion,
        message: "正在解压安装包",
      });
      await platformAdapter.extractZip(packagePath, extractRoot);
      const packageRoot = findPackageRoot(extractRoot, platformAdapter);
      validatePackage(packageRoot, platformAdapter);
      const installerPath = path.join(
        packageRoot,
        platformAdapter.isWindows ? "安装.ps1" : "安装.command",
      );

      status({
        updateId,
        phase: "installing",
        percent: 82,
        latestVersion: update.latestVersion,
        message: "安装程序已启动，正在同步全部组件",
      });
      const launch = platformAdapter.launchWorkbenchInstaller({
        installerPath,
        statusPath,
        logPath,
        parentPid: process.pid,
      });
      return {
        ok: true,
        action: "install_workbench_update",
        updateId,
        phase: "installing",
        percent: 82,
        latestVersion: update.latestVersion,
        installerStarted: true,
        installerPid: launch.pid || null,
        security: security(),
      };
    } catch (error) {
      const reason = safeReason(error);
      status({ ok: false, updateId, phase: "failed", percent: 0, reason });
      return {
        ok: false,
        action: "install_workbench_update",
        updateId,
        phase: "failed",
        reason,
        security: security(),
      };
    }
  }

  function getStatus() {
    return readJson(statusPath, {
      ok: true,
      action: "get_workbench_update_status",
      phase: "idle",
      percent: 0,
      updatedAt: null,
      security: security(),
    });
  }

  return { install, getStatus, statusPath };
}

module.exports = {
  ALLOWED_DOWNLOAD_HOSTS,
  createWorkbenchUpdater,
  downloadFile,
  sha256File,
};
