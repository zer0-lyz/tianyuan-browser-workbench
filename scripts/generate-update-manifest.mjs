#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workbenchRoot = process.env.TIANYUAN_WORKBENCH_ROOT
  || path.join(os.homedir(), ".tianyuan-workbench");
const distRoot = process.env.TIANYUAN_RELEASE_OUTPUT_DIR
  || path.join(workbenchRoot, "releases");
const releaseBaseUrl = String(process.env.TIANYUAN_RELEASE_BASE_URL || "").trim().replace(/\/+$/, "");
const versionConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, "extension", "version.json"), "utf8"));

function sha256(targetPath) {
  return createHash("sha256").update(fs.readFileSync(targetPath)).digest("hex");
}

function runtimeBuildId() {
  const roots = [
    "extension",
    "native-helper",
    "plugins/tianyuan-browser-connector",
    "scripts/install-local-runtime.mjs",
  ];
  const files = [];
  for (const relativeRoot of roots) {
    const absoluteRoot = path.join(repoRoot, relativeRoot);
    const stats = fs.statSync(absoluteRoot);
    if (stats.isFile()) {
      files.push(relativeRoot);
      continue;
    }
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === ".DS_Store" || entry.name.startsWith("._") || entry.name === "runtime-compat.json") continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolutePath);
        else if (entry.isFile()) files.push(path.relative(repoRoot, absolutePath));
      }
    };
    visit(absoluteRoot);
  }
  const hash = createHash("sha256");
  for (const relativePath of files.sort()) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(repoRoot, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function findPackage(patterns, targetFileName, { includeLite = null } = {}) {
  if (!fs.existsSync(distRoot)) return null;
  const allCandidates = fs.readdirSync(distRoot)
    .filter((name) => {
      const lowerName = name.toLowerCase();
      if (!name.endsWith(".zip")) return false;
      if (!name.includes(`v${versionConfig.productVersion}`)) return false;
      if (!patterns.some((pattern) => lowerName.includes(pattern))) return false;
      if (includeLite === true && !lowerName.includes("-lite")) return false;
      if (includeLite === false && lowerName.includes("-lite")) return false;
      return true;
    });
  const sourceCandidates = allCandidates.filter((name) => name !== targetFileName);
  const candidates = (sourceCandidates.length ? sourceCandidates : allCandidates)
    .sort((left, right) => {
      const leftMtime = fs.statSync(path.join(distRoot, left)).mtimeMs;
      const rightMtime = fs.statSync(path.join(distRoot, right)).mtimeMs;
      if (leftMtime !== rightMtime) return rightMtime - leftMtime;
      return right.localeCompare(left);
    });
  if (!candidates.length) return null;
  const fileName = candidates[0];
  const targetPath = path.join(distRoot, fileName);
  return {
    fileName,
    sha256: sha256(targetPath),
    size: fs.statSync(targetPath).size,
  };
}

function releaseAsset(patterns, key, options = {}) {
  const fileName = `tianyuan-workbench-v${versionConfig.productVersion}-${key}.zip`;
  const source = findPackage(patterns, fileName, options);
  if (!source) return null;
  const targetPath = path.join(distRoot, fileName);
  const sourcePath = path.join(distRoot, source.fileName);
  if (path.resolve(sourcePath) !== path.resolve(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }
  const digest = sha256(targetPath);
  fs.writeFileSync(path.join(distRoot, `${fileName}.sha256`), `${digest}  ${fileName}\n`);
  return {
    fileName,
    ...(releaseBaseUrl ? { url: `${releaseBaseUrl}/${encodeURIComponent(fileName)}` } : {}),
    sha256: digest,
    size: fs.statSync(targetPath).size,
  };
}

const assets = {};
const windowsPackageMode = String(process.env.TIANYUAN_WINDOWS_PACKAGE_MODE || "full").trim().toLowerCase();
const windows = releaseAsset(["windows-x64"], "windows-x64", {
  includeLite: windowsPackageMode === "lite" ? true : false,
});
const macos = releaseAsset(["macos-arm64", "macos-apple"], "macos-arm64");
if (windows) assets["windows-x64"] = windows;
if (macos) assets["macos-arm64"] = macos;

const payload = {
  schemaVersion: 1,
  repository: versionConfig.repository,
  ...(releaseBaseUrl ? { source: "static-manifest", releaseUrl: releaseBaseUrl } : {}),
  productVersion: versionConfig.productVersion,
  chromeVersion: versionConfig.chromeVersion,
  channel: versionConfig.channel,
  buildNumber: versionConfig.buildNumber,
  publishedAt: new Date().toISOString(),
  minimumSupportedVersion: versionConfig.minimumSupportedVersion,
  bridgeProtocol: versionConfig.bridgeProtocol,
  runtimeBuildId: runtimeBuildId(),
  mandatory: Boolean(versionConfig.mandatory),
  releaseNotes: Array.isArray(versionConfig.releaseNotes) ? versionConfig.releaseNotes : [],
  assets,
};

fs.mkdirSync(distRoot, { recursive: true });
const outputPath = path.join(distRoot, "update-manifest.json");
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(outputPath);
