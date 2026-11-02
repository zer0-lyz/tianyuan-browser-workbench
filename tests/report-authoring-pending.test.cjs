"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { hasReportPending, orphanReportSaveActionId, markReportPending, archiveReportPendingAfterNoWrite, archiveReportPendingAfterChildReadback, archiveReportPendingAfterSiblingMemoryReadback, archiveReportPendingAfterOriginalReadback, archiveReportPendingAfterSavedReadback, stageReportPending, readReportStage, claimReportStageSave, stageLegacyAppend, recordReportSaveDocument, verifyReportSavedAfterReload, claimReportReload, stageOrphanReportSave } = require("../native-helper/report-pending.js");
const { saveReportSnapshot, saveReportTreeSnapshot } = require("../native-helper/report-snapshot.js");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");

function childReadbackFixture(siblings = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-child-readback-"));
  const directory = path.join(root, "pending");
  const snapshotDirectory = path.join(root, "snapshots");
  const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
  const nodeRef = { nodePathKey: "3/12", candidateId: "fixture-parent-node" };
  const operationIndex = 0;
  const treeSnapshot = {
    complete: true,
    operationIndex,
    operationKind: "structure_add_child",
    scopePath: "3/12",
    target: { ...nodeRef, label: "资产评估专业人员已经", expanded: true },
    siblings,
  };
  const snapshot = saveReportTreeSnapshot({ directory: snapshotDirectory, reportIdentity, nodeRef, operationIndex, operationKind: "structure_add_child", treeSnapshot });
  const actionId = "action_child_timeout";
  markReportPending({ directory, reportIdentity, actionId, action: "report_execute" });
  const createdAt = JSON.parse(fs.readFileSync(path.join(directory, fs.readdirSync(directory)[0]), "utf8")).createdAt;
  const createdAtTime = Date.parse(createdAt);
  const newChild = { nodePathKey: `3/12/${siblings.length}`, candidateId: "fixture-child-node", label: "节点1", expanded: true };
  const args = {
    directory,
    reportIdentity,
    actionId,
    nodeRef,
    snapshotDirectory,
    snapshot,
    operationIndex,
    observedTreeSnapshot: { ...treeSnapshot, siblings: [...siblings, newChild] },
    documentTimeOrigin: createdAtTime + 1000,
    owner: { bindingId: "trusted-current-binding", tabId: 42 },
  };
  return { root, directory, reportIdentity, nodeRef, actionId, snapshot, treeSnapshot, newChild, createdAt, args };
}

test("pending report journal survives reload and isolates report identities", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "report-pending-"));
  try {
    const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
    assert.equal(hasReportPending(directory, reportIdentity), false);
    markReportPending({ directory, reportIdentity, actionId: "action_test", action: "report_execute" });
    assert.equal(hasReportPending(directory, reportIdentity), true);
    const check = "const p=require(process.argv[1]);process.stdout.write(String(p.hasReportPending(process.argv[2],JSON.parse(process.argv[3]))));";
    const modulePath = path.resolve(__dirname, "../native-helper/report-pending.js");
    assert.equal(execFileSync(process.execPath, ["-e", check, modulePath, directory, JSON.stringify(reportIdentity)], { encoding: "utf8" }), "true");
    assert.equal(hasReportPending(directory, { ...reportIdentity, reportDetailId: "other" }), false);
    assert.throws(() => markReportPending({ directory, reportIdentity, actionId: "action_again", action: "report_execute" }), /REPORT_PENDING_VERIFY/);
    const files = fs.readdirSync(directory);
    assert.equal(files.length, 1);
    const journal = JSON.parse(fs.readFileSync(path.join(directory, files[0]), "utf8"));
    assert.equal(journal.actionId, "action_test");
    assert.equal(journal.state, "pendingVerify");
    if (process.platform !== "win32") assert.equal(fs.statSync(path.join(directory, files[0])).mode & 0o777, 0o600);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("automatic saved verification requires a fresh document and exact model and binding", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-auto-verify-"));
  try {
    const directory = path.join(root, "pending");
    const snapshotDirectory = path.join(root, "snapshots");
    const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
    const nodeRef = { nodePathKey: "3/12", candidateId: "123456" };
    const owner = { sessionId: "session", sessionEpoch: "epoch", bindingId: "binding", controlEpoch: "control", tabId: 42 };
    const model = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "测试" }] }] };
    const modelHash = `sha256:${createHash("sha256").update(JSON.stringify(model)).digest("hex")}`;
    markReportPending({ directory, reportIdentity, actionId: "action_write", action: "report_execute" });
    stageReportPending({ directory, reportIdentity, nodeRef, owner, actionId: "action_write", modelHash });
    claimReportStageSave({ directory, reportIdentity, nodeRef, owner, actionId: "action_save" });
    assert.throws(() => recordReportSaveDocument({ directory, reportIdentity, actionId: "action_wrong", documentTimeOrigin: 100 }), /REPORT_PENDING_JOURNAL_INVALID/);
    recordReportSaveDocument({ directory, reportIdentity, actionId: "action_save", documentTimeOrigin: 100 });
    const input = { directory, snapshotDirectory, reportIdentity, nodeRef, model, observedModelHash: modelHash, documentTimeOrigin: 101, bindingId: "binding", tabId: 42 };
    assert.throws(() => claimReportReload({ ...input, bindingId: "other", actionId: "action_reload" }), /REPORT_PENDING_VERIFY/);
    claimReportReload({ ...input, actionId: "action_reload" });
    assert.throws(() => claimReportReload({ ...input, actionId: "action_again" }), /REPORT_PENDING_VERIFY/);
    assert.throws(() => verifyReportSavedAfterReload({ ...input, documentTimeOrigin: 100 }), /REPORT_RELOAD_REQUIRED/);
    assert.throws(() => verifyReportSavedAfterReload({ ...input, bindingId: "other" }), /REPORT_RELOAD_REQUIRED/);
    assert.throws(() => verifyReportSavedAfterReload({ ...input, model: { type: "doc" } }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.equal(hasReportPending(directory, reportIdentity), true);
    assert.equal(verifyReportSavedAfterReload(input).modelHash, modelHash);
    assert.equal(hasReportPending(directory, reportIdentity), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("pending journal archives only when the original model and target match", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-pending-resolution-"));
  try {
    const directory = path.join(root, "pending");
    const snapshotDirectory = path.join(root, "snapshots");
    const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
    const nodeRef = { nodePathKey: "3/12", candidateId: "123456" };
    const model = { type: "doc", content: [{ type: "paragraph" }] };
    const snapshot = saveReportSnapshot({ directory: snapshotDirectory, reportIdentity, nodeRef, model });
    markReportPending({ directory, reportIdentity, actionId: "action_test", action: "report_execute" });
    const args = { directory, reportIdentity, nodeRef, snapshotDirectory, snapshot };
    assert.throws(() => archiveReportPendingAfterOriginalReadback({ ...args, observedModelHash: "sha256:wrong" }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.equal(hasReportPending(directory, reportIdentity), true);
    const observedModelHash = `sha256:${createHash("sha256").update(JSON.stringify(model)).digest("hex")}`;
    assert.throws(() => archiveReportPendingAfterOriginalReadback({ ...args, nodeRef: { ...nodeRef, candidateId: "other" }, observedModelHash }), /REPORT_SNAPSHOT_TARGET_MISMATCH/);
    const result = archiveReportPendingAfterOriginalReadback({ ...args, observedModelHash });
    assert.equal(hasReportPending(directory, reportIdentity), false);
    const saved = JSON.parse(fs.readFileSync(path.join(directory, "resolved", `${result.archiveId}.json`), "utf8"));
    assert.equal(saved.resolution.modelHash, observedModelHash);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("orphaned editor save can be staged only against its exact action, node, owner and model", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-pending-orphan-save-"));
  try {
    const directory = path.join(root, "pending");
    const snapshotDirectory = path.join(root, "snapshots");
    const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
    const nodeRef = { nodePathKey: "3/12", candidateId: "123456" };
    const owner = { sessionId: "session", sessionEpoch: "epoch", bindingId: "binding", controlEpoch: "control", tabId: 42 };
    const model = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "private test content" }] }] };
    const actionId = "action_legacy_save";
    const modelHash = `sha256:${createHash("sha256").update(JSON.stringify(model)).digest("hex")}`;
    markReportPending({ directory, reportIdentity, actionId, action: "report_editor_save" });
    assert.equal(orphanReportSaveActionId({ directory, reportIdentity }), actionId);
    assert.throws(() => stageOrphanReportSave({ directory, reportIdentity, nodeRef, owner, actionId: "action_wrong", modelHash, documentTimeOrigin: 100 }), /REPORT_PENDING_RECOVERY_MISMATCH/);
    const snapshot = saveReportSnapshot({ directory: snapshotDirectory, reportIdentity, nodeRef, model });
    const staged = stageOrphanReportSave({ directory, reportIdentity, nodeRef, owner, actionId, modelHash, documentTimeOrigin: 100 });
    assert.equal(staged.modelHash, modelHash);
    claimReportReload({ directory, reportIdentity, nodeRef, bindingId: owner.bindingId, tabId: owner.tabId, actionId: "action_reload" });
    const verified = verifyReportSavedAfterReload({ directory, reportIdentity, nodeRef, snapshotDirectory, model, observedModelHash: modelHash, documentTimeOrigin: 101, bindingId: owner.bindingId, tabId: owner.tabId });
    assert.equal(verified.modelHash, modelHash);
    assert.equal(hasReportPending(directory, reportIdentity), false);
    assert.equal(fs.existsSync(path.join(snapshotDirectory, `${snapshot.snapshotId}.json`)), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("pre-write structure failures archive only after exact tree snapshot readback", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-no-write-resolution-"));
  try {
    const directory = path.join(root, "pending");
    const snapshotDirectory = path.join(root, "snapshots");
    const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
    const nodeRef = { nodePathKey: "3/12", candidateId: "123456" };
    const treeSnapshot = { complete: true, operationIndex: 0, operationKind: "structure_add_child", scopePath: "3/12", target: { ...nodeRef, label: "父节点", expanded: true }, siblings: [] };
    const snapshot = saveReportTreeSnapshot({ directory: snapshotDirectory, reportIdentity, nodeRef, operationIndex: 0, operationKind: "structure_add_child", treeSnapshot });
    markReportPending({ directory, reportIdentity, actionId: "action_no_write", action: "report_execute" });
    const args = { directory, reportIdentity, actionId: "action_no_write", evidenceCode: "REPORT_STRUCTURE_CONTROL_NOT_FOUND", nodeRef, snapshotDirectory, snapshot, operationIndex: 0, operationKind: "structure_add_child", observedTreeSnapshot: { ...treeSnapshot, siblings: [{ label: "unexpected" }] } };
    assert.throws(() => archiveReportPendingAfterNoWrite(args), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.equal(hasReportPending(directory, reportIdentity), true);
    const result = archiveReportPendingAfterNoWrite({ ...args, observedTreeSnapshot: treeSnapshot });
    assert.equal(hasReportPending(directory, reportIdentity), false);
    const archived = JSON.parse(fs.readFileSync(path.join(directory, "resolved", `${result.archiveId}.json`), "utf8"));
    assert.equal(archived.resolution.type, "no-write-confirmed");
    assert.equal(archived.resolution.evidenceCode, "REPORT_STRUCTURE_CONTROL_NOT_FOUND");
    assert.equal(archived.resolution.treeSnapshotHash, result.treeSnapshotHash);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("child readback archives the original pending record and marks title incomplete", () => {
  const fixture = childReadbackFixture();
  try {
    const result = archiveReportPendingAfterChildReadback(fixture.args);
    assert.equal(hasReportPending(fixture.directory, fixture.reportIdentity), false);
    assert.deepEqual(result.childNodeRef, { nodePathKey: "3/12/0", candidateId: "fixture-child-node" });
    const archived = JSON.parse(fs.readFileSync(path.join(fixture.directory, "resolved", `${result.archiveId}.json`), "utf8"));
    assert.equal(archived.action, "report_execute");
    assert.equal(archived.actionId, fixture.actionId);
    assert.equal(archived.state, "pendingVerify");
    assert.equal(archived.resolution.type, "child-structure-saved-title-pending");
    assert.equal(archived.resolution.structureStatus, "saved");
    assert.equal(archived.resolution.titleStatus, "not-completed");
    assert.match(archived.resolution.explanation, /标题尚未完成/);
    assert.equal(archived.resolution.refreshEvidence.basis, "pending-created-at");
    assert.equal(archived.resolution.refreshEvidence.documentTimeOrigin, fixture.args.documentTimeOrigin);
    assert.deepEqual(archived.resolution.owner, fixture.args.owner);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("child readback rejects missing refresh evidence", () => {
  const fixture = childReadbackFixture();
  try {
    assert.throws(() => archiveReportPendingAfterChildReadback({ ...fixture.args, documentTimeOrigin: Date.parse(fixture.createdAt) }), /REPORT_RELOAD_REQUIRED/);
    assert.throws(() => archiveReportPendingAfterChildReadback({ ...fixture.args, actionStartDocumentTimeOrigin: fixture.args.documentTimeOrigin }), /REPORT_RELOAD_REQUIRED/);
    assert.equal(hasReportPending(fixture.directory, fixture.reportIdentity), true);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("child readback rejects a mismatched report identity", () => {
  const fixture = childReadbackFixture();
  try {
    assert.throws(() => archiveReportPendingAfterChildReadback({ ...fixture.args, reportIdentity: { ...fixture.reportIdentity, reportDetailId: "other" } }), /REPORT_PENDING_JOURNAL_INVALID/);
    assert.equal(hasReportPending(fixture.directory, fixture.reportIdentity), true);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("child readback rejects more than one added child", () => {
  const fixture = childReadbackFixture();
  try {
    const secondChild = { nodePathKey: "3/12/1", candidateId: "second-new-child", label: "节点2", expanded: true };
    assert.throws(() => archiveReportPendingAfterChildReadback({
      ...fixture.args,
      observedTreeSnapshot: { ...fixture.args.observedTreeSnapshot, siblings: [...fixture.args.observedTreeSnapshot.siblings, secondChild] },
    }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.equal(hasReportPending(fixture.directory, fixture.reportIdentity), true);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("child readback rejects changes to the parent or existing child nodes", () => {
  const originalChild = { nodePathKey: "3/12/0", candidateId: "old-child", label: "原子节点", expanded: true };
  const fixture = childReadbackFixture([originalChild]);
  try {
    assert.throws(() => archiveReportPendingAfterChildReadback({
      ...fixture.args,
      observedTreeSnapshot: { ...fixture.args.observedTreeSnapshot, target: { ...fixture.treeSnapshot.target, label: "父节点已变化" } },
    }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.throws(() => archiveReportPendingAfterChildReadback({
      ...fixture.args,
      observedTreeSnapshot: { ...fixture.args.observedTreeSnapshot, siblings: [{ ...originalChild, label: "原子节点已变化" }, fixture.newChild] },
    }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.equal(hasReportPending(fixture.directory, fixture.reportIdentity), true);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("sibling memory readback archives only one node inserted after the exact anchor", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-sibling-memory-"));
  try {
    const directory = path.join(root, "pending"), snapshotDirectory = path.join(root, "snapshots");
    const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
    const nodeRef = { nodePathKey: "3/12/0", candidateId: "anchor-id" };
    const owner = { bindingId: "binding", tabId: 42 };
    const original = { complete: true, operationIndex: 0, operationKind: "structure_add_sibling", scopePath: "3/12", target: { ...nodeRef, label: "123", expanded: true }, siblings: [{ ...nodeRef, label: "123", expanded: true }] };
    const snapshot = saveReportTreeSnapshot({ directory: snapshotDirectory, reportIdentity, nodeRef, operationIndex: 0, operationKind: "structure_add_sibling", treeSnapshot: original });
    const observedParentTree = { complete: true, scopePath: "3/12", siblings: [original.siblings[0], { nodePathKey: "3/12/1", candidateId: "created-id", label: "节点1", expanded: true }] };
    const actionId = "action_sibling";
    markReportPending({ directory, reportIdentity, actionId, action: "report_execute" });
    const args = { directory, reportIdentity, actionId, nodeRef, snapshotDirectory, snapshot, operationIndex: 0, observedParentTree, owner };
    assert.throws(() => archiveReportPendingAfterSiblingMemoryReadback({ ...args, observedParentTree: { ...observedParentTree, siblings: [{ ...observedParentTree.siblings[1], nodePathKey: "3/12/0" }, observedParentTree.siblings[0]] } }), /REPORT_PENDING_READBACK_MISMATCH/);
    const result = archiveReportPendingAfterSiblingMemoryReadback(args);
    assert.equal(hasReportPending(directory, reportIdentity), false);
    assert.deepEqual(result.siblingNodeRef, { nodePathKey: "3/12/1", candidateId: "created-id", label: "节点1" });
    const archived = JSON.parse(fs.readFileSync(path.join(directory, "resolved", `${result.archiveId}.json`), "utf8"));
    assert.equal(archived.resolution.structureStatus, "in-memory-verified");
    assert.equal(archived.resolution.persistenceStatus, "not-verified");
    assert.equal(archived.resolution.titleStatus, "not-completed");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("staged save is bound to one node, session and model and can be claimed once", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "report-stage-"));
  try {
    const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
    const nodeRef = { nodePathKey: "3/12", candidateId: "123456" };
    const owner = { sessionId: "session", sessionEpoch: "epoch", bindingId: "binding", controlEpoch: "control", tabId: 42 };
    const modelHash = `sha256:${"a".repeat(64)}`;
    const args = { directory, reportIdentity, nodeRef, owner };
    markReportPending({ directory, reportIdentity, actionId: "action_write", action: "report_execute" });
    assert.throws(() => readReportStage(args), /REPORT_PENDING_VERIFY/);
    assert.throws(() => stageReportPending({ ...args, actionId: "action_wrong", modelHash }), /REPORT_PENDING_JOURNAL_INVALID/);
    stageReportPending({ ...args, actionId: "action_write", modelHash });
    assert.equal(readReportStage(args).modelHash, modelHash);
    assert.throws(() => readReportStage({ ...args, nodeRef: { ...nodeRef, candidateId: "other" } }), /REPORT_PENDING_VERIFY/);
    assert.throws(() => readReportStage({ ...args, owner: { ...owner, sessionEpoch: "new" } }), /REPORT_PENDING_VERIFY/);
    assert.equal(claimReportStageSave({ ...args, actionId: "action_save" }), modelHash);
    assert.throws(() => claimReportStageSave({ ...args, actionId: "action_repeat" }), /REPORT_PENDING_VERIFY/);
    assert.equal(hasReportPending(directory, reportIdentity), true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("legacy append recovery requires exact snapshot evidence and explicit save confirmation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-legacy-stage-"));
  try {
    const directory = path.join(root, "pending");
    const snapshotDirectory = path.join(root, "snapshots");
    const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
    const nodeRef = { nodePathKey: "3/12", candidateId: "123456" };
    const owner = { sessionId: "session", sessionEpoch: "epoch", bindingId: "binding", controlEpoch: "control", tabId: 42 };
    const model = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    const snapshot = (text) => saveReportSnapshot({ directory: snapshotDirectory, reportIdentity, nodeRef, model: model(text) });
    const originalSnapshot = snapshot("原文");
    const currentSnapshot = snapshot("原文【测试】");
    const changedElsewhere = snapshot("其他【测试】");
    const args = { directory, reportIdentity, nodeRef, owner, actionId: "action_write", snapshotDirectory, originalSnapshot, currentSnapshot, appendedText: "【测试】", confirmText: "确认保存报告" };
    markReportPending({ directory, reportIdentity, actionId: "action_write", action: "report_execute" });
    assert.throws(() => stageLegacyAppend({ ...args, confirmText: "" }), /REPORT_CONFIRM_TEXT_INVALID/);
    assert.throws(() => stageLegacyAppend({ ...args, currentSnapshot: changedElsewhere }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.throws(() => stageLegacyAppend({ ...args, nodeRef: { ...nodeRef, candidateId: "other" } }), /REPORT_SNAPSHOT_TARGET_MISMATCH/);
    const result = stageLegacyAppend(args);
    assert.equal(result.modelHash, `sha256:${createHash("sha256").update(JSON.stringify(model("原文【测试】"))).digest("hex")}`);
    assert.equal(readReportStage(args).modelHash, result.modelHash);
    assert.equal(hasReportPending(directory, reportIdentity), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("saved readback archives only the matching claimed save and expected model", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-saved-stage-"));
  try {
    const directory = path.join(root, "pending");
    const snapshotDirectory = path.join(root, "snapshots");
    const reportIdentity = { projectId: "project", companyId: "company", reportType: "1", mode: "add", reportDetailId: "report" };
    const nodeRef = { nodePathKey: "3/12", candidateId: "123456" };
    const owner = { sessionId: "session", sessionEpoch: "epoch", bindingId: "binding", controlEpoch: "control", tabId: 42 };
    const model = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "测试" }] }] };
    const snapshot = saveReportSnapshot({ directory: snapshotDirectory, reportIdentity, nodeRef, model });
    const observedModelHash = `sha256:${createHash("sha256").update(JSON.stringify(model)).digest("hex")}`;
    const args = { directory, reportIdentity, nodeRef, snapshotDirectory, snapshot, observedModelHash, saveActionId: "action_save" };
    markReportPending({ directory, reportIdentity, actionId: "action_write", action: "report_execute" });
    stageReportPending({ directory, reportIdentity, nodeRef, owner, actionId: "action_write", modelHash: observedModelHash });
    claimReportStageSave({ directory, reportIdentity, nodeRef, owner, actionId: "action_save" });
    assert.throws(() => archiveReportPendingAfterSavedReadback({ ...args, saveActionId: "action_other" }), /REPORT_PENDING_JOURNAL_INVALID/);
    assert.throws(() => archiveReportPendingAfterSavedReadback({ ...args, observedModelHash: `sha256:${"0".repeat(64)}` }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.equal(hasReportPending(directory, reportIdentity), true);
    const result = archiveReportPendingAfterSavedReadback(args);
    assert.equal(hasReportPending(directory, reportIdentity), false);
    const record = JSON.parse(fs.readFileSync(path.join(directory, "resolved", `${result.archiveId}.json`), "utf8"));
    assert.equal(record.resolution.type, "saved-model-readback");
    assert.equal(record.saveActionId, "action_save");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
