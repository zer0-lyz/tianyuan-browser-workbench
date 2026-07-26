#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HOST_NAME = "com.tianyuan.workbench.helper";
const EXTENSION_IDS = [
  "lkflndcnklpeaejohaacoaolnmhgigoc",
  "fdbllnmaaklkcmoacoapbibiggnndkfpa",
];
const PROJECT_NAME = "天源评估系统";
const CONNECTOR_VERSION = "0.4.1";
const require = createRequire(import.meta.url);
const connectorBridge = require("../native-helper/connector_bridge.js");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const runtimeProjectRoot = process.env.TIANYUAN_PROJECT_RUNTIME_ROOT || (isWindows
  ? path.join(localAppData, "TianyuanWorkbench", "projects", PROJECT_NAME)
  : path.join(os.homedir(), ".tianyuan-workbench", "projects", PROJECT_NAME));
const nativeRuntimeRoot = process.env.TIANYUAN_NATIVE_RUNTIME_ROOT || (isWindows
  ? path.join(localAppData, "TianyuanWorkbench", "native-helper")
  : path.join(os.homedir(), ".tianyuan-workbench", "native-helper"));
const printSkillsRoot = isWindows
  ? path.join(localAppData, "TianyuanWorkbench", "print-format-skills")
  : path.join(os.homedir(), ".tianyuan-workbench", "dependencies", PROJECT_NAME, "print-format-skills");
const userPluginRoot = path.join(os.homedir(), "plugins", "tianyuan-browser-connector");
const codexPluginRoot = path.join(
  os.homedir(),
  ".codex",
  "plugins",
  "cache",
  "personal",
  "tianyuan-browser-connector",
  CONNECTOR_VERSION,
);

function mustExist(targetPath, label) {
  if (!fs.existsSync(targetPath)) throw new Error(`${label} not found: ${targetPath}`);
}

function validateCopiedDirectory(dest, requiredRelativePaths = []) {
  for (const relativePath of requiredRelativePaths) {
    mustExist(path.join(dest, relativePath), `installed file ${relativePath}`);
  }
}

function copyDir(src, dest, requiredRelativePaths = []) {
  mustExist(src, "source directory");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const suffix = `${process.pid}-${randomBytes(5).toString("hex")}`;
  const staging = `${dest}.staging-${suffix}`;
  const backup = `${dest}.backup-${suffix}`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(src, staging, { recursive: true, force: true });
  validateCopiedDirectory(staging, requiredRelativePaths);
  let movedExisting = false;
  try {
    if (fs.existsSync(dest)) {
      fs.renameSync(dest, backup);
      movedExisting = true;
    }
    fs.renameSync(staging, dest);
    if (movedExisting) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (!fs.existsSync(dest) && movedExisting && fs.existsSync(backup)) {
      fs.renameSync(backup, dest);
    }
    throw error;
  }
}

function copyFileAtomic(src, dest) {
  mustExist(src, "source file");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const temporary = `${dest}.tmp-${process.pid}-${randomBytes(5).toString("hex")}`;
  fs.copyFileSync(src, temporary);
  if (fs.statSync(temporary).size !== fs.statSync(src).size) {
    fs.rmSync(temporary, { force: true });
    throw new Error(`installed file size mismatch: ${dest}`);
  }
  fs.renameSync(temporary, dest);
}

function sourceBuildDigest() {
  const hash = createHash("sha256");
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
  for (const relativePath of files.sort()) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(repoRoot, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readJson(targetPath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function writePrivateJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (!isWindows) fs.chmodSync(targetPath, 0o600);
}

function ensureCodexAgentSource() {
  const sourcesPath = path.join(nativeRuntimeRoot, "agent-sources.json");
  const sourcesPayload = readJson(sourcesPath, { version: 1, sources: [] });
  const sources = Array.isArray(sourcesPayload.sources) ? sourcesPayload.sources : [];
  const existing = sources.find((source) => source?.providerId === "codex" && source?.installationId);
  if (existing) return { source: existing, sourcesPath };

  const installationId = `codex-${randomUUID()}`;
  let credentialRef = "";
  if (!isWindows) {
    const service = `com.tianyuan.workbench.agent.codex.${installationId}`;
    const account = "connector-bridge";
    const secret = randomBytes(32).toString("base64url");
    try {
      execFileSync("security", [
        "add-generic-password",
        "-U",
        "-s", service,
        "-a", account,
        "-w", secret,
      ], { stdio: ["ignore", "ignore", "ignore"] });
      credentialRef = `keychain:${service}:${account}`;
    } catch {
      // Use the restricted local runtime only if Keychain is unavailable.
    }
  }
  if (!credentialRef) {
    const credentialPath = path.join(nativeRuntimeRoot, "agent-credentials.json");
    const credentialKey = `codex-${installationId}`;
    const credentials = readJson(credentialPath, { secrets: {} });
    credentials.secrets = credentials.secrets || {};
    credentials.secrets[credentialKey] = randomBytes(32).toString("base64url");
    writePrivateJson(credentialPath, credentials);
    credentialRef = `file:${credentialPath}#${credentialKey}`;
  }
  const timestamp = new Date().toISOString();
  const source = {
    agentId: "codex",
    providerId: "codex",
    displayName: "Codex",
    installationId,
    credentialRef,
    manual: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastSeenAt: null,
  };
  sources.push(source);
  writePrivateJson(sourcesPath, {
    version: 1,
    updatedAt: timestamp,
    sources,
  });
  return { source, sourcesPath };
}

function writeAgentConfig(pluginRoot, source) {
  writePrivateJson(path.join(pluginRoot, "runtime", "agent-config.json"), {
    providerId: source.providerId,
    installationId: source.installationId,
    credentialRef: source.credentialRef,
  });
}

function writeRuntimeCompatibility(extensionVersion, runtimeBuildId) {
  const compatibilityPath = path.join(nativeRuntimeRoot, "runtime-compat.json");
  const compatibility = {
    version: 2,
    extensionVersion,
    bridgeProtocol: connectorBridge.PROTOCOL_VERSION,
    buildId: connectorBridge.BUILD_ID,
    runtimeBuildId,
    generatedAt: new Date().toISOString(),
  };
  writePrivateJson(compatibilityPath, compatibility);
  fs.writeFileSync(
    path.join(runtimeProjectRoot, "extension", "runtime-compat.json"),
    `${JSON.stringify(compatibility, null, 2)}\n`,
  );
  const installedManifest = readJson(path.join(runtimeProjectRoot, "extension", "manifest.json"), {});
  if (installedManifest.version !== extensionVersion) {
    throw new Error("RUNTIME_EXTENSION_VERSION_MISMATCH");
  }
  const bridgeText = fs.readFileSync(path.join(nativeRuntimeRoot, "connector_bridge.js"), "utf8");
  if (!bridgeText.includes("x-tianyuan-extension-version")) {
    throw new Error("RUNTIME_BROWSER_IDENTITY_CONTRACT_MISSING");
  }
  return { compatibilityPath, ...compatibility };
}

function executableCandidates(names) {
  const pathDirs = String(process.env.PATH || "").split(path.delimiter);
  const candidates = [];
  for (const name of names) {
    if (path.isAbsolute(name)) {
      candidates.push(name);
      continue;
    }
    for (const dir of pathDirs) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) candidates.push(candidate);
    }
  }
  return [...new Set(candidates)];
}

function findExecutable(names) {
  return executableCandidates(names)[0] || names[0];
}

function versionAtLeast(value, minimum) {
  const current = String(value || "").split(".").map((part) => Number(part) || 0);
  for (let index = 0; index < minimum.length; index += 1) {
    const actual = current[index] || 0;
    if (actual > minimum[index]) return true;
    if (actual < minimum[index]) return false;
  }
  return true;
}

function findPrintPython() {
  const candidates = [
    process.env.TIANYUAN_PYTHON_BIN,
    ...executableCandidates(isWindows ? ["python.exe", "python3", "python"] : ["python3", "python"]),
    ...(isWindows ? [] : ["/usr/bin/python3"]),
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const output = execFileSync(
        candidate,
        ["-c", "import openpyxl, et_xmlfile; print(openpyxl.__version__)"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      if (versionAtLeast(output, [3, 1, 5])) {
        return { path: candidate, openpyxlVersion: output };
      }
    } catch {
      // Try the next local Python interpreter without exposing environment details.
    }
  }
  return null;
}

function writeMacNativeHost(nodeBin, pythonBin) {
  const hostDir = path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
  const launcherPath = path.join(nativeRuntimeRoot, "native_host_launcher.sh");
  const logPath = path.join(nativeRuntimeRoot, "native_host.log");
  fs.mkdirSync(hostDir, { recursive: true });
  fs.writeFileSync(
    launcherPath,
    [
      "#!/bin/bash",
      `echo "$(date '+%Y-%m-%d %H:%M:%S') start native host" >> ${JSON.stringify(logPath)}`,
      `export TIANYUAN_PYTHON_BIN=${JSON.stringify(pythonBin)}`,
      `exec ${JSON.stringify(nodeBin)} ${JSON.stringify(path.join(nativeRuntimeRoot, "native_host.js"))} 2>> ${JSON.stringify(logPath)}`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  const manifestPath = path.join(hostDir, `${HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify({
    name: HOST_NAME,
    description: "Tianyuan Browser Workbench native helper",
    path: launcherPath,
    type: "stdio",
    allowed_origins: EXTENSION_IDS.map((id) => `chrome-extension://${id}/`),
  }, null, 2) + "\n");
  return manifestPath;
}

function writeWindowsNativeHost(nodeBin, pythonBin) {
  const launcherPath = path.join(nativeRuntimeRoot, "native_host_launcher.cmd");
  const logPath = path.join(nativeRuntimeRoot, "native_host.log");
  const runtimeConfigPath = path.join(nativeRuntimeRoot, "runtime-config.json");
  fs.writeFileSync(runtimeConfigPath, JSON.stringify({
    version: 1,
    pythonBin,
    printSkillsDir: printSkillsRoot,
  }, null, 2) + "\n");
  fs.writeFileSync(
    launcherPath,
    [
      "@echo off",
      `echo %DATE% %TIME% start native host>> ${JSON.stringify(logPath)}`,
      `set "TIANYUAN_RUNTIME_CONFIG_PATH=${runtimeConfigPath}"`,
      `${JSON.stringify(nodeBin)} ${JSON.stringify(path.join(nativeRuntimeRoot, "native_host.js"))} 2>> ${JSON.stringify(logPath)}`,
      "",
    ].join("\r\n"),
  );
  const manifestPath = path.join(nativeRuntimeRoot, `${HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify({
    name: HOST_NAME,
    description: "Tianyuan Browser Workbench native helper",
    path: launcherPath,
    type: "stdio",
    allowed_origins: EXTENSION_IDS.map((id) => `chrome-extension://${id}/`),
  }, null, 2) + "\n");
  for (const registryPath of [
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
    `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
  ]) {
    execFileSync("reg", [
      "add",
      registryPath,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      manifestPath,
      "/f",
    ], { stdio: "inherit" });
  }
  return manifestPath;
}

function main() {
  mustExist(path.join(repoRoot, "extension", "manifest.json"), "extension manifest");
  mustExist(path.join(repoRoot, "native-helper", "native_host.js"), "native host");
  mustExist(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), "connector plugin");
  const printPython = findPrintPython();
  if (!printPython) {
    throw new Error("PRINT_PYTHON_OPENPYXL_NOT_FOUND: install Python with openpyxl>=3.1.5 and et_xmlfile, then rerun.");
  }

  fs.mkdirSync(runtimeProjectRoot, { recursive: true });
  fs.mkdirSync(nativeRuntimeRoot, { recursive: true });

  const runtimeBuildId = sourceBuildDigest();
  copyDir(
    path.join(repoRoot, "extension"),
    path.join(runtimeProjectRoot, "extension"),
    ["manifest.json", "version.json", "src/content/content.js", "src/injected/page_adapter.js", "src/sidepanel/sidepanel.js"],
  );
  copyDir(
    path.join(repoRoot, "native-helper"),
    path.join(runtimeProjectRoot, "native-helper"),
    ["native_host.js", "connector_bridge.js", "update_checker.js"],
  );
  copyDir(path.join(repoRoot, "skills"), path.join(runtimeProjectRoot, "skills"));
  copyDir(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), path.join(runtimeProjectRoot, "plugins", "tianyuan-browser-connector"));
  copyDir(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), userPluginRoot);
  copyDir(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), codexPluginRoot);
  for (const skillName of ["appraisal-detail-print-format", "appraisal-declaration-print-format"]) {
    copyDir(path.join(repoRoot, "skills", skillName), path.join(printSkillsRoot, skillName));
  }

  copyFileAtomic(path.join(repoRoot, "native-helper", "native_host.js"), path.join(nativeRuntimeRoot, "native_host.js"));
  copyFileAtomic(path.join(repoRoot, "native-helper", "connector_bridge.js"), path.join(nativeRuntimeRoot, "connector_bridge.js"));
  copyFileAtomic(path.join(repoRoot, "native-helper", "update_checker.js"), path.join(nativeRuntimeRoot, "update_checker.js"));
  if (fs.existsSync(path.join(repoRoot, "native-helper", "server.js"))) {
    copyFileAtomic(path.join(repoRoot, "native-helper", "server.js"), path.join(nativeRuntimeRoot, "server.js"));
  }
  const { source: codexAgentSource, sourcesPath } = ensureCodexAgentSource();
  const extensionManifest = readJson(path.join(repoRoot, "extension", "manifest.json"), {});
  const versionConfig = readJson(path.join(repoRoot, "extension", "version.json"), {});
  if (
    extensionManifest.version !== versionConfig.chromeVersion
    || (extensionManifest.version_name || extensionManifest.version) !== versionConfig.versionName
  ) {
    throw new Error("PRODUCT_VERSION_CONFIG_MISMATCH");
  }
  const runtimeCompatibility = writeRuntimeCompatibility(extensionManifest.version, runtimeBuildId);
  for (const pluginRoot of [userPluginRoot, codexPluginRoot]) {
    writeAgentConfig(pluginRoot, codexAgentSource);
  }

  const nodeBin = process.env.TIANYUAN_NODE_BIN || findExecutable(isWindows ? ["node.exe", "node"] : ["node"]);
  const nativeManifest = isWindows
    ? writeWindowsNativeHost(nodeBin, printPython.path)
    : writeMacNativeHost(nodeBin, printPython.path);

  const summary = {
    ok: true,
    repoRoot,
    runtimeProjectRoot,
    extensionPath: path.join(runtimeProjectRoot, "extension"),
    nativeRuntimeRoot,
    nativeManifest,
    printSkillsRoot,
    printFormat: {
      ready: true,
      pythonBin: printPython.path,
      openpyxlVersion: printPython.openpyxlVersion,
    },
    connectorPath: userPluginRoot,
    codexConnectorCachePath: codexPluginRoot,
    runtimeCompatibility,
    agentSourceRegistryPath: sourcesPath,
    codexAgentSource: {
      providerId: codexAgentSource.providerId,
      installationId: codexAgentSource.installationId,
      credentialStorage: codexAgentSource.credentialRef.startsWith("keychain:") ? "macOS Keychain" : "restricted local runtime",
    },
    mcpCredentialsWritten: false,
    agentCredentialProvisioned: true,
    next: [
      "Open Chrome extensions page.",
      "Enable Developer mode.",
      `Load unpacked extension from: ${path.join(runtimeProjectRoot, "extension")}`,
      "Open the Tianyuan Workbench side panel and configure MCP token in the panel if needed.",
    ],
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
