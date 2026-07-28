"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_REPOSITORY = "zer0-lyz/tianyuan-browser-workbench-releases";
const GITHUB_API_BASE = "https://api.github.com";
const UPDATE_MANIFEST_NAME = "update-manifest.json";
const DEFAULT_TIMEOUT_MS = 12000;
const UPDATE_SOURCES_FILE = path.join(__dirname, "update-sources.json");
const ALLOWED_MANIFEST_HOSTS = new Set([
  "gitee.com",
  "github.com",
  "raw.githubusercontent.com",
  "raw.giteeusercontent.com",
]);

function parseSemver(value) {
  const normalized = String(value || "").trim().replace(/^v/i, "");
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    raw: normalized,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumeric = /^\d+$/.test(left[index]);
    const rightNumeric = /^\d+$/.test(right[index]);
    if (leftNumeric && rightNumeric) return Number(left[index]) > Number(right[index]) ? 1 : -1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function compareSemver(leftValue, rightValue) {
  const left = parseSemver(leftValue);
  const right = parseSemver(rightValue);
  if (!left || !right) throw new Error("UPDATE_VERSION_INVALID");
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] === right[key]) continue;
    return left[key] > right[key] ? 1 : -1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function platformKey(platform = process.platform, architecture = process.arch) {
  if (platform === "win32" && architecture === "x64") return "windows-x64";
  if (platform === "darwin" && architecture === "arm64") return "macos-arm64";
  return `${platform}-${architecture}`;
}

function releaseNotes(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20);
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function sha256FromDigest(value) {
  const match = String(value || "").trim().match(/^sha256:([0-9a-f]{64})$/i);
  return match?.[1]?.toLowerCase() || "";
}

function assetPlatformMatches(name, key) {
  const normalized = String(name || "").toLowerCase();
  if (!normalized.endsWith(".zip") || normalized.endsWith(".zip.sha256")) return false;
  if (key === "windows-x64") return normalized.includes("windows-x64");
  if (key === "macos-arm64") {
    return normalized.includes("macos-arm64")
      || normalized.includes("macos-apple")
      || normalized.includes("macos-apple芯片");
  }
  return normalized.includes(key.toLowerCase());
}

function normalizeGithubAsset(asset) {
  if (!asset || typeof asset !== "object") return null;
  return {
    name: String(asset.name || ""),
    url: String(asset.browser_download_url || ""),
    apiUrl: String(asset.url || ""),
    size: Number(asset.size || 0),
    sha256: sha256FromDigest(asset.digest),
    updatedAt: asset.updated_at || null,
  };
}

function selectGithubAsset(assets, key, requestedName = "") {
  const normalized = (Array.isArray(assets) ? assets : []).map(normalizeGithubAsset).filter(Boolean);
  if (requestedName) {
    const exact = normalized.find((asset) => asset.name === requestedName);
    if (exact) return exact;
  }
  return normalized.find((asset) => assetPlatformMatches(asset.name, key)) || null;
}

function selectChecksumAsset(assets, packageName) {
  const checksumName = packageName ? `${packageName}.sha256` : "";
  if (!checksumName) return null;
  return (Array.isArray(assets) ? assets : [])
    .map(normalizeGithubAsset)
    .find((asset) => asset?.name === checksumName) || null;
}

function configuredManifestUrls(input = {}) {
  const urls = [];
  if (Array.isArray(input.updateManifestUrls)) urls.push(...input.updateManifestUrls);
  if (process.env.TIANYUAN_UPDATE_MANIFEST_URLS) {
    urls.push(...process.env.TIANYUAN_UPDATE_MANIFEST_URLS.split(","));
  }
  try {
    const config = JSON.parse(fs.readFileSync(UPDATE_SOURCES_FILE, "utf8"));
    if (Array.isArray(config.manifestUrls)) urls.push(...config.manifestUrls);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return [...new Set(urls
    .map((item) => String(item || "").trim())
    .filter(Boolean))];
}

function validateManifestUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || !ALLOWED_MANIFEST_HOSTS.has(url.hostname)) {
    throw new Error("UPDATE_MANIFEST_URL_FORBIDDEN");
  }
  return url.href;
}

function normalizeManifestAsset(asset, manifestUrl) {
  if (!asset || typeof asset !== "object") return null;
  const fileName = String(asset.fileName || asset.name || "");
  const directUrl = String(asset.url || "").trim();
  const url = directUrl
    ? new URL(directUrl, manifestUrl).href
    : "";
  return {
    name: fileName,
    url,
    apiUrl: "",
    size: Number(asset.size || 0),
    sha256: String(asset.sha256 || "").replace(/^sha256:/i, "").toLowerCase(),
    updatedAt: asset.updatedAt || null,
  };
}

function resultFromManifest(manifest, manifestUrl, input) {
  const currentVersion = String(input.currentVersion || "").trim();
  const currentBuildNumber = Number(input.currentBuildNumber || 0);
  const latestVersion = String(manifest?.productVersion || "").trim().replace(/^v/i, "");
  if (!parseSemver(latestVersion)) throw new Error("LATEST_VERSION_INVALID");
  const latestBuildNumber = Number(manifest?.buildNumber || 0);
  const versionComparison = compareSemver(latestVersion, currentVersion);
  const buildUpdate = versionComparison === 0
    && latestBuildNumber > 0
    && latestBuildNumber > currentBuildNumber;
  const latestRuntimeBuildId = String(manifest?.runtimeBuildId || "").trim();
  const currentRuntimeBuildId = String(input.currentRuntimeBuildId || "").trim();
  const repairRequired = versionComparison === 0
    && Boolean(latestRuntimeBuildId && currentRuntimeBuildId && latestRuntimeBuildId !== currentRuntimeBuildId);
  const key = platformKey(input.platform, input.architecture);
  const requestedAsset = manifest?.assets?.[key] || null;
  const packageAsset = normalizeManifestAsset(requestedAsset, manifestUrl);
  const minimumSupportedVersion = String(manifest?.minimumSupportedVersion || "").trim();
  const mandatory = Boolean(
    manifest?.mandatory
    || (parseSemver(minimumSupportedVersion) && compareSemver(currentVersion, minimumSupportedVersion) < 0)
  );
  return {
    ok: true,
    action: "check_github_update",
    repository: manifest?.repository || DEFAULT_REPOSITORY,
    source: manifest?.source || "manifest",
    manifestUrl,
    currentVersion,
    currentBuildNumber,
    currentRuntimeBuildId,
    latestVersion,
    latestBuildNumber,
    latestRuntimeBuildId,
    releasePublished: true,
    updateAvailable: versionComparison > 0 || buildUpdate || repairRequired,
    repairRequired,
    mandatory,
    minimumSupportedVersion: minimumSupportedVersion || null,
    channel: manifest?.channel || "stable",
    releaseName: String(manifest?.releaseName || `v${latestVersion}`),
    releaseUrl: String(manifest?.releaseUrl || manifestUrl),
    publishedAt: manifest?.publishedAt || null,
    notes: releaseNotes(manifest?.releaseNotes),
    platform: key,
    asset: packageAsset,
    checksumAsset: null,
    manifestFound: true,
    checkedAt: new Date().toISOString(),
    security: { credentialsReturned: false, tokenUsed: false },
  };
}

async function checkManifestSources(input = {}, options = {}) {
  for (const sourceUrl of configuredManifestUrls(input)) {
    const manifestUrl = validateManifestUrl(sourceUrl);
    try {
      const result = await fetchJson(manifestUrl, {
        ...options,
        accept: "application/json",
      });
      if (!result.found || !result.payload) continue;
      const update = resultFromManifest(result.payload, manifestUrl, input);
      if (update.asset?.url || !update.updateAvailable) return update;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, accept = "application/vnd.github+json" } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("UPDATE_FETCH_UNAVAILABLE");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "accept": accept,
        "user-agent": "Tianyuan-Workbench-Updater",
        "x-github-api-version": "2022-11-28",
      },
    });
    if (response.status === 404) return { found: false, status: 404, payload: null };
    if (!response.ok) {
      const error = new Error(`GITHUB_UPDATE_HTTP_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return { found: true, status: response.status, payload: await response.json() };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadOptionalManifest(release, options) {
  const asset = (Array.isArray(release?.assets) ? release.assets : [])
    .find((item) => item?.name === UPDATE_MANIFEST_NAME);
  if (!asset?.browser_download_url) return null;
  try {
    const result = await fetchJson(asset.browser_download_url, {
      ...options,
      accept: "application/json",
    });
    return result.found && result.payload && typeof result.payload === "object"
      ? result.payload
      : null;
  } catch {
    return null;
  }
}

async function checkGithubUpdate(input = {}, options = {}) {
  const repository = DEFAULT_REPOSITORY;
  const currentVersion = String(input.currentVersion || "").trim();
  const currentBuildNumber = Number(input.currentBuildNumber || 0);
  if (!parseSemver(currentVersion)) throw new Error("CURRENT_VERSION_INVALID");
  const manifestUpdate = await checkManifestSources(input, options);
  if (manifestUpdate) return manifestUpdate;
  const endpoint = `${GITHUB_API_BASE}/repos/${repository}/releases/latest`;
  const releaseResult = await fetchJson(endpoint, options);
  if (!releaseResult.found) {
    return {
      ok: true,
      action: "check_github_update",
      repository,
      currentVersion,
      currentBuildNumber,
      releasePublished: false,
      updateAvailable: false,
      mandatory: false,
      reason: "GITHUB_RELEASE_NOT_PUBLISHED",
      checkedAt: new Date().toISOString(),
      security: { credentialsReturned: false, tokenUsed: false },
    };
  }

  const release = releaseResult.payload || {};
  const manifest = await loadOptionalManifest(release, options);
  const latestVersion = String(manifest?.productVersion || release.tag_name || "").trim().replace(/^v/i, "");
  if (!parseSemver(latestVersion)) throw new Error("LATEST_VERSION_INVALID");
  const latestBuildNumber = Number(manifest?.buildNumber || 0);
  const versionComparison = compareSemver(latestVersion, currentVersion);
  const buildUpdate = versionComparison === 0
    && latestBuildNumber > 0
    && latestBuildNumber > currentBuildNumber;
  const updateAvailable = versionComparison > 0 || buildUpdate;
  const minimumSupportedVersion = String(manifest?.minimumSupportedVersion || "").trim();
  const mandatory = Boolean(
    manifest?.mandatory
    || (parseSemver(minimumSupportedVersion) && compareSemver(currentVersion, minimumSupportedVersion) < 0)
  );
  const key = platformKey(input.platform, input.architecture);
  const requestedAsset = manifest?.assets?.[key] || null;
  const packageAsset = selectGithubAsset(release.assets, key, requestedAsset?.fileName);
  const checksumAsset = selectChecksumAsset(release.assets, packageAsset?.name);
  const latestRuntimeBuildId = String(manifest?.runtimeBuildId || "").trim();
  const currentRuntimeBuildId = String(input.currentRuntimeBuildId || "").trim();
  const repairRequired = versionComparison === 0
    && Boolean(latestRuntimeBuildId && currentRuntimeBuildId && latestRuntimeBuildId !== currentRuntimeBuildId);

  return {
    ok: true,
    action: "check_github_update",
    repository,
    currentVersion,
    currentBuildNumber,
    currentRuntimeBuildId,
    latestVersion,
    latestBuildNumber,
    latestRuntimeBuildId,
    releasePublished: true,
    updateAvailable: updateAvailable || repairRequired,
    repairRequired,
    mandatory,
    minimumSupportedVersion: minimumSupportedVersion || null,
    channel: manifest?.channel || (release.prerelease ? "beta" : "stable"),
    releaseName: String(release.name || release.tag_name || latestVersion),
    releaseUrl: String(release.html_url || ""),
    publishedAt: release.published_at || null,
    notes: releaseNotes(manifest?.releaseNotes || release.body),
    platform: key,
    asset: packageAsset ? {
      ...packageAsset,
      sha256: String(requestedAsset?.sha256 || packageAsset.sha256 || "").replace(/^sha256:/i, "").toLowerCase(),
    } : null,
    checksumAsset,
    manifestFound: Boolean(manifest),
    checkedAt: new Date().toISOString(),
    security: { credentialsReturned: false, tokenUsed: false },
  };
}

module.exports = {
  DEFAULT_REPOSITORY,
  UPDATE_MANIFEST_NAME,
  configuredManifestUrls,
  parseSemver,
  compareSemver,
  platformKey,
  selectGithubAsset,
  checkGithubUpdate,
};
