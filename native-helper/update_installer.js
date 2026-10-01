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
const MAX_INSTALL_STATUS_AGE_MS = 20 * 60 * 1000;
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "gitee.com",
  "raw.giteeusercontent.com",
]);

function safeChannelValue(value, fallback = "unknown") {
  const normalized = String(value || fallback)
    .replace(/bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/(authorization|cookie|password|token|验证码)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/[^\s]+/gi, "[URL]")
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .slice(0, 120);
  return normalized || fallback;
}

function normalizeDownloadCandidates(update) {
  const asset = update?.asset && typeof update.asset === "object" ? update.asset : {};
  const candidates = Array.isArray(update?.downloadCandidates)
    ? update.downloadCandidates
    : [
      asset.url
        ? {
          id: "legacy-direct",
          url: asset.url,
          headers: {},
          source: "github-release",
          priority: update?.preferredDownloadChannel === "github-release" ? 1 : 20,
        }
        : null,
      asset.apiUrl
        ? {
          id: "legacy-api",
          url: asset.apiUrl,
          headers: { accept: "application/octet-stream" },
          source: "github-api",
          priority: update?.preferredDownloadChannel === "github-api" ? 1 : 30,
        }
        : null,
    ];
  const seen = new Set();
  return candidates
    .filter((candidate) => candidate && typeof candidate === "object" && String(candidate.url || "").trim())
    .map((candidate, index) => ({
      id: safeChannelValue(candidate.id || `${candidate.source || "download"}-${index}`),
      url: String(candidate.url).trim(),
      headers: candidate.headers && typeof candidate.headers === "object"
        ? { ...candidate.headers }
        : {},
      source: safeChannelValue(candidate.source || "download"),
      priority: Number(candidate.priority || index + 1),
      name: String(candidate.name || asset.name || "workbench-update.zip"),
      size: Number(candidate.size || asset.size || 0),
      sha256: String(candidate.sha256 || asset.sha256 || "")
        .replace(/^sha256:/i, "").toLowerCase(),
    }))
    .filter((candidate) => {
      if (seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    })
    .sort((left, right) => left.priority - right.priority)
    .map((candidate, index) => ({ ...candidate, priority: index + 1 }));
}

function sanitizeChannelAttempts(attempts = []) {
  return (Array.isArray(attempts) ? attempts : []).map((attempt) => ({
    id: safeChannelValue(attempt.id),
    source: safeChannelValue(attempt.source),
    status: String(attempt.status || "failed"),
    attempts: Number(attempt.attempts || 0),
    ...(attempt.reason ? { reason: safeReason(attempt.reason) } : {}),
  }));
}

function canonicalUpdatePhase(value) {
  const phase = String(value || "idle");
  if (phase === "test_complete") return "complete";
  if (["preparing", "stopping_services", "waiting_for_file_release", "restarting_services"].includes(phase)) {
    return phase === "restarting_services" ? "verifying_install" : "installing";
  }
  if (phase === "rollback") return "failed";
  return phase;
}

function security() {
  return { credentialsReturned: false, tokenUsed: false };
}

function safeReason(error) {
  return String(error?.message || error || "WORKBENCH_UPDATE_FAILED")
    .replace(/bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/zhmcp_[A-Za-z0-9._-]+/gi, "[REDACTED]")
    .replace(/(authorization|cookie|password|验证码|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

function updateErrorDetails(error) {
  const details = {};
  if (error?.code) details.errorCode = String(error.code).slice(0, 80);
  if (error?.stage) details.stage = String(error.stage).slice(0, 80);
  if (error?.zipPath) details.zipPath = String(error.zipPath).slice(0, 500);
  if (error?.destination) details.destination = String(error.destination).slice(0, 500);
  if (error?.reason) details.underlyingReason = safeReason(error.reason);
  if (error?.exitCode !== undefined && error?.exitCode !== null) details.exitCode = error.exitCode;
  if (error?.downloadChannel) details.downloadChannel = safeChannelValue(error.downloadChannel);
  if (error?.channelAttempts) details.channelAttempts = sanitizeChannelAttempts(error.channelAttempts);
  if (error?.nextAction) details.nextAction = String(error.nextAction).slice(0, 180);
  return details;
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
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("UPDATE_DOWNLOAD_URL_FORBIDDEN");
  }
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
    path.join("native-helper", "connector_bridge.js"),
    path.join("native-helper", "codex_catalog.js"),
    path.join("native-helper", "anjuke-property.js"),
    path.join("native-helper", "update_installer.js"),
    path.join("plugins", "tianyuan-browser-connector", ".codex-plugin", "plugin.json"),
    path.join("scripts", "install-local-runtime.mjs"),
    path.join("scripts", "runtime-fingerprint.mjs"),
    path.join("scripts", "print-runtime-build-id.mjs"),
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
  let installBusy = false;

  function createStagingRoot(mode) {
    const shortId = randomBytes(4).toString("hex");
    if (typeof platformAdapter.createUpdateStagingRoot === "function") {
      return platformAdapter.createUpdateStagingRoot({ mode, shortId });
    }
    const root = path.join(
      platformAdapter.runtimeRoot,
      "updates",
      `${mode === "test" ? "test" : "update"}-${shortId}`,
    );
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    return root;
  }

  function status(payload) {
    const next = {
      ok: payload.ok !== false,
      action: "workbench_update",
      phase: payload.phase || "idle",
      normalizedPhase: canonicalUpdatePhase(payload.phase || "idle"),
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
    const candidates = normalizeDownloadCandidates(update);
    if (!candidates.length) {
      const error = new Error("UPDATE_ASSET_NOT_FOUND");
      error.code = "UPDATE_ASSET_NOT_FOUND";
      error.stage = "preflight";
      throw error;
    }
    const channelAttempts = [];
    let download = null;
    let selectedCandidate = null;
    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const attempt = {
        id: candidate.id,
        source: candidate.source,
        status: "trying",
        attempts: 0,
      };
      channelAttempts.push(attempt);
      if (index > 0) {
        status({
          updateId,
          mode: testMode ? "test" : "install",
          phase: "downloading",
          percent: Math.min(45, 15 + index * 8),
          latestVersion: update.latestVersion,
          kind: "recovered",
          recoverable: true,
          channelAttempts: sanitizeChannelAttempts(channelAttempts),
          message: `已自动切换到 ${candidate.source} 下载通道`,
        });
      }
      try {
        download = await downloadFile(candidate.url, packagePath, {
          fetchImpl,
          attempts: downloadAttempts,
          retryDelayMs: downloadRetryDelayMs,
          headers: candidate.headers,
          onRetry: ({ nextAttempt, error }) => {
            attempt.attempts = nextAttempt;
            status({
              updateId,
              mode: testMode ? "test" : "install",
              phase: "downloading",
              percent: Math.min(45, 15 + nextAttempt * 8),
              latestVersion: update.latestVersion,
              downloadChannel: candidate.source,
              channelAttempts: sanitizeChannelAttempts(channelAttempts),
              message: `${modeLabel}下载中断，正在进行第 ${nextAttempt} 次重试`,
              detail: safeReason(error),
            });
          },
        });
        attempt.status = "succeeded";
        attempt.attempts = Number(download.attempts || 1);
        selectedCandidate = candidate;
        break;
      } catch (error) {
        lastError = error;
        attempt.status = "failed";
        attempt.attempts = Math.max(1, Number(attempt.attempts || downloadAttempts));
        attempt.reason = safeReason(error);
        if (index < candidates.length - 1) {
          status({
            updateId,
            mode: testMode ? "test" : "install",
            phase: "downloading",
            percent: Math.min(45, 15 + (index + 1) * 8),
            latestVersion: update.latestVersion,
            kind: "warn",
            recoverable: true,
            channelAttempts: sanitizeChannelAttempts(channelAttempts),
            message: `${candidate.source} 下载通道暂不可用，正在自动切换`,
          });
        }
      }
    }
    if (!download || !selectedCandidate) {
      const error = new Error("UPDATE_DOWNLOAD_CHANNELS_FAILED");
      error.code = "UPDATE_DOWNLOAD_CHANNELS_FAILED";
      error.stage = "downloading";
      error.reason = lastError?.message || lastError || "UPDATE_DOWNLOAD_NETWORK_FAILED";
      error.channelAttempts = channelAttempts;
      error.nextAction = "检查网络后重试，或从发布页手动下载安装包";
      throw error;
    }
    if (
      Number(update.asset.size) > 0
      && download.size !== Number(update.asset.size)
    ) {
      const error = new Error("UPDATE_DOWNLOAD_SIZE_MISMATCH");
      error.code = "UPDATE_DOWNLOAD_SIZE_MISMATCH";
      error.stage = "downloading";
      error.downloadChannel = selectedCandidate.source;
      error.channelAttempts = channelAttempts;
      throw error;
    }
    return {
      ...download,
      selectedChannel: selectedCandidate.source,
      selectedCandidateId: selectedCandidate.id,
      channelAttempts: sanitizeChannelAttempts(channelAttempts),
      recovered: channelAttempts.some((attempt) => attempt.status === "failed")
        && channelAttempts.some((attempt) => attempt.status === "succeeded"),
    };
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
        currentRuntimeBuildKind: input.currentRuntimeBuildKind,
        platform: process.platform,
        architecture: process.arch,
      }, { fetchImpl });
      if (!update?.ok) throw new Error(update?.reason || "GITHUB_UPDATE_CHECK_FAILED");
      if (!update.releasePublished) throw new Error("GITHUB_RELEASE_NOT_PUBLISHED");
      if (!normalizeDownloadCandidates(update).length) throw new Error("UPDATE_ASSET_NOT_FOUND");

      status({
        updateId,
        mode: "test",
        phase: "preflight",
        percent: 12,
        latestVersion: update.latestVersion,
        preferredDownloadChannel: update.preferredDownloadChannel || "",
        downloadCandidates: normalizeDownloadCandidates(update).map((candidate) => ({
          id: candidate.id,
          source: candidate.source,
          priority: candidate.priority,
        })),
        message: "正在预检下载通道和校验信息",
      });
      const expected = await expectedSha256(update, { fetchImpl });
      testRoot = createStagingRoot("test");
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
        downloadChannel: download.selectedChannel,
        channelAttempts: download.channelAttempts,
        recovered: download.recovered,
        downloadedBytes: download.size,
        sha256: actual,
        packageValid: true,
        installed: false,
        currentVersionUnchanged: true,
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
        stage: error?.stage || "preflight",
        errorCode: error?.code || safeReason(error),
        currentVersionUnchanged: true,
        nextAction: error?.nextAction || "检查诊断摘要后重试",
        message: "更新模块测试失败",
        reason,
        ...updateErrorDetails(error),
      });
      return {
        ok: false,
        action: "test_workbench_update",
        updateId,
        mode: "test",
        phase: "failed",
        stage: error?.stage || "preflight",
        errorCode: error?.code || reason,
        currentVersionUnchanged: true,
        nextAction: error?.nextAction || "检查诊断摘要后重试",
        message: "更新模块测试失败",
        reason,
        ...updateErrorDetails(error),
        security: security(),
      };
    } finally {
      if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true });
    }
  }

  async function install(input = {}) {
    const updateId = `update-${Date.now()}-${randomBytes(4).toString("hex")}`;
    if (installBusy) {
      return {
        ok: false,
        action: "install_workbench_update",
        updateId,
        phase: "failed",
        reason: "UPDATE_ALREADY_RUNNING",
        stage: "preflight",
        errorCode: "UPDATE_ALREADY_RUNNING",
        currentVersionUnchanged: true,
        nextAction: "等待当前更新完成后重试",
        security: security(),
      };
    }
    installBusy = true;
    let updateRoot = "";
    let installerHandedOff = false;
    try {
      status({ updateId, phase: "checking", percent: 5, message: "正在检查官方更新" });
      const update = await updateChecker.checkGithubUpdate({
        currentVersion: input.currentVersion,
        currentBuildNumber: input.currentBuildNumber,
        currentRuntimeBuildId: input.currentRuntimeBuildId,
        currentRuntimeBuildKind: input.currentRuntimeBuildKind,
        platform: process.platform,
        architecture: process.arch,
      }, { fetchImpl });
      if (!update?.ok) throw new Error(update?.reason || "GITHUB_UPDATE_CHECK_FAILED");
      if (!update.updateAvailable && !update.repairRequired) throw new Error("UPDATE_NOT_REQUIRED");
      const candidates = normalizeDownloadCandidates(update);
      if (!candidates.length) throw new Error("UPDATE_ASSET_NOT_FOUND");

      status({
        updateId,
        phase: "preflight",
        percent: 12,
        latestVersion: update.latestVersion,
        preferredDownloadChannel: update.preferredDownloadChannel || "",
        downloadCandidates: candidates.map((candidate) => ({
          id: candidate.id,
          source: candidate.source,
          priority: candidate.priority,
        })),
        message: "正在预检运行环境、下载通道和校验信息",
      });
      if (typeof platformAdapter.preflightUpdate === "function") {
        const preflight = await platformAdapter.preflightUpdate({ update });
        if (preflight?.ok === false) {
          const error = new Error(preflight.reason || "UPDATE_PREFLIGHT_FAILED");
          error.code = preflight.reason || "UPDATE_PREFLIGHT_FAILED";
          error.stage = preflight.stage || "preflight";
          error.nextAction = preflight.nextAction || "检查运行环境后重试";
          error.currentVersionUnchanged = true;
          throw error;
        }
      }
      const expected = await expectedSha256(update, { fetchImpl });
      updateRoot = createStagingRoot("update");
      const packagePath = path.join(updateRoot, update.asset?.name || candidates[0].name || "workbench-update.zip");
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
      const download = await downloadPackage(update, packagePath, updateId);

      status({
        updateId,
        phase: "verifying",
        percent: 55,
        latestVersion: update.latestVersion,
        downloadChannel: download.selectedChannel,
        channelAttempts: download.channelAttempts,
        recovered: download.recovered,
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
        percent: 74,
        latestVersion: update.latestVersion,
        message: "正在准备停止工作台服务",
      });
      const launch = platformAdapter.launchWorkbenchInstaller({
        installerPath,
        statusPath,
        logPath,
        parentPid: process.pid,
        cleanupPath: updateRoot,
      });
      if (!launch || !Number.isInteger(Number(launch.pid)) || Number(launch.pid) <= 0) {
        throw new Error("UPDATE_INSTALLER_NOT_STARTED");
      }
      installerHandedOff = true;
      status({
        updateId,
        phase: "stopping_services",
        percent: 76,
        latestVersion: update.latestVersion,
        downloadChannel: download.selectedChannel,
        channelAttempts: download.channelAttempts,
        recovered: download.recovered,
        installerPid: Number(launch.pid),
        logPath,
        message: "更新程序已启动，正在停止工作台服务",
      });
      return {
        ok: true,
        action: "install_workbench_update",
        updateId,
        phase: "stopping_services",
        percent: 76,
        latestVersion: update.latestVersion,
        installerStarted: true,
        installerPid: launch.pid || null,
        logPath,
        shutdownRequired: true,
        security: security(),
      };
    } catch (error) {
      const reason = safeReason(error);
      status({
        ok: false,
        updateId,
        phase: "failed",
        percent: 0,
        stage: error?.stage || "preflight",
        errorCode: error?.code || safeReason(error),
        currentVersion: input.currentVersion || null,
        currentVersionUnchanged: true,
        nextAction: error?.nextAction || "检查诊断摘要后重试",
        message: "工作台更新失败",
        reason,
        ...updateErrorDetails(error),
      });
      return {
        ok: false,
        action: "install_workbench_update",
        updateId,
        phase: "failed",
        stage: error?.stage || "preflight",
        errorCode: error?.code || reason,
        currentVersion: input.currentVersion || null,
        currentVersionUnchanged: true,
        nextAction: error?.nextAction || "检查诊断摘要后重试",
        message: "工作台更新失败",
        reason,
        ...updateErrorDetails(error),
        security: security(),
      };
    } finally {
      if (updateRoot && !installerHandedOff) {
        fs.rmSync(updateRoot, { recursive: true, force: true });
      }
      installBusy = false;
    }
  }

  function getStatus() {
    const current = readJson(statusPath, {
      ok: true,
      action: "get_workbench_update_status",
      phase: "idle",
      normalizedPhase: "idle",
      percent: 0,
      updatedAt: null,
      security: security(),
    });
    const activePhases = new Set([
      "checking",
      "downloading",
      "verifying",
      "extracting",
      "preparing",
      "stopping_services",
      "waiting_for_file_release",
      "installing",
      "verifying_install",
      "restarting_services",
      "rollback",
    ]);
    const updatedAt = Date.parse(current?.updatedAt || "");
    if (
      activePhases.has(String(current?.phase || ""))
      && Number.isFinite(updatedAt)
      && Date.now() - updatedAt > MAX_INSTALL_STATUS_AGE_MS
    ) {
      const stale = status({
        ...current,
        ok: false,
        phase: "failed",
        percent: Number(current.percent || 0),
        reason: "WORKBENCH_UPDATE_TIMEOUT",
        message: "更新状态超过最大等待时间，已停止报告安装中",
      });
      return stale;
    }
    return current;
  }

  return { install, test, getStatus, statusPath };
}

module.exports = {
  ALLOWED_DOWNLOAD_HOSTS,
  createWorkbenchUpdater,
  downloadFile,
  canonicalUpdatePhase,
  normalizeDownloadCandidates,
  sanitizeChannelAttempts,
  findPackageRoot,
  resolveInstallerPath,
  sha256File,
};
