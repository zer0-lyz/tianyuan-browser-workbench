"use strict";

const { createHash, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_RETRY_DELAY_MS = 750;
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "gitee.com",
  "raw.giteeusercontent.com",
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
  attempts = DOWNLOAD_ATTEMPTS,
  retryDelayMs = DOWNLOAD_RETRY_DELAY_MS,
  headers = {},
  onRetry = null,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("UPDATE_FETCH_UNAVAILABLE");
  const url = allowedDownloadUrl(urlValue);
  const maximumAttempts = Math.max(1, Math.min(5, Number(attempts) || 1));
  const temporaryPath = `${targetPath}.part`;
  let lastError = null;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      fs.rmSync(temporaryPath, { force: true });
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "Tianyuan-Workbench-Updater",
          ...headers,
        },
      });
      if (!response.ok || !response.body) {
        throw new Error(`UPDATE_DOWNLOAD_HTTP_${response.status}`);
      }
      allowedDownloadUrl(response.url || url.href);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
      await pipeline(
        Readable.fromWeb(response.body),
        fs.createWriteStream(temporaryPath, { mode: 0o600 }),
      );
      fs.renameSync(temporaryPath, targetPath);
      return {
        size: fs.statSync(targetPath).size,
        finalUrl: response.url || url.href,
        attempts: attempt,
      };
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      lastError = error;
      if (attempt >= maximumAttempts) break;
      if (typeof onRetry === "function") {
        onRetry({ attempt, nextAttempt: attempt + 1, error });
      }
      if (retryDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs * attempt)
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  const message = String(lastError?.message || "");
  if (/^UPDATE_DOWNLOAD_HTTP_\d+$/.test(message)) throw lastError;
  if (lastError?.name === "AbortError") {
    throw new Error("UPDATE_DOWNLOAD_TIMEOUT");
  }
  const causeCode = String(lastError?.cause?.code || lastError?.code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 80);
  throw new Error(
    causeCode
      ? `UPDATE_DOWNLOAD_NETWORK_${causeCode}`
      : "UPDATE_DOWNLOAD_NETWORK_FAILED",
  );
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

function installerNames(platformAdapter) {
  return platformAdapter.isWindows
    ? ["install.ps1", "安装.ps1"]
    : ["安装.command"];
}

function resolveInstallerPath(packageRoot, platformAdapter) {
  for (const installerName of installerNames(platformAdapter)) {
    const installerPath = path.join(packageRoot, installerName);
    if (fs.existsSync(installerPath)) return installerPath;
  }
  throw new Error("UPDATE_INSTALLER_NOT_FOUND");
}

function findPackageRoot(extractRoot, platformAdapter) {
  const candidates = installerNames(platformAdapter);
  const queue = [{ directory: extractRoot, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (candidates.some((name) => fs.existsSync(path.join(current.directory, name)))) {
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
  ];
  for (const relativePath of required) {
    if (!fs.existsSync(path.join(packageRoot, relativePath))) {
      throw new Error(`UPDATE_PACKAGE_FILE_MISSING:${relativePath}`);
    }
  }
  resolveInstallerPath(packageRoot, platformAdapter);
}

function createWorkbenchUpdater({
  updateChecker,
  platformAdapter,
  runtimeDirectory,
  fetchImpl = globalThis.fetch,
  downloadAttempts = DOWNLOAD_ATTEMPTS,
  downloadRetryDelayMs = DOWNLOAD_RETRY_DELAY_MS,
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

  async function downloadPackage(update, packagePath, updateId, {
    testMode = false,
  } = {}) {
    const modeLabel = testMode ? "测试" : "更新";
    const downloadOptions = {
      fetchImpl,
      attempts: downloadAttempts,
      retryDelayMs: downloadRetryDelayMs,
      onRetry: ({ nextAttempt }) => status({
        updateId,
        mode: testMode ? "test" : "install",
        phase: "downloading",
        percent: Math.min(45, 15 + nextAttempt * 8),
        latestVersion: update.latestVersion,
        message: `${modeLabel}下载中断，正在进行第 ${nextAttempt} 次重试`,
      }),
    };
    let download;
    try {
      download = await downloadFile(
        update.asset.url,
        packagePath,
        downloadOptions,
      );
    } catch (primaryError) {
      if (!update.asset.apiUrl) throw primaryError;
      status({
        updateId,
        mode: testMode ? "test" : "install",
        phase: "downloading",
        percent: 45,
        latestVersion: update.latestVersion,
        message: "主下载通道失败，正在切换 GitHub 备用通道",
      });
      download = await downloadFile(update.asset.apiUrl, packagePath, {
        ...downloadOptions,
        headers: { accept: "application/octet-stream" },
      });
    }
    if (
      Number(update.asset.size) > 0
      && download.size !== Number(update.asset.size)
    ) {
      throw new Error("UPDATE_DOWNLOAD_SIZE_MISMATCH");
    }
    return download;
  }

  async function test(input = {}) {
    const updateId = `update-test-${Date.now()}-${randomBytes(4).toString("hex")}`;
    let testRoot = "";
    try {
      status({
        updateId,
        mode: "test",
        phase: "checking",
        percent: 5,
        message: "正在检查可测试的官方安装包",
      });
      const update = await updateChecker.checkGithubUpdate({
        currentVersion: input.currentVersion,
        currentBuildNumber: input.currentBuildNumber,
        currentRuntimeBuildId: input.currentRuntimeBuildId,
        platform: process.platform,
        architecture: process.arch,
      }, { fetchImpl });
      if (!update?.ok) throw new Error(update?.reason || "GITHUB_UPDATE_CHECK_FAILED");
      if (!update.releasePublished) throw new Error("GITHUB_RELEASE_NOT_PUBLISHED");
      if (!update.asset?.url) throw new Error("UPDATE_ASSET_NOT_FOUND");

      const expected = await expectedSha256(update, { fetchImpl });
      testRoot = path.join(
        platformAdapter.runtimeRoot,
        "updates",
        `self-test-v${update.latestVersion}-${update.platform}-${updateId}`,
      );
      const packagePath = path.join(
        testRoot,
        update.asset.name || "workbench-update.zip",
      );
      const extractRoot = path.join(testRoot, "extracted");
      fs.mkdirSync(testRoot, { recursive: true, mode: 0o700 });

      status({
        updateId,
        mode: "test",
        phase: "downloading",
        percent: 20,
        latestVersion: update.latestVersion,
        message: "正在测试完整安装包下载，不会执行安装",
      });
      const download = await downloadPackage(
        update,
        packagePath,
        updateId,
        { testMode: true },
      );

      status({
        updateId,
        mode: "test",
        phase: "verifying",
        percent: 60,
        latestVersion: update.latestVersion,
        message: "正在测试 SHA-256 校验",
      });
      const actual = await sha256File(packagePath);
      if (actual !== expected) throw new Error("UPDATE_SHA256_MISMATCH");

      status({
        updateId,
        mode: "test",
        phase: "extracting",
        percent: 80,
        latestVersion: update.latestVersion,
        message: "正在测试解压和安装包完整性",
      });
      await platformAdapter.extractZip(packagePath, extractRoot);
      const packageRoot = findPackageRoot(extractRoot, platformAdapter);
      validatePackage(packageRoot, platformAdapter);

      const result = status({
        updateId,
        mode: "test",
        phase: "test_complete",
        percent: 100,
        latestVersion: update.latestVersion,
        downloadedBytes: download.size,
        sha256: actual,
        packageValid: true,
        installed: false,
        message: "更新模块测试通过：下载、校验、解压均正常，未安装任何组件",
      });
      return {
        ...result,
        action: "test_workbench_update",
      };
    } catch (error) {
      const reason = safeReason(error);
      status({
        ok: false,
        updateId,
        mode: "test",
        phase: "failed",
        percent: 0,
        reason,
      });
      return {
        ok: false,
        action: "test_workbench_update",
        updateId,
        mode: "test",
        phase: "failed",
        reason,
        security: security(),
      };
    } finally {
      if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true });
    }
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
      await downloadPackage(update, packagePath, updateId);

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
      const installerPath = resolveInstallerPath(packageRoot, platformAdapter);

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

  return { install, test, getStatus, statusPath };
}

module.exports = {
  ALLOWED_DOWNLOAD_HOSTS,
  createWorkbenchUpdater,
  downloadFile,
  findPackageRoot,
  resolveInstallerPath,
  sha256File,
};
