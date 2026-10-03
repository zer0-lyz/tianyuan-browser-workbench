"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBridge } = require("../native-helper/connector_bridge.js");
const { promisify } = require("node:util");
const execFileAsync = promisify(execFile);

const extensionOrigin = "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-zcode-catalog-"));
const port = 43000 + Math.floor(Math.random() * 1000);
const bindingsPath = path.join(root, "connector-bindings.json");
const sourcesPath = path.join(root, "agent-sources.json");
const compatibilityPath = path.join(root, "runtime-compat.json");
const zcodeDbPath = path.join(root, "zcode.db");
const projectA = "/tmp/zcode-project-a";
const projectB = "/tmp/zcode-project-b";

fs.writeFileSync(sourcesPath, JSON.stringify({
  version: 1,
  sources: [
    { agentId: "codex", providerId: "codex", displayName: "Codex", installationId: "codex-test", credentialRef: "extension-bound", manual: false },
  ],
}));
fs.writeFileSync(bindingsPath, JSON.stringify({ version: 1, bindings: [] }));
fs.writeFileSync(compatibilityPath, JSON.stringify({
  version: 2,
  extensionVersion: "0.7.3",
  bridgeProtocol: "connector-agent-binding-v3",
  buildId: "test-build",
  runtimeBuildId: "runtime-build-test",
}));

function browserHeaders() {
  return {
    Origin: extensionOrigin,
    "content-type": "application/json",
    "x-tianyuan-extension-id": "lkflndcnklpeaejohaacoaolnmhgigoc",
    "x-tianyuan-extension-version": "0.7.3",
    "x-tianyuan-runtime-build-id": "runtime-build-test",
  };
}

async function request(pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { headers: browserHeaders() });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function main() {
  const stagedDbPath = path.join(root, "zcode-staged.db");
  await execFileAsync("sqlite3", [stagedDbPath, [
    "CREATE TABLE session (id TEXT, project_id TEXT, workspace_id TEXT, parent_id TEXT, slug TEXT, directory TEXT, path TEXT, title TEXT, version TEXT, share_url TEXT, summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER, summary_diffs TEXT, revert TEXT, permission TEXT, time_created INTEGER, time_updated INTEGER, time_compacting INTEGER, time_archived INTEGER, task_type TEXT, title_source TEXT, title_message_id TEXT, time_title_updated INTEGER, trace_id TEXT);",
    `INSERT INTO session (id, project_id, directory, path, title, time_created, time_updated, task_type) VALUES ('sess-a2', 'proj-a', '${projectA}', '${projectA}', 'Zcode 对话二', 1000, 3000, 'interactive');`,
    `INSERT INTO session (id, project_id, directory, path, title, time_created, time_updated, task_type) VALUES ('sess-a1', 'proj-a', '${projectA}', '${projectA}', 'Zcode 对话一', 1000, 2000, 'interactive');`,
    `INSERT INTO session (id, project_id, directory, path, title, time_created, time_updated, task_type, time_archived) VALUES ('sess-b1', 'proj-b', '${projectB}', '${projectB}', '已归档对话', 1000, 4000, 'interactive', 1);`,
    `INSERT INTO session (id, project_id, directory, path, title, time_created, time_updated, task_type, parent_id) VALUES ('sess-child', 'proj-a', '${projectA}', '${projectA}', '子代理对话', 1000, 5000, 'interactive', 'sess-a1');`,
  ].join(" ")]);

  const bridge = createBridge({ bindingsPath, sourcesPath, compatibilityPath, zcodeDbPath });
  const server = await bridge.start(port);
  try {
    const missing = await request("/api/catalog?providerId=zcode");
    assert.equal(missing.status, 503);
    assert.equal(missing.payload.reason, "ZCODE_CATALOG_UNAVAILABLE");

    fs.renameSync(stagedDbPath, zcodeDbPath);
    const catalog = await request("/api/catalog?providerId=zcode");
    assert.equal(catalog.status, 200);
    assert.equal(catalog.payload.ok, true);
    assert.equal(catalog.payload.providerId, "zcode");
    assert.equal(catalog.payload.source, "zcode-local-db");
    assert.equal(catalog.payload.projects.length, 1);
    assert.equal(catalog.payload.threads.length, 2);

    const project = catalog.payload.projects[0];
    assert.equal(project.projectId, "proj-a");
    assert.equal(project.projectName, "zcode-project-a");
    assert.equal(project.projectPath, projectA);
    assert.equal(project.updatedAt, 3000);

    assert.equal(catalog.payload.threads[0].threadId, "sess-a2");
    assert.equal(catalog.payload.threads[0].title, "Zcode 对话二");
    assert.equal(catalog.payload.threads[0].projectId, "proj-a");
    assert.equal(catalog.payload.threads[0].projectName, "zcode-project-a");
    assert.equal(catalog.payload.threads[0].projectPath, projectA);
    assert.equal(catalog.payload.threads[0].recencyAt, 3);
    assert.equal(catalog.payload.threads[1].threadId, "sess-a1");
    assert.equal(catalog.payload.threads.some((thread) => thread.threadId === "sess-b1"), false);
    assert.equal(catalog.payload.threads.some((thread) => thread.threadId === "sess-child"), false);

    const unsupported = await request("/api/catalog?providerId=unknown-agent");
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.payload.reason, "AGENT_PROVIDER_UNSUPPORTED");

    const codexDefault = await request("/api/catalog");
    assert.equal(codexDefault.status, 200);
    assert.equal(codexDefault.payload.providerId, "codex");
    console.log("zcode-catalog.test.cjs: all assertions passed");
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
