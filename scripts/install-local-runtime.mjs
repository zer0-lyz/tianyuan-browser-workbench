#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST_NAME = "com.tianyuan.workbench.helper";
const EXTENSION_IDS = [
  "lkflndcnklpeaejohaacoaolnmhgigoc",
  "fdbllnmaaklkcmoacoapbibiggnndkfpa",
];
const PROJECT_NAME = "天源评估系统";
const CONNECTOR_VERSION = "0.3.0";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const runtimeProjectRoot = process.env.TIANYUAN_PROJECT_RUNTIME_ROOT || (isWindows
  ? path.join(localAppData, "TianyuanWorkbench", "projects", PROJECT_NAME)
  : path.join(os.homedir(), ".tianyuan-workbench", "projects", PROJECT_NAME));
const nativeRuntimeRoot = process.env.TIANYUAN_NATIVE_RUNTIME_ROOT || (isWindows
  ? path.join(localAppData, "TianyuanWorkbench", "native-helper")
  : path.join(os.homedir(), ".tianyuan-workbench", "native-helper"));
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

function findExecutable(names) {
  const pathDirs = String(process.env.PATH || "").split(path.delimiter);
  for (const name of names) {
    for (const dir of pathDirs) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return names[0];
}

function writeMacNativeHost(nodeBin) {
  const hostDir = path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
  const launcherPath = path.join(nativeRuntimeRoot, "native_host_launcher.sh");
  const logPath = path.join(nativeRuntimeRoot, "native_host.log");
  fs.mkdirSync(hostDir, { recursive: true });
  fs.writeFileSync(
    launcherPath,
    [
      "#!/bin/bash",
      `echo "$(date '+%Y-%m-%d %H:%M:%S') start native host" >> ${JSON.stringify(logPath)}`,
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

function writeWindowsNativeHost(nodeBin) {
  const launcherPath = path.join(nativeRuntimeRoot, "native_host_launcher.cmd");
  const logPath = path.join(nativeRuntimeRoot, "native_host.log");
  fs.writeFileSync(
    launcherPath,
    [
      "@echo off",
      `echo %DATE% %TIME% start native host>> ${JSON.stringify(logPath)}`,
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
  execFileSync("reg", [
    "add",
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
    "/ve",
    "/t",
    "REG_SZ",
    "/d",
    manifestPath,
    "/f",
  ], { stdio: "inherit" });
  return manifestPath;
}

function main() {
  mustExist(path.join(repoRoot, "extension", "manifest.json"), "extension manifest");
  mustExist(path.join(repoRoot, "native-helper", "native_host.js"), "native host");
  mustExist(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), "connector plugin");

  fs.mkdirSync(runtimeProjectRoot, { recursive: true });
  fs.mkdirSync(nativeRuntimeRoot, { recursive: true });

  copyDir(path.join(repoRoot, "extension"), path.join(runtimeProjectRoot, "extension"));
  copyDir(path.join(repoRoot, "native-helper"), path.join(runtimeProjectRoot, "native-helper"));
  copyDir(path.join(repoRoot, "skills"), path.join(runtimeProjectRoot, "skills"));
  copyDir(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), path.join(runtimeProjectRoot, "plugins", "tianyuan-browser-connector"));
  copyDir(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), userPluginRoot);
  copyDir(path.join(repoRoot, "plugins", "tianyuan-browser-connector"), codexPluginRoot);

  fs.cpSync(path.join(repoRoot, "native-helper", "native_host.js"), path.join(nativeRuntimeRoot, "native_host.js"), { force: true });
  if (fs.existsSync(path.join(repoRoot, "native-helper", "server.js"))) {
    fs.cpSync(path.join(repoRoot, "native-helper", "server.js"), path.join(nativeRuntimeRoot, "server.js"), { force: true });
  }

  const nodeBin = process.env.TIANYUAN_NODE_BIN || findExecutable(isWindows ? ["node.exe", "node"] : ["node"]);
  const nativeManifest = isWindows ? writeWindowsNativeHost(nodeBin) : writeMacNativeHost(nodeBin);

  const summary = {
    ok: true,
    repoRoot,
    runtimeProjectRoot,
    extensionPath: path.join(runtimeProjectRoot, "extension"),
    nativeRuntimeRoot,
    nativeManifest,
    connectorPath: userPluginRoot,
    codexConnectorCachePath: codexPluginRoot,
    credentialsWritten: false,
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
