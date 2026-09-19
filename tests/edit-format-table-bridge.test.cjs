"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createBridge } = require("../native-helper/connector_bridge.js");

const browserHeaders = {
  origin: "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc",
  "content-type": "application/json",
  "x-tianyuan-extension-id": "lkflndcnklpeaejohaacoaolnmhgigoc",
};
const agentHeaders = {
  "content-type": "application/json",
  "x-tianyuan-agent-provider": "codex",
  "x-tianyuan-agent-installation": "codex-format-install",
  "x-tianyuan-agent-credential": "codex-format-secret",
};

test("Bridge routes format and table actions through the same binding gates", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-format-table-"));
  const credentialsPath = path.join(root, "credentials.json");
  const bindingsPath = path.join(root, "bindings.json");
  const sourcesPath = path.join(root, "sources.json");
  const compatibilityPath = path.join(root, "compatibility.json");
  fs.writeFileSync(credentialsPath, JSON.stringify({ secrets: { codex: "codex-format-secret" } }));
  fs.writeFileSync(sourcesPath, JSON.stringify({ sources: [{ agentId: "codex-format-agent", providerId: "codex", displayName: "Codex", installationId: "codex-format-install", credentialRef: `file:${credentialsPath}#codex` }] }));
  fs.writeFileSync(bindingsPath, JSON.stringify({ bindings: [] }));
  fs.writeFileSync(compatibilityPath, JSON.stringify({}));
  const bridge = createBridge({ bindingsPath, sourcesPath, compatibilityPath });
  const port = 43800 + Math.floor(Math.random() * 200);
  const server = await bridge.start(port);
  async function request(method, pathname, payload, headers) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
    return { status: response.status, payload: await response.json() };
  }
  async function completeAction(bindingId, actionId) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const next = await request("GET", `/api/sessions/format-table-session/actions/next?bindingId=${bindingId}`, undefined, browserHeaders);
      if (!next.payload.action) break;
      const action = next.payload.action;
      const completed = await request("POST", `/api/sessions/format-table-session/actions/${action.actionId}/result`, { bindingId, controlEpoch: action.controlEpoch, result: { ok: true } }, browserHeaders);
      assert.equal(completed.status, 200);
      if (action.actionId === actionId) return;
    }
    throw new Error(`action was not completed: ${actionId}`);
  }
  try {
    await request("POST", "/api/sessions/register", {
      sessionId: "format-table-session",
      binding: { projectId: "page-project", companyId: "page-company", pageType: "tianyuan-page", tabId: 21 },
      context: { route: { isTianyuanOperationRoute: true, projectId: "page-project" }, editingBlock: { available: true, valid: true, blockId: "dom:format-table-block", tabId: 21, editable: true, originalText: "原文", currentText: "原文", currentHash: "fnv1a32-12345678", contentHash: "fnv1a32-12345678" } },
    }, browserHeaders);
    const binding = await request("POST", "/api/sessions/format-table-session/agent-bindings", { providerId: "codex", installationId: "codex-format-install", workspaceId: "workspace-format", conversationId: "conversation-format", scope: "conversation", accessMode: "control" }, browserHeaders);
    assert.equal(binding.status, 200);
    const bindingId = binding.payload.binding.bindingId;
    const common = { sessionId: "format-table-session", bindingId, projectId: "page-project", threadId: "conversation-format", tabId: 21, blockId: "dom:format-table-block" };
    const formatPreview = await request("POST", "/api/sessions/format-table-session/actions", { ...common, action: "edit_block_format_preview", expectedText: "原文", format: { lineHeightPx: 28, indentPx: 24, fontWeight: "bold" } }, agentHeaders);
    assert.equal(formatPreview.status, 200);
    assert.deepEqual(formatPreview.payload.action.target.format, { lineHeightPx: 28, indentPx: 24, fontWeight: "bold" });
    await completeAction(bindingId, formatPreview.payload.action.actionId);
    const highlightPreview = await request("POST", "/api/sessions/format-table-session/actions", { ...common, action: "edit_block_format_preview", expectedText: "原文", format: { highlightColor: "none" } }, agentHeaders);
    assert.equal(highlightPreview.status, 200);
    assert.deepEqual(highlightPreview.payload.action.target.format, { highlightColor: "transparent" });
    await completeAction(bindingId, highlightPreview.payload.action.actionId);
    const insertPreview = await request("POST", "/api/sessions/format-table-session/actions", { ...common, action: "table_preview", tableAction: "insert", rowCount: 2, columnCount: 2, cells: [["A", "B"], ["C", "D"]] }, agentHeaders);
    assert.equal(insertPreview.status, 200);
    assert.equal(insertPreview.payload.action.target.tableAction, "insert");
    assert.deepEqual(insertPreview.payload.action.target.cells, [["A", "B"], ["C", "D"]]);
    await completeAction(bindingId, insertPreview.payload.action.actionId);
    const caretReference = { mode: "caret", baseId: "dom:format-table-block", blockId: "dom-caret:dom:format-table-block:fnv1a3200000000", containerPath: "div:1", domPath: "node:1/text:0", textOffset: 2 };
    const caretCommon = { ...common, blockId: caretReference.blockId, expectedHash: "fnv1a32-abcdef12", caretReference };
    const caretPreview = await request("POST", "/api/sessions/format-table-session/actions", { ...caretCommon, action: "table_preview", tableAction: "insert", rowCount: 1, columnCount: 1, cells: [["caret"]] }, agentHeaders);
    assert.equal(caretPreview.status, 200);
    assert.equal(caretPreview.payload.action.target.expectedHash, "fnv1a32-abcdef12");
    assert.deepEqual(caretPreview.payload.action.target.caretReference, caretReference);
    await completeAction(bindingId, caretPreview.payload.action.actionId);
    const caretExecute = await request("POST", "/api/sessions/format-table-session/actions", { ...caretCommon, action: "table_execute", tableAction: "insert", rowCount: 1, columnCount: 1, cells: [["caret"]], previewActionId: caretPreview.payload.action.actionId, confirmText: "确认执行表格操作" }, agentHeaders);
    assert.equal(caretExecute.status, 200);
    await completeAction(bindingId, caretExecute.payload.action.actionId);
    const tablePreview = await request("POST", "/api/sessions/format-table-session/actions", { ...common, action: "table_preview", tableAction: "update_cell", tableId: "table:existing", expectedTableHash: "fnv1a32-12345678", rowIndex: 0, columnIndex: 1, cellText: "新值" }, agentHeaders);
    assert.equal(tablePreview.status, 200);
    await completeAction(bindingId, tablePreview.payload.action.actionId);
    const mismatch = await request("POST", "/api/sessions/format-table-session/actions", { ...common, action: "table_execute", tableAction: "update_cell", tableId: "table:existing", expectedTableHash: "fnv1a32-12345678", rowIndex: 0, columnIndex: 1, cellText: "另一值", previewActionId: tablePreview.payload.action.actionId, confirmText: "确认执行表格操作" }, agentHeaders);
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.payload.reason, "TABLE_PREVIEW_MISMATCH");
    const invalidFormat = await request("POST", "/api/sessions/format-table-session/actions", { ...common, action: "edit_block_format_preview", expectedText: "原文", format: { backgroundImage: "url(x)" } }, agentHeaders);
    assert.equal(invalidFormat.status, 400);
    assert.equal(invalidFormat.payload.reason, "EDIT_BLOCK_FORMAT_FIELD_NOT_ALLOWED");
    const invalidHighlight = await request("POST", "/api/sessions/format-table-session/actions", { ...common, action: "edit_block_format_preview", expectedText: "原文", format: { highlightColor: "yellow" } }, agentHeaders);
    assert.equal(invalidHighlight.status, 400);
    assert.equal(invalidHighlight.payload.reason, "EDIT_BLOCK_FORMAT_HIGHLIGHT_COLOR_INVALID");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
