"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { markReportPending, hasReportPending } = require("../native-helper/report-pending.js");
const { saveReportTreeSnapshot } = require("../native-helper/report-snapshot.js");
const {
  stageReportStructurePending,
  readReportStructureStage,
  readCurrentReportStructureStage,
  readCurrentReportStructurePartialStage,
  claimReportStructureReload,
  recordReportStructureReloadRequested,
  archiveReportStructureAfterReloadReadback,
  archiveReportStructurePartialAfterReadback,
} = require("../native-helper/report-structure-pending.js");

const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
const owner = { sessionId: "session", sessionEpoch: "epoch", bindingId: "binding", controlEpoch: "control", tabId: 42 };

function fixture(operation, initial) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-structure-pending-"));
  const directory = path.join(root, "pending");
  const snapshotDirectory = path.join(root, "snapshots");
  const nodeRef = operation === "structure_add_child"
    ? { nodePathKey: "0", candidateId: "parent" }
    : operation === "structure_delete"
      ? { nodePathKey: "1/0", candidateId: "anchor" }
      : { nodePathKey: "0", candidateId: "anchor" };
  const scopeRef = operation === "structure_add_child"
    ? { kind: "node", nodePathKey: "0", candidateId: "parent" }
    : operation === "structure_delete"
      ? { kind: "node", nodePathKey: "1", candidateId: "parent", label: "父节点" }
      : { kind: "treeRoot", scopePath: "" };
  const operationIndex = 0;
  const scopePath = scopeRef.scopePath ?? scopeRef.nodePathKey;
  const scopeTarget = scopeRef.kind === "treeRoot" ? null : operation === "structure_add_child"
    ? initial.target : { nodePathKey: scopeRef.nodePathKey, candidateId: scopeRef.candidateId, label: scopeRef.label, expanded: true };
  const treeSnapshot = { complete: true, operationIndex, operationKind: operation, scopePath, scopeRef, scopeTarget, target: initial.target, siblings: initial.siblings };
  const snapshot = saveReportTreeSnapshot({ directory: snapshotDirectory, reportIdentity, nodeRef, operationIndex, operationKind: operation, treeSnapshot });
  const actionId = "action_structure";
  markReportPending({ directory, reportIdentity, actionId, action: "report_execute" });
  const args = {
    directory, reportIdentity, actionId, operation, nodeRef, scopeRef, snapshotDirectory, snapshot, operationIndex, owner,
    origin: { documentTimeOrigin: 100, pageOrigin: "https://excel.zhrdc.net" },
    intendedTitle: operation === "structure_delete" ? undefined : "新增节点",
  };
  stageReportStructurePending(args);
  return { root, args, treeSnapshot };
}

function reloadArgs(args) {
  claimReportStructureReload({ ...args, reloadActionId: "action_reload" });
  recordReportStructureReloadRequested({ ...args, reloadActionId: "action_reload", documentTimeOrigin: 100 });
  return { ...args, reloadActionId: "action_reload", origin: { documentTimeOrigin: 200, pageOrigin: "https://excel.zhrdc.net" } };
}

test("child structure is archived only after one claimed reload and full-scope readback", () => {
  const f = fixture("structure_add_child", {
    target: { nodePathKey: "0", candidateId: "parent", label: "父节点", expanded: true },
    siblings: [],
  });
  try {
    const staged = readReportStructureStage(f.args);
    assert.equal(staged.status, "staged");
    assert.equal(readCurrentReportStructureStage({ ...f.args, expectedStatus: "staged" }).actionId, f.args.actionId);
    const reload = reloadArgs(f.args);
    assert.throws(() => claimReportStructureReload({ ...f.args, reloadActionId: "action_reload_again" }), /REPORT_PENDING_VERIFY/);
    const observed = {
      ...f.treeSnapshot,
      operationKind: "structure_scope_read",
      scopeRef: f.args.scopeRef,
      siblings: [{ nodePathKey: "0/0", candidateId: "new-child", label: "新增节点", expanded: true, children: [] }],
    };
    const result = archiveReportStructureAfterReloadReadback({ ...reload, observedTreeSnapshot: observed });
    assert.deepEqual({ structureStatus: result.structureStatus, titlePending: result.titlePending, operationComplete: result.operationComplete, actionComplete: result.actionComplete },
      { structureStatus: "saved", titlePending: false, operationComplete: true, actionComplete: true });
    assert.equal(hasReportPending(f.args.directory, reportIdentity), false);
    const archive = JSON.parse(fs.readFileSync(path.join(f.args.directory, "resolved", result.archiveId + ".json"), "utf8"));
    assert.equal(archive.actionId, f.args.actionId);
    assert.equal(archive.structureStage.status, "reloadRequested");
    assert.equal(archive.resolution.structureStatus, "saved");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("sibling structure requires a fresh complete sibling scope and reports title pending separately", () => {
  const anchor = { nodePathKey: "0", candidateId: "anchor", label: "锚点", expanded: false };
  const f = fixture("structure_add_sibling", {
    target: anchor,
    siblings: [ { ...anchor, children: [] }, { nodePathKey: "1", candidateId: "next", label: "后续", expanded: false, children: [
      { nodePathKey: "1/0", candidateId: "next-child", label: "后续子项", expanded: false, children: [] },
    ] } ],
  });
  try {
    const reload = reloadArgs(f.args);
    const incomplete = { complete: false, ...f.treeSnapshot, operationKind: "structure_scope_read", target: null, scopeRef: f.args.scopeRef };
    assert.throws(() => archiveReportStructureAfterReloadReadback({ ...reload, observedTreeSnapshot: incomplete }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.equal(hasReportPending(f.args.directory, reportIdentity), true);
    const result = archiveReportStructureAfterReloadReadback({
      ...reload,
      observedTreeSnapshot: {
        ...f.treeSnapshot,
        operationKind: "structure_scope_read",
        target: null,
        scopeRef: f.args.scopeRef,
        siblings: [
          { ...anchor, children: [] },
          { nodePathKey: "1", candidateId: "new-sibling", label: "未完成标题", expanded: false, children: [] },
          { nodePathKey: "2", candidateId: "next", label: "后续", expanded: false, children: [
            { nodePathKey: "2/0", candidateId: "next-child", label: "后续子项", expanded: false, children: [] },
          ] },
        ],
      },
    });
    assert.equal(result.structureStatus, "saved");
    assert.equal(result.titlePending, true);
    assert.equal(result.operationComplete, false);
    assert.equal(result.actionComplete, false);
    assert.equal(result.titleWriteAuthorization, undefined);
    assert.equal(hasReportPending(f.args.directory, reportIdentity), true);
    assert.equal(readReportStructureStage(f.args).status, "titlePending");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("delete re-reads the surviving parent scope and preserves every other subtree", () => {
  const target = {
    nodePathKey: "1/0", candidateId: "anchor", label: "待删节点", expanded: false,
    children: [{ nodePathKey: "1/0/0", candidateId: "child", label: "子节点", expanded: false, children: [] }],
  };
  const f = fixture("structure_delete", {
    target,
    siblings: [
      { nodePathKey: "1/0", candidateId: "anchor", label: "待删节点", expanded: false, children: target.children },
      { nodePathKey: "1/1", candidateId: "keep", label: "保留节点", expanded: false, children: [
        { nodePathKey: "1/1/0", candidateId: "keep-child", label: "保留子项", expanded: false, children: [] },
      ] },
    ],
  });
  try {
    const reload = reloadArgs(f.args);
    assert.throws(() => archiveReportStructureAfterReloadReadback({
      ...reload,
      observedTreeSnapshot: {
        complete: true, operationIndex: 0, operationKind: "structure_scope_read", scopePath: "1",
        scopeRef: f.args.scopeRef, target: target, siblings: [{ nodePathKey: "1/0", candidateId: "keep", label: "保留节点", expanded: false, children: [
          { nodePathKey: "1/0/0", candidateId: "keep-child", label: "已改变的子项", expanded: false, children: [] },
        ] }],
      },
    }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.throws(() => archiveReportStructureAfterReloadReadback({
      ...reload,
      observedTreeSnapshot: {
        complete: true, operationIndex: 0, operationKind: "structure_scope_read", scopePath: "1",
        scopeRef: f.args.scopeRef, target: { nodePathKey: "1", candidateId: "parent", label: "父节点", expanded: true },
        siblings: [{ nodePathKey: "1/0", candidateId: "keep", label: "保留节点", expanded: false, children: [
          { nodePathKey: "1/0/0", candidateId: "child", label: "被删节点的子项仍存在", expanded: false, children: [] },
        ] }],
      },
    }), /REPORT_PENDING_READBACK_MISMATCH/);
    const result = archiveReportStructureAfterReloadReadback({
      ...reload,
      observedTreeSnapshot: {
        complete: true, operationIndex: 0, operationKind: "structure_scope_read", scopePath: "1",
        scopeRef: f.args.scopeRef, target: { nodePathKey: "1", candidateId: "parent", label: "父节点", expanded: true },
        siblings: [{ nodePathKey: "1/0", candidateId: "keep", label: "保留节点", expanded: false, children: [
          { nodePathKey: "1/0/0", candidateId: "keep-child", label: "保留子项", expanded: false, children: [] },
        ] }],
      },
    });
    assert.equal(result.structureStatus, "saved");
    assert.equal(result.operationComplete, true);
    assert.equal(hasReportPending(f.args.directory, reportIdentity), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("reload may reset expanded flags while preserving the exact surviving subtree", () => {
  const target = { nodePathKey: "1/0", candidateId: "anchor", label: "待删节点", expanded: true, children: [] };
  const f = fixture("structure_delete", {
    target,
    siblings: [
      { ...target },
      { nodePathKey: "1/1", candidateId: "keep", label: "保留节点", expanded: true, children: [
        { nodePathKey: "1/1/0", candidateId: "keep-child", label: "保留子项", expanded: true, children: [] },
      ] },
    ],
  });
  try {
    const reload = reloadArgs(f.args);
    const refreshed = {
      complete: true, operationIndex: 0, operationKind: "structure_scope_read", scopePath: "1", scopeRef: f.args.scopeRef,
      target: { nodePathKey: "1", candidateId: "parent", label: "父节点", expanded: false },
      siblings: [{ nodePathKey: "1/0", candidateId: "keep", label: "保留节点", expanded: false, children: [
        { nodePathKey: "1/0/0", candidateId: "keep-child", label: "保留子项", expanded: false, children: [] },
      ] }],
    };
    for (const tampered of [
      { ...refreshed, siblings: [{ ...refreshed.siblings[0], candidateId: "changed-id" }] },
      { ...refreshed, siblings: [{ ...refreshed.siblings[0], label: "改名节点" }] },
      { ...refreshed, siblings: [{ ...refreshed.siblings[0], children: [{ ...refreshed.siblings[0].children[0], label: "改动子树" }] }] },
    ]) {
      assert.throws(() => archiveReportStructureAfterReloadReadback({ ...reload, observedTreeSnapshot: tampered }), /REPORT_PENDING_READBACK_MISMATCH/);
    }
    const result = archiveReportStructureAfterReloadReadback({
      ...reload,
      observedTreeSnapshot: refreshed,
    });
    assert.equal(result.structureStatus, "saved");
    assert.equal(hasReportPending(f.args.directory, reportIdentity), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("default placeholder readback is explicitly partial and retains the structure pending lock", () => {
  const f = fixture("structure_add_child", {
    target: { nodePathKey: "0", candidateId: "parent", label: "父节点", expanded: true },
    siblings: [],
  });
  try {
    const reload = reloadArgs(f.args);
    const result = archiveReportStructureAfterReloadReadback({
      ...reload,
      observedTreeSnapshot: {
        ...f.treeSnapshot,
        operationKind: "structure_scope_read",
        scopeRef: f.args.scopeRef,
        siblings: [{ nodePathKey: "0/0", candidateId: "new-child", label: "节点1", expanded: true, children: [] }],
      },
    });
    assert.deepEqual(result.createdNodeRef, { nodePathKey: "0/0", candidateId: "new-child" });
    assert.equal(result.structureStatus, "saved");
    assert.equal(result.titlePending, true);
    assert.equal(result.operationComplete, false);
    assert.equal(result.actionComplete, false);
    assert.equal(result.titleWriteAuthorization, undefined);
    assert.equal(hasReportPending(f.args.directory, reportIdentity), true);
    const activeStage = readReportStructureStage(f.args);
    assert.equal(activeStage.status, "titlePending");
    assert.equal(activeStage.resolution.partial, true);
    assert.equal(activeStage.resolution.titleStatus, "pending-verification");
    assert.equal(activeStage.resolution.partialReadbackEvidence.placeholderLabelVerified, true);
    assert.match(activeStage.resolution.partialReadbackEvidence.observedTreeSha256, /^[a-f0-9]{64}$/);
    assert.throws(() => claimReportStructureReload({ ...f.args, reloadActionId: "action_reload_again" }), /REPORT_PENDING_VERIFY/);
    assert.throws(() => stageReportStructurePending(f.args), /REPORT_PENDING_VERIFY/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("an empty row label alone does not authorize title recovery or release pending", () => {
  const f = fixture("structure_add_child", {
    target: { nodePathKey: "0", candidateId: "parent", label: "父节点", expanded: true },
    siblings: [],
  });
  try {
    const reload = reloadArgs(f.args);
    const result = archiveReportStructureAfterReloadReadback({
      ...reload,
      observedTreeSnapshot: {
        ...f.treeSnapshot,
        operationKind: "structure_scope_read",
        scopeRef: f.args.scopeRef,
        siblings: [{ nodePathKey: "0/0", candidateId: "new-child", label: "", expanded: true, children: [] }],
      },
    });
    assert.equal(result.titlePending, true);
    assert.equal(result.titleWriteAuthorization, undefined);
    assert.equal(readReportStructureStage(f.args).resolution.partialReadbackEvidence.placeholderLabelVerified, false);
    assert.equal(hasReportPending(f.args.directory, reportIdentity), true);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("only exact owner may continue structure readback across a Bridge session epoch", () => {
  const f = fixture("structure_add_child", {
    target: { nodePathKey: "0", candidateId: "parent", label: "父节点", expanded: true },
    siblings: [],
  });
  try {
    const nextEpochOwner = { ...owner, sessionEpoch: "epoch-after-restart" };
    assert.throws(() => readCurrentReportStructureStage({ ...f.args, owner: nextEpochOwner, expectedStatus: "staged" }), /REPORT_PENDING_VERIFY/);
    assert.throws(() => claimReportStructureReload({ ...f.args, owner: nextEpochOwner, reloadActionId: "action_reload" }), /REPORT_PENDING_VERIFY/);
    const reload = reloadArgs(f.args);
    assert.equal(readCurrentReportStructureStage({ ...f.args, owner: nextEpochOwner, expectedStatus: "reloadRequested" }).status, "reloadRequested");
    for (const driftedOwner of [
      { ...nextEpochOwner, sessionId: "different-session" },
      { ...nextEpochOwner, bindingId: "different-binding" },
      { ...nextEpochOwner, controlEpoch: "different-control" },
      { ...nextEpochOwner, tabId: 43 },
    ]) {
      assert.throws(() => readCurrentReportStructureStage({ ...f.args, owner: driftedOwner, expectedStatus: "reloadRequested" }), /REPORT_PENDING_VERIFY/);
    }
    const result = archiveReportStructureAfterReloadReadback({
      ...reload,
      owner: nextEpochOwner,
      observedTreeSnapshot: {
        ...f.treeSnapshot,
        operationKind: "structure_scope_read",
        scopeRef: f.args.scopeRef,
        siblings: [{ nodePathKey: "0/0", candidateId: "new-child", label: "节点1", expanded: true, children: [] }],
      },
    });
    assert.equal(result.structureStatus, "saved");
    assert.equal(result.titlePending, true);
    assert.equal(result.operationComplete, false);
    assert.equal(hasReportPending(f.args.directory, reportIdentity), true);
    assert.equal(readCurrentReportStructureStage({ ...f.args, owner: nextEpochOwner, expectedStatus: "titlePending" }).status, "titlePending");
    assert.throws(() => readCurrentReportStructureStage({ ...f.args, reportIdentity: { ...reportIdentity, reportDetailId: "other-report" }, owner: nextEpochOwner, expectedStatus: "titlePending" }), /REPORT_PENDING_JOURNAL_INVALID|REPORT_PENDING_VERIFY/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("changed partial readback proof blocks new-epoch continuation and retains pending", () => {
  const f = fixture("structure_add_child", {
    target: { nodePathKey: "0", candidateId: "parent", label: "父节点", expanded: true },
    siblings: [],
  });
  try {
    const reload = reloadArgs(f.args);
    archiveReportStructureAfterReloadReadback({
      ...reload,
      observedTreeSnapshot: {
        ...f.treeSnapshot,
        operationKind: "structure_scope_read",
        scopeRef: f.args.scopeRef,
        siblings: [{ nodePathKey: "0/0", candidateId: "new-child", label: "节点1", expanded: true, children: [] }],
      },
    });
    const journalName = fs.readdirSync(f.args.directory).find((name) => name.endsWith(".json"));
    const journalPath = path.join(f.args.directory, journalName);
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    journal.structureStage.resolution.partialReadbackEvidence.observedTreeSha256 = "invalid-proof";
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    assert.throws(() => readCurrentReportStructureStage({ ...f.args, owner: { ...owner, sessionEpoch: "epoch-after-restart" }, expectedStatus: "titlePending" }), /REPORT_PENDING_VERIFY/);
    assert.equal(hasReportPending(f.args.directory, reportIdentity), true);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("stage preserves settingsStage and does not archive it with a verified structure operation", () => {
  const f = fixture("structure_add_child", {
    target: { nodePathKey: "0", candidateId: "parent", label: "父节点", expanded: true },
    siblings: [],
  });
  try {
    const file = path.join(f.args.directory, fs.readdirSync(f.args.directory)[0]);
    const journal = JSON.parse(fs.readFileSync(file, "utf8"));
    journal.settingsStage = { submissionAttempted: true, expectedFields: [{ label: "合成设置", value: "是" }] };
    fs.writeFileSync(file, JSON.stringify(journal));
    const reload = reloadArgs(f.args);
    const result = archiveReportStructureAfterReloadReadback({
      ...reload,
      observedTreeSnapshot: { ...f.treeSnapshot, operationKind: "structure_scope_read", scopeRef: f.args.scopeRef, siblings: [{ nodePathKey: "0/0", candidateId: "new-child", label: "新增节点", expanded: false, children: [] }] },
    });
    assert.equal(result.actionComplete, false);
    const active = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.deepEqual(active.settingsStage, journal.settingsStage);
    assert.equal(active.structureStage, undefined);
    assert.equal(active.structureResolutions.length, 1);
    assert.equal(hasReportPending(f.args.directory, reportIdentity), true);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("legacy record without partial evidence upgrades only after fresh scope and empty readonly model", () => {
  const f = fixture("structure_add_child", {
    target: { nodePathKey: "0", candidateId: "parent", label: "父节点", expanded: true },
    siblings: [],
  });
  try {
    const reload = reloadArgs(f.args);
    const firstScope = {
      ...f.treeSnapshot,
      operationKind: "structure_scope_read",
      scopeRef: f.args.scopeRef,
      siblings: [{ nodePathKey: "0/0", candidateId: "new-child", label: "节点1", expanded: true, children: [] }],
    };
    archiveReportStructureAfterReloadReadback({ ...reload, observedTreeSnapshot: firstScope });
    const nodeRef = { nodePathKey: "0/0", candidateId: "new-child" };
    const activeFile = path.join(f.args.directory, fs.readdirSync(f.args.directory).find((name) => name.endsWith(".json")));
    const activeRecord = JSON.parse(fs.readFileSync(activeFile, "utf8"));
    const stage = activeRecord.structureStage;
    stage.resolution = {
      type: "structure-saved-after-reload-readback",
      structureStatus: "saved",
      titlePending: true,
      operationComplete: false,
      operation: stage.operation,
      operationIndex: stage.operationIndex,
      nodeRef: stage.nodeRef,
      createdNodeRef: { nodePathKey: "0/0", candidateId: "new-child" },
      snapshotId: stage.snapshot.snapshotId,
      owner: { bindingId: stage.owner.bindingId, tabId: stage.owner.tabId },
      origin: { documentTimeOrigin: 200, pageOrigin: "https://excel.zhrdc.net" },
      reloadActionId: stage.reloadActionId,
      verifiedAt: new Date().toISOString(),
    };
    fs.writeFileSync(activeFile, JSON.stringify(activeRecord));

    const nextEpochOwner = { ...owner, sessionEpoch: "epoch-after-restart" };
    assert.equal(Object.hasOwn(activeRecord.structureStage.resolution, "partialReadbackEvidence"), false);
    assert.equal(readCurrentReportStructureStage({ ...f.args, owner: nextEpochOwner, expectedStatus: "titlePending" }).status, "titlePending");
    assert.equal(readCurrentReportStructurePartialStage({ ...f.args, nodeRef, owner: nextEpochOwner }).status, "titlePending");
    assert.throws(() => readCurrentReportStructurePartialStage({ ...f.args, nodeRef: { ...nodeRef, candidateId: "different" }, owner: nextEpochOwner }), /REPORT_PENDING_VERIFY/);
    assert.throws(() => readCurrentReportStructurePartialStage({ ...f.args, nodeRef, owner: { ...nextEpochOwner, bindingId: "different-binding" } }), /REPORT_PENDING_VERIFY/);

    const model = { type: "doc", content: [{ type: "paragraph", attrs: { indent: 2, lineHeight: 2, textAlign: "justify" } }] };
    const { createHash } = require("node:crypto");
    const editor = {
      association: "containment", modelAvailable: true, modelEditable: false, domEditable: "false", saveControlAvailable: false,
      modelHash: `sha256:${createHash("sha256").update(JSON.stringify(model)).digest("hex")}`,
    };
    const partialArgs = {
      directory: f.args.directory, reportIdentity, nodeRef, owner: nextEpochOwner, snapshotDirectory: f.args.snapshotDirectory,
      snapshot: f.args.snapshot, observedTreeSnapshot: firstScope,
      observedNode: { ...nodeRef, label: "节点1" }, editor,
      editorModel: { model, documentTimeOrigin: 200 }, documentTimeOrigin: 200,
      security: { readOnly: true, writesPerformed: false },
    };
    const corruptRecord = JSON.parse(JSON.stringify(activeRecord));
    corruptRecord.structureStage.resolution.partialReadbackEvidence = { type: "verified-structure-scope-readback" };
    fs.writeFileSync(activeFile, JSON.stringify(corruptRecord));
    assert.throws(() => readCurrentReportStructurePartialStage({ ...f.args, nodeRef, owner: nextEpochOwner }), /REPORT_PENDING_VERIFY/);
    assert.throws(() => archiveReportStructurePartialAfterReadback(partialArgs), /REPORT_PENDING_VERIFY/);
    fs.writeFileSync(activeFile, JSON.stringify(activeRecord));

    for (const unsafe of [
      { editorModel: { model: { type: "doc", content: [{ type: "paragraph", attrs: { arbitrary: "value" } }] }, documentTimeOrigin: 200 } },
      { editorModel: { model: { type: "doc", content: [{ type: "paragraph", attrs: { indent: 20 } }] }, documentTimeOrigin: 200 } },
      { editorModel: { model: { type: "doc", content: [{ type: "paragraph", attrs: { indent: 0 }, content: [{ type: "text", text: "x" }] }] }, documentTimeOrigin: 200 } },
      { editor: { ...editor, modelEditable: true } },
      { editor: { ...editor, saveControlAvailable: true } },
      { editor: { ...editor, association: "selected-panel" } },
      { observedNode: { ...nodeRef, label: "非默认节点名" } },
      { observedTreeSnapshot: { ...firstScope, siblings: [{ ...firstScope.siblings[0], candidateId: "changed-id" }] } },
    ]) {
      assert.throws(() => archiveReportStructurePartialAfterReadback({ ...partialArgs, ...unsafe }), /REPORT_PENDING_READBACK_MISMATCH/);
      assert.equal(hasReportPending(f.args.directory, reportIdentity), true);
    }

    const result = archiveReportStructurePartialAfterReadback(partialArgs);
    assert.equal(result.partial, true);
    assert.equal(result.titleNotExecuted, true);
    assert.equal(result.operationComplete, false);
    assert.equal(result.structurePendingReleased, true);
    assert.equal(result.reportPendingRetained, false);
    assert.equal(result.createdNodeRef.candidateId, "new-child");
    assert.equal(hasReportPending(f.args.directory, reportIdentity), false);
    const archived = JSON.parse(fs.readFileSync(path.join(f.args.directory, "resolved", `${result.archiveId}.json`), "utf8"));
    assert.equal(archived.structureStage.intendedTitle, "新增节点");
    assert.equal(archived.resolution.titleStatus, "not-executed");
    assert.equal(archived.resolution.titleNotExecuted, true);
    assert.equal(archived.resolution.operationComplete, false);
    assert.equal(archived.resolution.partialEvidence.placeholderLabelVerified, true);
    assert.equal(archived.resolution.partialEvidence.emptyModelVerified, true);
    assert.equal(JSON.stringify(archived).includes('"text":"x"'), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
