"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFileArchiveConversationService } = require("./file-archive-conversations.js");

const ARCHIVE_STATE_FILE = "file-archive-state.json";
const ARCHIVE_CONFIG_FILE = "file-archive-config.json";
const DEFAULT_STABLE_MS = 3000;
const MAX_RECENT_FILES = 30;
const MAX_RECORDS = 2000;
const MAX_SCAN_FILES = 2000;
const FILE_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".csv", ".txt",
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff", ".zip", ".rar",
]);

function security() {
  return {
    credentialsReturned: false,
    messageContentsReturned: false,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function isAbsolutePath(value) {
  return Boolean(value && path.isAbsolute(String(value)));
}

function isSameOrInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function fileExtension(filePath) {
  return path.extname(String(filePath || "")).toLowerCase();
}

function shouldConsiderFile(filePath) {
  const name = path.basename(filePath);
  return !name.startsWith(".")
    && !name.startsWith("~$")
    && !name.endsWith(".tmp")
    && !name.endsWith(".part")
    && FILE_EXTENSIONS.has(fileExtension(name));
}

function directoryChildren(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

function readableDirectory(directory) {
  try {
    fs.accessSync(directory, fs.constants.R_OK);
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function findWechatFileRoots(homeDir) {
  const base = path.join(
    homeDir,
    "Library",
    "Containers",
    "com.tencent.xinWeChat",
    "Data",
    "Documents",
    "xwechat_files",
  );
  const roots = [];
  for (const accountDirectory of directoryChildren(base)) {
    const fileRoot = path.join(accountDirectory, "msg", "file");
    if (readableDirectory(fileRoot)) roots.push(fileRoot);
  }
  return { base, roots };
}

function findWecomFileRoots(homeDir) {
  const bases = [
    path.join(homeDir, "Library", "Containers", "com.tencent.WeWorkMac", "Data", "Documents"),
    path.join(homeDir, "Library", "Containers", "com.tencent.WeWorkMac", "Data", "Library", "Application Support"),
    path.join(homeDir, "Library", "Application Support", "WXWork"),
  ];
  const roots = [];
  const visited = new Set();
  function visit(directory, depth) {
    if (depth > 3 || visited.has(directory)) return;
    visited.add(directory);
    if (!readableDirectory(directory)) return;
    const name = path.basename(directory).toLowerCase();
    if (["file", "files", "download", "downloads", "filemsg"].includes(name)) {
      roots.push(directory);
      return;
    }
    for (const child of directoryChildren(directory)) visit(child, depth + 1);
  }
  for (const base of bases) visit(base, 0);
  return { bases, roots: [...new Set(roots)] };
}

function detectApplications({ homeDir = os.homedir(), platform = process.platform } = {}) {
  const wechat = findWechatFileRoots(homeDir);
  const wecom = findWecomFileRoots(homeDir);
  const applications = {
    wechat: {
      id: "wechat",
      name: "微信",
      installed: ["/Applications/WeChat.app", path.join(homeDir, "Applications", "WeChat.app")].some((item) => fs.existsSync(item)) || readableDirectory(wechat.base),
      sourceBase: wechat.base,
      fileRoots: wechat.roots,
      sourceMatching: "unavailable",
    },
    wecom: {
      id: "wecom",
      name: "企业微信",
      installed: [
        "/Applications/企业微信.app",
        "/Applications/WeCom.app",
        path.join(homeDir, "Applications", "企业微信.app"),
        path.join(homeDir, "Applications", "WeCom.app"),
      ].some((item) => fs.existsSync(item)) || wecom.bases.some(readableDirectory),
      sourceBase: wecom.bases.find(readableDirectory) || "",
      fileRoots: wecom.roots,
      sourceMatching: "unavailable",
    },
  };
  return {
    ok: platform === "darwin",
    platform,
    applications,
    limitation: "当前版本只能可靠发现已完成下载文件，暂时无法从本地目录可靠解析来源会话或群聊 ID。来源未知的文件会进入待确认目录，不会自动归档到指定群。",
    security: security(),
  };
}

function collectFiles(root, results = [], { maxDepth = 3, maxFiles = MAX_SCAN_FILES } = {}, depth = 0) {
  if (!readableDirectory(root) || depth > maxDepth || results.length >= maxFiles) return results;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (results.length >= maxFiles) break;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      collectFiles(fullPath, results, { maxDepth, maxFiles }, depth + 1);
    } else if (entry.isFile() && shouldConsiderFile(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function wait(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function waitForStableFile(filePath, { stableMs = DEFAULT_STABLE_MS, pollMs = 250 } = {}) {
  const first = fs.statSync(filePath);
  if (!first.isFile() || first.size <= 0) throw new Error("SOURCE_FILE_EMPTY");
  await wait(Math.max(1, Number(stableMs) || DEFAULT_STABLE_MS));
  const second = fs.statSync(filePath);
  if (!second.isFile() || second.size <= 0) throw new Error("SOURCE_FILE_DISAPPEARED");
  if (first.size !== second.size || first.mtimeMs !== second.mtimeMs) {
    await wait(Math.max(1, Number(pollMs) || 250));
    return waitForStableFile(filePath, { stableMs, pollMs });
  }
  return second;
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function uniqueDestination(directory, fileName, duplicateMode = "rename") {
  const safeName = path.basename(fileName).replace(/[\\/:*?"<>|]/g, "_") || "未命名文件";
  const first = path.join(directory, safeName);
  if (!fs.existsSync(first) || duplicateMode === "overwrite") return first;
  if (duplicateMode === "skip") return "";
  const extension = path.extname(safeName);
  const stem = extension ? safeName.slice(0, -extension.length) : safeName;
  for (let index = 1; index <= 9999; index += 1) {
    const candidate = path.join(directory, `${stem} (${index})${extension}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error("DESTINATION_NAME_EXHAUSTED");
}

function baseState(config = {}) {
  return {
    ok: true,
    action: "file_archive_status",
    state: "stopped",
    sourceApp: config.sourceApp || "wechat",
    sourceRoots: [],
    outputDirectory: config.outputDirectory || "",
    directoryMode: config.directoryMode || "by_app_date",
    duplicateMode: config.duplicateMode || "rename",
    stableSeconds: Number(config.stableSeconds || DEFAULT_STABLE_MS / 1000),
    sourceMatching: "unavailable",
    limitation: "当前只能检测新下载文件，暂时无法可靠识别来源会话；未知来源将进入待确认目录。",
    counts: {
      discovered: 0,
      waiting: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      unknownSource: 0,
      matchedSource: 0,
      lowConfidence: 0,
    },
    recentFiles: [],
    lastSuccessAt: null,
    lastError: null,
    pid: null,
    updatedAt: nowIso(),
    security: security(),
  };
}

class FileArchiveDaemon {
  constructor({ runtimeDirectory, config, detector = detectApplications, conversationService = null, fsModule = fs, homeDir = os.homedir(), platform = process.platform } = {}) {
    this.runtimeDirectory = runtimeDirectory;
    this.config = {
      sourceApp: "wechat",
      outputDirectory: "",
      directoryMode: "by_app_date",
      duplicateMode: "rename",
      stableSeconds: DEFAULT_STABLE_MS / 1000,
      unknownSourcePolicy: "copy_pending",
      concurrency: 2,
      ...config,
    };
    this.detector = detector;
    this.conversationService = conversationService;
    this.fs = fsModule;
    this.homeDir = homeDir;
    this.platform = platform;
    this.statePath = path.join(runtimeDirectory, ARCHIVE_STATE_FILE);
    this.configPath = path.join(runtimeDirectory, ARCHIVE_CONFIG_FILE);
    this.state = {
      ...baseState(this.config),
      ...readJson(this.statePath, {}),
      counts: {
        ...baseState(this.config).counts,
        ...readJson(this.statePath, {}).counts,
      },
      pid: null,
      state: "stopped",
    };
    this.watchers = [];
    this.scanTimer = null;
    this.queue = [];
    this.processing = false;
    this.concurrency = Math.max(1, Number(this.config.concurrency || 2));
    this.paused = false;
    this.commandPath = path.join(runtimeDirectory, "file-archive-command.json");
    this.records = new Map(Object.entries(readJson(
      path.join(runtimeDirectory, "file-archive-records.json"),
      {},
    )));
    this.stopping = false;
  }

  writeState() {
    this.state.updatedAt = nowIso();
    writeJson(this.statePath, this.state);
  }

  async start({ daemon = false } = {}) {
    if (this.platform !== "darwin") {
      this.state = { ...this.state, state: "failed", lastError: "PLATFORM_FILE_ARCHIVE_UNSUPPORTED" };
      this.writeState();
      return { ok: false, reason: "PLATFORM_FILE_ARCHIVE_UNSUPPORTED", state: this.state, security: security() };
    }
    if (!isAbsolutePath(this.config.outputDirectory)) throw new Error("ARCHIVE_OUTPUT_DIRECTORY_REQUIRED");
    if (!readableDirectory(this.config.outputDirectory)) throw new Error("ARCHIVE_OUTPUT_DIRECTORY_NOT_WRITABLE");
    const detected = this.detector({ homeDir: this.homeDir, platform: this.platform });
    const app = detected.applications[this.config.sourceApp];
    const roots = app?.fileRoots || [];
    if (!app?.installed) throw new Error("SOURCE_APPLICATION_NOT_DETECTED");
    if (!roots.length) throw new Error("SOURCE_DOWNLOAD_DIRECTORY_NOT_FOUND");
    if (roots.some((root) => isSameOrInside(this.config.outputDirectory, root))) {
      throw new Error("ARCHIVE_OUTPUT_MUST_NOT_BE_INSIDE_SOURCE");
    }
    this.state = {
      ...baseState(this.config),
      state: "running",
      pid: process.pid,
      sourceRoots: roots.map((root) => path.basename(root)),
      sourceMatching: app.sourceMatching,
      limitation: detected.limitation,
    };
    this.writeState();
    writeJson(this.configPath, this.config);
    for (const root of roots) {
      try {
        const watcher = this.fs.watch(root, { recursive: true }, (_event, fileName) => {
          if (!fileName) return;
          const candidate = path.isAbsolute(String(fileName))
            ? String(fileName)
            : path.join(root, String(fileName));
          this.enqueue(candidate);
        });
        this.watchers.push(watcher);
      } catch (error) {
        this.state.lastError = `WATCHER_START_FAILED:${error?.code || "UNKNOWN"}`;
      }
    }
    this.scanTimer = setInterval(() => this.scan(), 1500);
    this.commandTimer = setInterval(() => this.consumeCommand(), 500);
    await this.scan();
    if (daemon) {
      process.once("SIGTERM", () => this.stop());
      process.once("SIGINT", () => this.stop());
    }
    this.writeState();
    return { ok: true, started: true, state: this.state, security: security() };
  }

  async scan() {
    if (this.stopping || this.paused) return;
    const detected = this.detector({ homeDir: this.homeDir, platform: this.platform });
    const app = detected.applications[this.config.sourceApp];
    for (const root of app?.fileRoots || []) {
      for (const filePath of collectFiles(root)) this.enqueue(filePath);
    }
    this.writeState();
  }

  enqueue(filePath) {
    const resolved = path.resolve(String(filePath || ""));
    if (!resolved || !shouldConsiderFile(resolved) || this.queue.includes(resolved)) return;
    if (this.records.has(resolved)) return;
    this.queue.push(resolved);
    this.state.counts.discovered += 1;
    this.state.counts.waiting += 1;
    this.writeState();
    void this.drain();
  }

  async drain() {
    if (this.processing) return;
    this.processing = true;
    const worker = async () => {
      while (this.queue.length && !this.stopping && !this.paused) {
        const filePath = this.queue.shift();
        this.state.counts.waiting = Math.max(0, this.state.counts.waiting - 1);
        try {
          await this.processFile(filePath);
        } catch (error) {
          this.state.counts.failed += 1;
          this.state.lastError = `${error?.message || String(error)}`.slice(0, 240);
          this.addRecent(filePath, "COPY_FAILED", this.state.lastError);
        }
        this.writeState();
      }
    };
    await Promise.all(Array.from({ length: this.concurrency }, () => worker()));
    this.processing = false;
  }

  addRecent(filePath, status, message = "") {
    this.state.recentFiles.unshift({
      fileName: path.basename(filePath),
      status,
      message,
      at: nowIso(),
    });
    this.state.recentFiles = this.state.recentFiles.slice(0, MAX_RECENT_FILES);
  }

  async processFile(filePath) {
    const stat = await waitForStableFile(filePath, {
      stableMs: Math.max(20, Number(this.config.stableSeconds || 3) * 1000),
      pollMs: 250,
    });
    const hash = await sha256(filePath);
    const recordKey = `${this.config.sourceApp}|${path.basename(filePath)}|${stat.size}|${hash}`;
    if (this.records.has(recordKey)) {
      this.state.counts.skipped += 1;
      this.addRecent(filePath, "DUPLICATE");
      return;
    }
    const sourceMatch = this.conversationService?.resolveDownloadedFile({
      appType: this.config.sourceApp,
      filePath,
    }) || null;
    const highConfidenceMatch = sourceMatch?.confidence === "high" && sourceMatch.outputDirectory;
    if (sourceMatch?.confidence === "low") this.state.counts.lowConfidence += 1;
    const day = nowIso().slice(0, 10);
    const appName = this.config.sourceApp === "wecom" ? "企业微信" : "微信";
    const destinationDirectory = highConfidenceMatch
      ? path.join(path.resolve(sourceMatch.outputDirectory), day)
      : this.config.directoryMode === "direct"
        ? path.resolve(this.config.outputDirectory)
        : path.join(path.resolve(this.config.outputDirectory), appName, "来源未知待确认", day);
    fs.mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
    const destination = uniqueDestination(destinationDirectory, path.basename(filePath), this.config.duplicateMode);
    if (!destination) {
      this.state.counts.skipped += 1;
      this.addRecent(filePath, "DUPLICATE");
      return;
    }
    fs.copyFileSync(filePath, destination);
    const destinationStat = fs.statSync(destination);
    const destinationHash = await sha256(destination);
    if (destinationStat.size !== stat.size || destinationHash !== hash) {
      try { fs.unlinkSync(destination); } catch { /* Preserve source if cleanup is blocked. */ }
      throw new Error("COPY_VERIFY_FAILED");
    }
    this.state.counts.completed += 1;
    if (highConfidenceMatch) this.state.counts.matchedSource += 1;
    else this.state.counts.unknownSource += 1;
    this.state.lastSuccessAt = nowIso();
    this.addRecent(
      filePath,
      highConfidenceMatch ? "COMPLETED_MATCHED_SOURCE" : "COMPLETED_UNKNOWN_SOURCE",
      highConfidenceMatch ? `${sourceMatch.conversationName || sourceMatch.conversationId} -> ${destination}` : destination,
    );
    this.records.set(recordKey, {
      hash,
      size: stat.size,
      fileName: path.basename(filePath),
      conversationId: highConfidenceMatch ? sourceMatch.conversationId : null,
      confidence: highConfidenceMatch ? "high" : sourceMatch?.confidence || "unknown",
      at: nowIso(),
    });
    if (this.records.size > MAX_RECORDS) this.records.delete(this.records.keys().next().value);
    writeJson(path.join(this.runtimeDirectory, "file-archive-records.json"), Object.fromEntries(this.records));
  }

  stop() {
    this.stopping = true;
    for (const watcher of this.watchers) watcher.close?.();
    this.watchers = [];
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.commandTimer) clearInterval(this.commandTimer);
    this.scanTimer = null;
    this.commandTimer = null;
    this.state.state = "stopped";
    this.state.pid = null;
    this.writeState();
    setTimeout(() => process.exit(0), 20);
  }

  consumeCommand() {
    const command = readJson(this.commandPath, null);
    if (!command?.command) return;
    try { fs.unlinkSync(this.commandPath); } catch { /* The next poll can safely retry. */ }
    if (command.command === "pause") {
      this.paused = true;
      this.state.state = "paused";
      this.writeState();
    } else if (command.command === "resume") {
      this.paused = false;
      this.state.state = "running";
      this.writeState();
      void this.scan();
      void this.drain();
    } else if (command.command === "scan") {
      void this.scan();
      void this.drain();
    }
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function createFileArchiveService({ runtimeDirectory, platformAdapter, selfLaunchSpec } = {}) {
  const root = runtimeDirectory || path.join(os.homedir(), ".tianyuan-workbench", "native-helper");
  const statePath = path.join(root, ARCHIVE_STATE_FILE);
  const configPath = path.join(root, ARCHIVE_CONFIG_FILE);
  const conversationService = createFileArchiveConversationService({
    runtimeDirectory: root,
    homeDir: os.homedir(),
    platform: platformAdapter?.platform || process.platform,
  });

  function status() {
    const stored = readJson(statePath, baseState(readJson(configPath, {})));
    const pid = Number(stored.pid || 0);
    return { ...stored, pid: isProcessAlive(pid) ? pid : null, state: isProcessAlive(pid) ? stored.state : (stored.state === "running" ? "stopped" : stored.state) };
  }

  async function detect() {
    const result = detectApplications({ platform: platformAdapter?.platform || process.platform });
    return {
      ...result,
      applications: Object.fromEntries(Object.entries(result.applications).map(([key, app]) => [key, {
        id: app.id,
        name: app.name,
        installed: Boolean(app.installed),
        fileRootCount: Array.isArray(app.fileRoots) ? app.fileRoots.length : 0,
        sourceMatching: app.sourceMatching,
      }])),
    };
  }

  function listConversations(appType = "wechat") {
    return conversationService.list(appType);
  }

  function getConversationBindings(appType = "wechat") {
    return conversationService.getBindings(appType);
  }

  async function inspectActiveConversation() {
    if (typeof platformAdapter?.inspectActiveConversation !== "function") {
      return {
        ok: false,
        available: false,
        reason: "ACCESSIBILITY_CONVERSATION_UNSUPPORTED_PLATFORM",
        security: security(),
      };
    }
    return await platformAdapter.inspectActiveConversation();
  }

  function saveConversationBindings(input = {}) {
    return conversationService.saveBindings(input);
  }

  async function selectOutputDirectory() {
    const result = await platformAdapter.chooseDirectory("选择微信或企业微信文件导出目录");
    const selectedPath = result.paths?.[0] || "";
    return {
      ...result,
      action: "file_archive_output_directory_selected",
      path: selectedPath ? selectedPath.replace(/[\\/]+$/, "") || path.parse(selectedPath).root : "",
      security: security(),
    };
  }

  async function start(config = {}) {
    const merged = { ...readJson(configPath, {}), ...config };
    if (!isAbsolutePath(merged.outputDirectory)) throw new Error("ARCHIVE_OUTPUT_DIRECTORY_REQUIRED");
    const current = status();
    if (current.state === "running" && current.pid) return { ok: true, started: false, state: current, security: security() };
    writeJson(configPath, merged);
    const launch = selfLaunchSpec(["--file-archive-daemon"]);
    const child = require("node:child_process").spawn(launch.command, launch.args, {
      detached: true,
      stdio: "ignore",
      env: { ...launch.env, TIANYUAN_FILE_ARCHIVE_RUNTIME_DIR: root },
    });
    child.unref();
    return { ok: true, started: true, pid: child.pid, state: { ...baseState(merged), state: "starting", pid: child.pid }, security: security() };
  }

  async function stop() {
    const current = status();
    if (!current.pid) return { ok: true, stopped: false, state: current, security: security() };
    const stopped = await platformAdapter.terminateProcess(current.pid);
    return { ok: stopped, stopped, state: { ...current, state: "stopping" }, security: security() };
  }

  async function pause(paused = true) {
    const current = status();
    if (!current.pid) return { ok: false, reason: "FILE_ARCHIVE_NOT_RUNNING", state: current, security: security() };
    writeJson(path.join(root, "file-archive-command.json"), { command: paused ? "pause" : "resume", at: nowIso() });
    return { ok: true, paused: Boolean(paused), state: { ...current, state: paused ? "paused" : "running" }, security: security() };
  }

  async function scan() {
    const current = status();
    if (!current.pid) return { ok: false, reason: "FILE_ARCHIVE_NOT_RUNNING", state: current, security: security() };
    writeJson(path.join(root, "file-archive-command.json"), { command: "scan", at: nowIso() });
    return { ok: true, requested: true, state: current, security: security() };
  }

  async function runDaemon() {
    const config = readJson(configPath, {});
    const daemon = new FileArchiveDaemon({
      runtimeDirectory: root,
      config,
      platform: platformAdapter?.platform || process.platform,
      conversationService,
    });
    try {
      await daemon.start({ daemon: true });
    } catch (error) {
      daemon.state.state = "failed";
      daemon.state.lastError = error?.message || String(error);
      daemon.writeState();
      process.exitCode = 1;
    }
  }

  return {
    detect,
    listConversations,
    getConversationBindings,
    inspectActiveConversation,
    saveConversationBindings,
    selectOutputDirectory,
    start,
    stop,
    pause,
    scan,
    status,
    runDaemon,
    FileArchiveDaemon,
  };
}

module.exports = {
  ARCHIVE_CONFIG_FILE,
  ARCHIVE_STATE_FILE,
  FileArchiveDaemon,
  collectFiles,
  detectApplications,
  sha256,
  waitForStableFile,
  createFileArchiveService,
  createFileArchiveConversationService,
};
