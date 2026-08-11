"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function normalizePath(value) {
  return String(value || "").trim().replace(/[\\/]+$/, "");
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isRetainedStatus(value) {
  return !new Set(["archived", "deleted", "removed", "inactive", "closed", "purged", "missing"]).has(
    String(value || "active").trim().toLowerCase(),
  );
}

function registryPaths(options = {}) {
  const home = options.home || os.homedir();
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(home, ".codex");
  return {
    codexHome,
    projectsPath: options.projectsPath
      || process.env.OFFICE_CONNECTOR_PROJECTS
      || path.join(home, ".local", "share", "office-connector", "runtime", "config", "projects.local.json"),
    threadsPath: options.threadsPath
      || process.env.OFFICE_CONNECTOR_THREADS
      || path.join(home, ".local", "share", "office-connector", "runtime", "config", "threads.local.json"),
  };
}

function readConnectorSuiteRegistry(options = {}) {
  const { projectsPath, threadsPath } = registryPaths(options);
  const projectsPayload = readJson(projectsPath, {});
  const threadsPayload = readJson(threadsPath, {});
  const projects = (Array.isArray(projectsPayload?.projects) ? projectsPayload.projects : [])
    .filter((project) => isRetainedStatus(project?.status))
    .map((project) => ({
      projectId: String(project.projectId || project.projectPath || project.path || "").trim(),
      projectName: String(project.projectName || project.label || project.projectId || "").trim(),
      projectPath: normalizePath(project.projectPath || project.path || ""),
      path: normalizePath(project.projectPath || project.path || ""),
      status: "active",
      source: "connector-suite-registry",
      updatedAt: Number(project.updatedAt || project.lastActiveMs || 0) || null,
    }))
    .filter((project) => project.projectId && project.projectPath);
  const projectsById = new Map(projects.map((project) => [project.projectId, project]));
  const projectsByPath = new Map(projects.map((project) => [project.projectPath, project]));
  const threads = (Array.isArray(threadsPayload?.threads) ? threadsPayload.threads : [])
    .filter((thread) => isRetainedStatus(thread?.status))
    .map((thread) => {
      const project = projectsById.get(String(thread.projectId || "").trim())
        || projectsByPath.get(normalizePath(thread.projectPath || thread.cwd || ""));
      const projectPath = normalizePath(thread.projectPath || thread.cwd || project?.projectPath);
      return {
        threadId: String(thread.threadId || thread.id || "").trim(),
        title: String(thread.title || thread.threadTitle || thread.preview || "").trim(),
        projectId: String(thread.projectId || project?.projectId || projectPath).trim(),
        projectName: String(thread.projectName || project?.projectName || "").trim(),
        projectPath,
        cwd: projectPath,
        status: "active",
        updatedAt: Number(thread.updatedAt || thread.lastActiveMs || 0) || null,
        source: "connector-suite-registry",
      };
    })
    .filter((thread) => thread.threadId && thread.projectPath);
  return {
    projects,
    threads,
    available: projects.length > 0 || threads.length > 0,
    paths: { projectsPath, threadsPath },
  };
}

function filterRetainedCatalog(catalog, options = {}) {
  if (catalog.source === "connector-platform") {
    const projects = (catalog.projects || [])
      .filter((project) => isRetainedStatus(project?.status) && project?.archived !== true)
      .map((project, index) => ({ ...project, __catalogIndex: index }))
      .sort((left, right) => Number(left.catalogOrder ?? 999999) - Number(right.catalogOrder ?? 999999)
        || left.__catalogIndex - right.__catalogIndex)
      .map(({ __catalogIndex, ...project }) => project);
    const projectIds = new Set(projects.map((project) => String(project.projectId || "")));
    const projectPaths = new Set(projects.map((project) => normalizePath(project.projectPath || project.path)));
    const threads = (catalog.threads || []).filter((thread) =>
      isRetainedStatus(thread?.status)
      && thread?.archived !== true
      && (projectIds.has(String(thread.projectId || ""))
        || projectPaths.has(normalizePath(thread.projectPath || thread.cwd))),
    );
    return {
      ...catalog,
      source: "codex-sidebar-catalog",
      projects,
      threads,
      diagnostics: {
        ...(catalog.diagnostics || {}),
        retainedSource: "connector-platform",
        filteredOutProjects: Math.max(0, (catalog.projects || []).length - projects.length),
        filteredOutThreads: Math.max(0, (catalog.threads || []).length - threads.length),
      },
    };
  }
  const registry = readConnectorSuiteRegistry(options);
  if (registry.available) {
    return {
      ...catalog,
      projects: registry.projects,
      threads: registry.threads,
      source: "connector-suite-registry",
      diagnostics: {
        ...(catalog.diagnostics || {}),
        retainedSource: registry.paths,
        filteredOutProjects: Math.max(0, (catalog.projects || []).length - registry.projects.length),
        filteredOutThreads: Math.max(0, (catalog.threads || []).length - registry.threads.length),
      },
    };
  }
  const projects = (catalog.projects || []).filter((project) => isRetainedStatus(project?.status));
  const threads = (catalog.threads || []).filter((thread) => isRetainedStatus(thread?.status));
  return { ...catalog, projects, threads };
}

function shouldSkipProjectPath(projectPath, codexHome) {
  if (!projectPath || !projectPath.startsWith("/")) return true;
  if (projectPath === "/tmp" || projectPath === "/private/tmp") return true;
  if (projectPath === os.homedir()) return true;
  if (codexHome && (projectPath === codexHome
    || projectPath.startsWith(`${codexHome}/sessions`)
    || projectPath.startsWith(`${codexHome}/archived_sessions`))) return true;
  return false;
}

function parseTsv(output) {
  return String(output || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

function readSqliteRows(dbPath, sql, diagnostics, source) {
  if (!isFile(dbPath)) return [];
  try {
    const output = execFileSync("sqlite3", [
      "-readonly",
      "-batch",
      "-separator",
      "\t",
      dbPath,
      sql,
    ], {
      encoding: "utf8",
      timeout: 3000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return parseTsv(output);
  } catch (cause) {
    diagnostics.warnings.push({
      source,
      code: "CODEX_SQLITE_READ_FAILED",
      path: dbPath,
      message: cause.message,
    });
    return [];
  }
}

function collectJsonlFiles(directory, limit = 120) {
  const files = [];
  function walk(current) {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const itemPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(itemPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        try {
          files.push({ path: itemPath, mtimeMs: fs.statSync(itemPath).mtimeMs });
        } catch {
          // Ignore files that disappear while scanning.
        }
      }
    }
  }
  walk(directory);
  return files.sort((left, right) => right.mtimeMs - left.mtimeMs).slice(0, limit);
}

function readCodexCatalog(options = {}) {
  const home = options.home || os.homedir();
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(home, ".codex");
  const projectsPath = options.projectsPath
    || process.env.OFFICE_CONNECTOR_PROJECTS
    || path.join(home, ".local", "share", "office-connector", "runtime", "config", "projects.local.json");
  const threadsPath = options.threadsPath
    || process.env.OFFICE_CONNECTOR_THREADS
    || path.join(home, ".local", "share", "office-connector", "runtime", "config", "threads.local.json");
  const statePath = options.codexStatePath
    || process.env.TIANYUAN_CODEX_GLOBAL_STATE_PATH
    || path.join(codexHome, ".codex-global-state.json");
  const sqlitePath = options.sqlitePath || path.join(codexHome, "sqlite", "codex-dev.db");
  const diagnostics = {
    projectsPath,
    threadsPath,
    codexHome,
    sources: [],
    warnings: [],
  };
  const projects = new Map();
  const projectPaths = new Map();
  const threads = new Map();

  function addProject(input = {}, source = "codex-local") {
    const projectPath = normalizePath(input.projectPath || input.path || input.cwd || input.rootPaths?.[0]);
    const projectId = String(input.projectId || input.id || projectPath).trim();
    if (!projectId || shouldSkipProjectPath(projectPath, codexHome)) return null;
    const key = projectPath || projectId;
    const previous = projects.get(key) || (projectPath ? projects.get(projectPath) : null);
    const explicitName = String(input.projectName || input.name || input.label || "").trim();
    const projectName = explicitName || String(previous?.projectName || path.basename(projectPath) || projectId).trim();
    const project = {
      projectId: previous?.projectId || projectId,
      projectName: projectName || previous?.projectName || projectId,
      projectPath: projectPath || previous?.projectPath || "",
      path: projectPath || previous?.projectPath || "",
      threadId: String(input.threadId || previous?.threadId || ""),
      status: String(input.status || previous?.status || "active"),
      updatedAt: Number(input.updatedAt || input.lastActiveMs || previous?.updatedAt || 0) || null,
      source,
    };
    projects.set(key, project);
    if (projectPath) projectPaths.set(projectPath, project);
    return project;
  }

  function findProject(input = {}) {
    const projectId = String(input.projectId || "").trim();
    const projectPath = normalizePath(input.projectPath || input.path || input.cwd);
    return (projectPath && projectPaths.get(projectPath))
      || [...projects.values()].find((item) => item.projectId === projectId)
      || null;
  }

  function addThread(input = {}, source = "codex-local", updatedAt = null) {
    const threadId = String(input.threadId || input.id || input.session_id || "").trim();
    const projectPath = normalizePath(input.projectPath || input.path || input.cwd);
    if (!threadId || shouldSkipProjectPath(projectPath, codexHome)) return;
    const project = findProject({ projectId: input.projectId, projectPath });
    const next = {
      threadId,
      title: String(input.title || input.threadTitle || input.display_title || `Codex 对话 ${threadId.slice(0, 8)}`).trim(),
      projectId: String(input.projectId || project?.projectId || projectPath).trim(),
      projectName: String(input.projectName || project?.projectName || path.basename(projectPath) || input.projectId || "").trim(),
      projectPath: projectPath || project?.projectPath || "",
      cwd: projectPath || project?.projectPath || "",
      status: String(input.status || "active"),
      updatedAt: Number(input.updatedAt || updatedAt || 0) || null,
      source,
    };
    const previous = threads.get(threadId);
    if (!previous || Number(next.updatedAt || 0) >= Number(previous.updatedAt || 0)) {
      threads.set(threadId, { ...previous, ...next });
    }
  }

  const projectRegistry = readJson(projectsPath, {});
  for (const project of Array.isArray(projectRegistry?.projects) ? projectRegistry.projects : []) {
    addProject(project, "office-connector-registry");
    if (project.threadId) addThread({ ...project, threadId: project.threadId }, "office-connector-registry", project.updatedAt || project.lastActiveMs);
  }
  diagnostics.sources.push({
    source: "office-connector-registry",
    path: projectsPath,
    projectCount: Array.isArray(projectRegistry?.projects) ? projectRegistry.projects.length : 0,
  });

  const threadRegistry = readJson(threadsPath, {});
  for (const thread of Array.isArray(threadRegistry?.threads) ? threadRegistry.threads : []) {
    const project = addProject(thread, "office-connector-thread-registry");
    addThread({ ...thread, projectId: thread.projectId || project?.projectId }, "office-connector-thread-registry", thread.updatedAt);
  }
  diagnostics.sources.push({
    source: "office-connector-thread-registry",
    path: threadsPath,
    threadCount: Array.isArray(threadRegistry?.threads) ? threadRegistry.threads.length : 0,
  });

  const sqliteRows = readSqliteRows(
    sqlitePath,
    "SELECT cwd, display_title, thread_id, source_updated_at FROM local_thread_catalog WHERE cwd != '' ORDER BY source_updated_at DESC LIMIT 500;",
    diagnostics,
    "codex-sqlite-catalog",
  );
  for (const [projectPath, title, threadId, updatedAt] of sqliteRows) {
    const project = addProject({ projectPath, threadId, updatedAt }, "codex-sqlite-catalog");
    addThread({ projectPath, projectId: project?.projectId, title, threadId }, "codex-sqlite-catalog", updatedAt);
  }
  if (isFile(sqlitePath)) {
    diagnostics.sources.push({
      source: "codex-sqlite-catalog",
      path: sqlitePath,
      scannedItems: sqliteRows.length,
    });
  }

  const state = readJson(statePath, {});
  for (const project of Object.values(state?.["local-projects"] || {})) {
    addProject(project, "codex-global-state");
  }
  for (const [threadId, assignment] of Object.entries(state?.["thread-project-assignments"] || {})) {
    const project = addProject({
      projectId: assignment?.projectId,
      projectPath: assignment?.cwd || assignment?.path,
      projectName: assignment?.projectName,
    }, "codex-global-state");
    addThread({
      ...assignment,
      threadId,
      projectId: assignment?.projectId || project?.projectId,
      projectPath: assignment?.cwd || assignment?.path || project?.projectPath,
    }, "codex-global-state", assignment?.updatedAt);
  }
  if (isFile(statePath)) {
    diagnostics.sources.push({ source: "codex-global-state", path: statePath });
  }

  const processPath = options.processesPath || path.join(codexHome, "process_manager", "chat_processes.json");
  const processes = readJson(processPath, []);
  for (const processInfo of Array.isArray(processes) ? processes : []) {
    const project = addProject({
      projectPath: processInfo.cwd,
      threadId: processInfo.conversationId,
      updatedAt: processInfo.updatedAtMs || processInfo.startedAtMs,
    }, "codex-process");
    if (processInfo.conversationId) {
      addThread({
        threadId: processInfo.conversationId,
        projectId: project?.projectId,
        projectPath: processInfo.cwd,
        title: processInfo.title || processInfo.threadTitle,
        status: processInfo.status,
      }, "codex-process", processInfo.updatedAtMs || processInfo.startedAtMs);
    }
  }
  if (isFile(processPath)) diagnostics.sources.push({ source: "codex-processes", path: processPath, scannedItems: Array.isArray(processes) ? processes.length : 0 });

  let scannedSessionFiles = 0;
  for (const file of collectJsonlFiles(path.join(codexHome, "sessions"))) {
    let raw = "";
    try {
      raw = fs.readFileSync(file.path, "utf8");
    } catch {
      continue;
    }
    scannedSessionFiles += 1;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.includes('"session_id"') && !line.includes('"cwd"') && !line.includes('"workspace_roots"')) continue;
      try {
        const item = JSON.parse(line);
        if (item?.type !== "session_meta" && item?.type !== "turn_context") continue;
        const payload = item.payload || {};
        const threadId = payload.session_id || payload.id;
        const roots = Array.isArray(payload.workspace_roots) && payload.workspace_roots.length
          ? payload.workspace_roots
          : [payload.cwd];
        for (const projectPath of roots) {
          const project = addProject({ projectPath, threadId }, "codex-session", file.mtimeMs);
          addThread({ ...payload, threadId, projectId: project?.projectId, projectPath }, "codex-session", file.mtimeMs);
        }
      } catch {
        // Ignore malformed historical session metadata.
      }
    }
  }
  if (isDirectory(path.join(codexHome, "sessions"))) diagnostics.sources.push({ source: "codex-sessions", path: path.join(codexHome, "sessions"), scannedFiles: scannedSessionFiles });

  return {
    projects: [...projects.values()]
      .filter((project) => project.projectPath && isDirectory(project.projectPath))
      .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
        || String(left.projectName).localeCompare(String(right.projectName), "zh-CN")),
    threads: [...threads.values()]
      .filter((thread) => thread.projectPath && isDirectory(thread.projectPath))
      .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0)),
    updatedAt: new Date().toISOString(),
    source: "shared-codex-catalog",
    diagnostics: {
      ...diagnostics,
      projectCount: projects.size,
      threadCount: threads.size,
    },
  };
}

module.exports = { filterRetainedCatalog, readCodexCatalog, readConnectorSuiteRegistry };
