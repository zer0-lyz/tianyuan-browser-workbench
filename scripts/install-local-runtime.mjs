#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
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

function copyDir(src, dest) {
  mustExist(src, "source directory");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
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

function writeRuntimeCompatibility(extensionVersion) {
  const compatibilityPath = path.join(nativeRuntimeRoot, "runtime-compat.json");
  const compatibility = {
    version: 1,
    extensionVersion,
    bridgeProtocol: connectorBridge.PROTOCOL_VERSION,
    buildId: connectorBridge.BUILD_ID,
    generatedAt: new Date().toISOString(),
  };
  writePrivateJson(compatibilityPath, compatibility);
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

  copyDir(path.join(repoRoot, "extension"), path.join(runtimeProjectRoot, "extension"));
  copyDir(path.join(repoRoot, "native-helper"), path.join(runtimeProjectRoot, "native-helper"));
  copyDir(path.join(repoRoot, "skills"), path.join(runtimeProjectRoot, "skills"));
  copyDir(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), path.join(runtimeProjectRoot, "plugins", "tianyuan-browser-connector"));
  copyDir(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), userPluginRoot);
  copyDir(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), codexPluginRoot);
  for (const skillName of ["appraisal-detail-print-format", "appraisal-declaration-print-format"]) {
    copyDir(path.join(repoRoot, "skills", skillName), path.join(printSkillsRoot, skillName));
  }

  fs.cpSync(path.join(repoRoot, "native-helper", "native_host.js"), path.join(nativeRuntimeRoot, "native_host.js"), { force: true });
  fs.cpSync(path.join(repoRoot, "native-helper", "connector_bridge.js"), path.join(nativeRuntimeRoot, "connector_bridge.js"), { force: true });
  if (fs.existsSync(path.join(repoRoot, "native-helper", "server.js"))) {
    fs.cpSync(path.join(repoRoot, "native-helper", "server.js"), path.join(nativeRuntimeRoot, "server.js"), { force: true });
  }
  const { source: codexAgentSource, sourcesPath } = ensureCodexAgentSource();
  const extensionManifest = readJson(path.join(repoRoot, "extension", "manifest.json"), {});
  const runtimeCompatibility = writeRuntimeCompatibility(extensionManifest.version);
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
