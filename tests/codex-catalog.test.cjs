"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { filterRetainedCatalog, readCodexCatalog } = require("../native-helper/codex_catalog.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-codex-catalog-"));
const projectPath = path.join(root, "project-one");
const secondProjectPath = path.join(root, "project-two");
const codexHome = path.join(root, "codex");
const projectsPath = path.join(root, "projects.local.json");
const threadsPath = path.join(root, "threads.local.json");
const statePath = path.join(root, "codex-global-state.json");
const processesPath = path.join(root, "chat_processes.json");

fs.mkdirSync(projectPath, { recursive: true });
fs.mkdirSync(secondProjectPath, { recursive: true });
fs.mkdirSync(path.join(codexHome, "sessions"), { recursive: true });
fs.writeFileSync(projectsPath, JSON.stringify({
  projects: [{
    projectId: projectPath,
    projectName: "统一目录项目",
    projectPath,
    status: "active",
  }],
}));
fs.writeFileSync(threadsPath, JSON.stringify({
  threads: [{
    threadId: "thread-registry",
    title: "注册表对话",
    projectId: projectPath,
    projectName: "统一目录项目",
    projectPath,
    status: "active",
    updatedAt: 10,
  }],
}));
fs.writeFileSync(statePath, JSON.stringify({
  "local-projects": {
    secondProjectPath: {
      projectId: secondProjectPath,
      projectName: "全局状态项目",
      projectPath: secondProjectPath,
    },
  },
  "thread-project-assignments": {
    "thread-state": {
      projectId: secondProjectPath,
      cwd: secondProjectPath,
      title: "全局状态对话",
      updatedAt: 20,
    },
  },
}));
fs.writeFileSync(processesPath, JSON.stringify([{
  cwd: projectPath,
  conversationId: "thread-process",
  title: "进程对话",
  updatedAtMs: 30,
}]));

const catalog = readCodexCatalog({
  codexHome,
  projectsPath,
  threadsPath,
  codexStatePath: statePath,
  processesPath,
  sqlitePath: path.join(root, "missing.db"),
});

assert.equal(catalog.source, "shared-codex-catalog");
assert.equal(catalog.projects.length, 2);
assert.equal(catalog.threads.length, 3);
assert.equal(catalog.projects.some((project) => project.projectName === "统一目录项目"), true);
assert.equal(catalog.threads.some((thread) => thread.threadId === "thread-registry"), true);
assert.equal(catalog.threads.some((thread) => thread.threadId === "thread-state"), true);
assert.equal(catalog.threads.some((thread) => thread.threadId === "thread-process"), true);
assert.equal(Object.hasOwn(catalog.threads[0], "content"), false);
assert.equal(catalog.diagnostics.sources.some((item) => item.source === "office-connector-registry"), true);

const retained = filterRetainedCatalog(catalog, { projectsPath, threadsPath });
assert.equal(retained.source, "connector-suite-registry");
assert.equal(retained.projects.length, 1);
assert.equal(retained.threads.length, 1);
assert.equal(retained.projects[0].projectName, "统一目录项目");
assert.equal(retained.threads[0].title, "注册表对话");

const sidebarCatalog = filterRetainedCatalog({
  source: "connector-platform",
  projects: [
    { projectId: "project-b", projectName: "后置项目", projectPath: secondProjectPath, status: "active", catalogOrder: 1 },
    { projectId: "project-a", projectName: "当前项目", projectPath, status: "active", catalogOrder: 0 },
    { projectId: "project-archived", projectName: "归档项目", projectPath: root, status: "archived", catalogOrder: 2 },
  ],
  threads: [
    { threadId: "thread-a", title: "Codex 重命名对话", projectId: "project-a", status: "active", archived: false },
    { threadId: "thread-removed", title: "已移除", projectId: "project-a", status: "active", archived: true },
  ],
});
assert.equal(sidebarCatalog.source, "codex-sidebar-catalog");
assert.deepEqual(sidebarCatalog.projects.map((project) => project.projectName), ["当前项目", "后置项目"]);
assert.equal(sidebarCatalog.threads.length, 1);
assert.equal(sidebarCatalog.threads[0].title, "Codex 重命名对话");

console.log(JSON.stringify({
  ok: true,
  checks: [
    "office_connector_registry_projects",
    "office_connector_thread_registry",
    "codex_global_state_fallback",
    "codex_process_metadata",
    "retained_registry_filter",
    "renamed_title_precedence",
    "codex_sidebar_order_and_names",
    "archived_thread_filter",
    "metadata_only_catalog",
  ],
}, null, 2));
