"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomBytes } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { readReportTreeSnapshot } = require("./report-snapshot.js");

const IDENTITY_FIELDS = ["projectId", "companyId", "reportType", "mode", "reportDetailId"];
const NODE_PATH = /^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/;
const NODE_ID = /^[A-Za-z0-9:_-]{1,200}$/;
const ACTION_ID = /^action_[A-Za-z0-9_-]{1,100}$/;
const DEFAULT_PLACEHOLDER_LABEL = /^节点[1-9][0-9]*$/;
const OPERATIONS = new Set(["structure_add_child", "structure_add_sibling", "structure_delete"]);

function pendingFile(directory, reportIdentity) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) throw new Error("REPORT_PENDING_DIRECTORY_INVALID");
  if (!IDENTITY_FIELDS.every((key) => typeof reportIdentity?.[key] === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(reportIdentity[key]))) throw new Error("REPORT_PENDING_IDENTITY_INVALID");
  const key = createHash("sha256").update(JSON.stringify(IDENTITY_FIELDS.map((field) => reportIdentity[field]))).digest("hex");
  return path.join(directory, key + ".json");
}

function sameIdentity(record, reportIdentity) {
  return IDENTITY_FIELDS.every((key) => record?.reportIdentity?.[key] === reportIdentity?.[key]);
}

function validNodeRef(nodeRef) {
  return Boolean(NODE_PATH.test(nodeRef?.nodePathKey || "") && NODE_ID.test(nodeRef?.candidateId || ""));
}

function validOwner(owner) {
  return Boolean(owner && ["sessionId", "sessionEpoch", "bindingId", "controlEpoch"].every((key) => typeof owner[key] === "string" && /^[A-Za-z0-9:_-]{1,200}$/.test(owner[key]))
    && Number.isInteger(owner.tabId) && owner.tabId > 0);
}

function normalizedOwner(owner) {
  return { sessionId: owner.sessionId, sessionEpoch: owner.sessionEpoch, bindingId: owner.bindingId, controlEpoch: owner.controlEpoch, tabId: owner.tabId };
}

const LEGACY_TITLE_PENDING_RESOLUTION_KEYS = ["type", "structureStatus", "titlePending", "operationComplete", "operation", "operationIndex", "nodeRef", "createdNodeRef", "snapshotId", "owner", "origin", "reloadActionId", "verifiedAt"].sort();
const PARTIAL_READBACK_EVIDENCE_KEYS = ["type", "operationIndex", "scopeRef", "reloadActionId", "snapshot", "observedTreeSha256", "documentTimeOrigin", "createdNodeRef", "placeholderLabelVerified", "emptyTitleVerified"];

function validPriorStructurePartialResolution(stage) {
  const resolution = stage?.resolution;
  const ownerKeys = Object.keys(resolution?.owner || {}).sort();
  const reloadClaimedAt = Date.parse(stage?.reloadClaimedAt || "");
  const reloadRequestedAt = Date.parse(stage?.reloadRequestedAt || "");
  return Boolean(stage?.status === "titlePending" && ["structure_add_child", "structure_add_sibling"].includes(stage.operation)
    && ACTION_ID.test(stage.actionId || "") && ACTION_ID.test(stage.reloadActionId || "")
    && validNodeRef(stage.nodeRef) && validOwner(stage.owner) && validOrigin(stage.origin)
    && Number.isInteger(stage.operationIndex) && stage.operationIndex >= 0 && stage.operationIndex < 50
    && /^report-tree-[a-f0-9]{32}$/.test(stage.snapshot?.snapshotId || "") && /^[a-f0-9]{64}$/.test(stage.snapshot?.sha256 || "")
    && Number.isInteger(stage.snapshot?.bytes) && stage.snapshot.bytes > 0
    && Number.isFinite(reloadClaimedAt) && Number.isFinite(reloadRequestedAt) && reloadRequestedAt >= reloadClaimedAt
    && resolution?.type === "structure-saved-after-reload-readback" && resolution.structureStatus === "saved"
    && resolution.titlePending === true && resolution.operationComplete === false
    && resolution.operation === stage.operation && resolution.operationIndex === stage.operationIndex
    && isDeepStrictEqual(resolution.nodeRef, stage.nodeRef) && validNodeRef(resolution.createdNodeRef)
    && resolution.snapshotId === stage.snapshot.snapshotId && ownerKeys.join("|") === "bindingId|tabId"
    && resolution.owner.bindingId === stage.owner.bindingId && resolution.owner.tabId === stage.owner.tabId
    && validOrigin(resolution.origin) && resolution.origin.documentTimeOrigin > stage.origin.documentTimeOrigin
    && (!stage.origin.pageOrigin || resolution.origin.pageOrigin === stage.origin.pageOrigin)
    && resolution.reloadActionId === stage.reloadActionId && Number.isFinite(Date.parse(resolution.verifiedAt || "")));
}

function validExistingPartialReadbackEvidence(stage) {
  const resolution = stage?.resolution;
  const evidence = resolution?.partialReadbackEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)
    || Object.keys(evidence).some((key) => !PARTIAL_READBACK_EVIDENCE_KEYS.includes(key))
    || !["placeholderLabelVerified", "emptyTitleVerified"].some((key) => Object.hasOwn(evidence, key))) return false;
  const evidenceSnapshotKeys = Object.keys(evidence.snapshot || {}).sort();
  return evidence.type === "verified-structure-scope-readback" && evidence.operationIndex === stage.operationIndex
    && isDeepStrictEqual(evidence.scopeRef, stage.scopeRef) && evidence.reloadActionId === stage.reloadActionId
    && evidenceSnapshotKeys.join("|") === "sha256|snapshotId"
    && evidence.snapshot.snapshotId === stage.snapshot?.snapshotId && evidence.snapshot.sha256 === stage.snapshot?.sha256
    && /^[a-f0-9]{64}$/.test(evidence.observedTreeSha256 || "")
    && Number.isFinite(evidence.documentTimeOrigin) && evidence.documentTimeOrigin === resolution.origin?.documentTimeOrigin
    && evidence.createdNodeRef?.nodePathKey === resolution.createdNodeRef?.nodePathKey
    && evidence.createdNodeRef?.candidateId === resolution.createdNodeRef?.candidateId
    && (!Object.hasOwn(evidence, "placeholderLabelVerified") || typeof evidence.placeholderLabelVerified === "boolean")
    && (!Object.hasOwn(evidence, "emptyTitleVerified") || typeof evidence.emptyTitleVerified === "boolean");
}

function isLegacyTitlePendingWithoutReadbackEvidence(stage) {
  const resolution = stage?.resolution;
  return Boolean(resolution && !Object.hasOwn(resolution, "partialReadbackEvidence")
    && isDeepStrictEqual(Object.keys(resolution).sort(), LEGACY_TITLE_PENDING_RESOLUTION_KEYS)
    && validPriorStructurePartialResolution(stage));
}

function validOrigin(origin) {
  if (!origin || !Number.isFinite(origin.documentTimeOrigin) || origin.documentTimeOrigin <= 0) return false;
  if (origin.pageOrigin === undefined) return true;
  try {
    const parsed = new URL(origin.pageOrigin);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === origin.pageOrigin;
  } catch { return false; }
}

function normalizedOrigin(origin) {
  return { documentTimeOrigin: origin.documentTimeOrigin, ...(origin.pageOrigin ? { pageOrigin: origin.pageOrigin } : {}) };
}

function scopedPath(scopePath, index) {
  return scopePath ? scopePath + "/" + index : String(index);
}

function parentPath(nodePathKey) {
  const slash = nodePathKey.lastIndexOf("/");
  return slash < 0 ? "" : nodePathKey.slice(0, slash);
}

function normalizeScopeRef(scopeRef, operation, nodeRef) {
  const wantedPath = operation === "structure_add_child" ? nodeRef.nodePathKey : parentPath(nodeRef.nodePathKey);
  if (wantedPath === "") {
    if (scopeRef?.kind !== "treeRoot" || scopeRef.scopePath !== "") throw new Error("REPORT_STRUCTURE_SCOPE_INVALID");
    return { kind: "treeRoot", scopePath: "" };
  }
  if (scopeRef?.kind !== "node" || !validNodeRef(scopeRef) || scopeRef.nodePathKey !== wantedPath
    || operation === "structure_add_child" && scopeRef.candidateId !== nodeRef.candidateId) throw new Error("REPORT_STRUCTURE_SCOPE_INVALID");
  return {
    kind: "node",
    scopePath: wantedPath,
    nodePathKey: scopeRef.nodePathKey,
    candidateId: scopeRef.candidateId,
    ...(typeof scopeRef.label === "string" ? { label: scopeRef.label } : {}),
  };
}

function readJournal(directory, reportIdentity) {
  const file = pendingFile(directory, reportIdentity);
  let stats;
  let record;
  try {
    const directoryStats = fs.lstatSync(directory);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink() || (process.platform !== "win32" && (directoryStats.mode & 0o077) !== 0)) throw new Error("unsafe");
    stats = fs.lstatSync(file);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 1024 * 1024) throw new Error("invalid");
    record = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (record?.version !== 1 || record.state !== "pendingVerify" || record.action !== "report_execute" || !sameIdentity(record, reportIdentity)) throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  return { file, stats, record };
}

function assertJournalUnchanged(file, previousStats) {
  const current = fs.lstatSync(file);
  if (current.dev !== previousStats.dev || current.ino !== previousStats.ino || current.size !== previousStats.size || current.mtimeMs !== previousStats.mtimeMs) throw new Error("REPORT_PENDING_JOURNAL_CHANGED");
}

function replaceJournal(file, previousStats, record) {
  const temp = file + "." + randomBytes(16).toString("hex") + ".tmp";
  let descriptor;
  try {
    descriptor = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(record), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    assertJournalUnchanged(file, previousStats);
    fs.renameSync(temp, file);
  } catch (cause) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(temp); } catch {}
    throw cause;
  }
}

function readBaseline({ snapshotDirectory, snapshot, reportIdentity, nodeRef, scopeRef, operationIndex, operation }) {
  const tree = readReportTreeSnapshot({ directory: snapshotDirectory, snapshot, reportIdentity, nodeRef, operationIndex, operationKind: operation });
  const child = operation === "structure_add_child";
  const scopePath = scopeRef.scopePath;
  if (tree.complete !== true || tree.operationIndex !== operationIndex || tree.operationKind !== operation || tree.scopePath !== scopePath
    || !sameScopeRef(tree.scopeRef, scopeRef) || !Array.isArray(tree.siblings)) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  if (!tree.siblings.every((node, index) => validSubtree(node, scopedPath(scopePath, index)))) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  if (!uniqueTreeIds(tree.siblings)) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  if (!tree.target || tree.target.nodePathKey !== nodeRef.nodePathKey || tree.target.candidateId !== nodeRef.candidateId
    || typeof tree.target.label !== "string" || !tree.target.label || typeof tree.target.expanded !== "boolean"
    || typeof nodeRef.label === "string" && nodeRef.label !== tree.target.label) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  if (scopeRef.kind === "treeRoot" ? tree.scopeTarget !== null
    : !tree.scopeTarget || tree.scopeTarget.nodePathKey !== scopeRef.nodePathKey || tree.scopeTarget.candidateId !== scopeRef.candidateId
      || typeof tree.scopeTarget.label !== "string" || !tree.scopeTarget.label || typeof tree.scopeTarget.expanded !== "boolean"
      || scopeRef.label !== undefined && tree.scopeTarget.label !== scopeRef.label) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  if (child) {
    if (tree.target.children !== undefined || containsNodeId(tree.siblings, tree.target.candidateId)) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  } else {
    const at = Number(nodeRef.nodePathKey.slice(nodeRef.nodePathKey.lastIndexOf("/") + 1));
    const anchor = tree.siblings[at];
    if (!anchor || anchor.candidateId !== nodeRef.candidateId || anchor.label !== tree.target.label || anchor.expanded !== tree.target.expanded) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
    if (!scopeRef.kind || operation === "structure_delete"
      && (!validSubtree(tree.target, nodeRef.nodePathKey) || !sameSubtree(tree.target, anchor, nodeRef.nodePathKey))) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  }
  return tree;
}

function validSubtree(node, expectedPath, allowEmptyLabel = false) {
  return Boolean(node && typeof node === "object" && !Array.isArray(node) && node.nodePathKey === expectedPath
    && NODE_ID.test(node.candidateId || "") && typeof node.label === "string" && (allowEmptyLabel || node.label.length > 0)
    && node.label.length <= 2000 && typeof node.expanded === "boolean" && Array.isArray(node.children)
    && node.children.every((child, index) => validSubtree(child, expectedPath + "/" + index)));
}

function uniqueTreeIds(nodes) {
  const ids = new Set();
  const visit = (node) => {
    if (ids.has(node.candidateId)) return false;
    ids.add(node.candidateId);
    return node.children.every(visit);
  };
  return nodes.every(visit);
}

function stageReportStructurePending({ directory, reportIdentity, actionId, operation, nodeRef, scopeRef, snapshotDirectory, snapshot, operationIndex, owner, origin, intendedTitle }) {
  if (!ACTION_ID.test(actionId || "") || !OPERATIONS.has(operation) || !validNodeRef(nodeRef) || !validOwner(owner) || !validOrigin(origin)
    || !Number.isInteger(operationIndex) || operationIndex < 0 || operationIndex >= 50
    || operation !== "structure_delete" && (typeof intendedTitle !== "string" || !intendedTitle || intendedTitle.length > 2000)) throw new Error("REPORT_STRUCTURE_STAGE_INVALID");
  const normalizedScopeRef = normalizeScopeRef(scopeRef, operation, nodeRef);
  const baseline = readBaseline({ snapshotDirectory, snapshot, reportIdentity, nodeRef, scopeRef: normalizedScopeRef, operationIndex, operation });
  const { file, stats, record } = readJournal(directory, reportIdentity);
  if (record.actionId !== actionId || record.structureStage || record.stage || record.saveActionId || record.reloadActionId || record.saveDocumentTimeOrigin) throw new Error("REPORT_PENDING_VERIFY");
  record.structureStage = {
    actionId,
    operation,
    operationIndex,
    nodeRef: { nodePathKey: nodeRef.nodePathKey, candidateId: nodeRef.candidateId },
    scopeRef: normalizedScopeRef,
    snapshot: { snapshotId: snapshot.snapshotId, sha256: snapshot.sha256, bytes: snapshot.bytes },
    owner: normalizedOwner(owner),
    origin: normalizedOrigin(origin),
    ...(operation === "structure_delete" ? {} : { intendedTitle }),
    status: "staged",
  };
  replaceJournal(file, stats, record);
  return { status: "staged", operation, operationIndex };
}

function exactStage(stage, { actionId, operation, nodeRef, scopeRef, owner }) {
  return Boolean(stage && stage.actionId === actionId && (!operation || stage.operation === operation)
    && nodeRef?.nodePathKey === stage.nodeRef?.nodePathKey && nodeRef?.candidateId === stage.nodeRef?.candidateId
    && isDeepStrictEqual(normalizeScopeRef(scopeRef, stage.operation, nodeRef), stage.scopeRef)
    && validOwner(owner) && isDeepStrictEqual(stage.owner, normalizedOwner(owner)));
}

function readOnlyStageOwnerMatches(stage, owner) {
  if (!validOwner(owner) || !validOwner(stage?.owner)) return false;
  const current = normalizedOwner(owner);
  if (isDeepStrictEqual(stage.owner, current)) return true;
  if (!['reloadRequested', 'titlePending'].includes(stage.status) || stage.owner.sessionEpoch === current.sessionEpoch
    || !['sessionId', 'bindingId', 'controlEpoch', 'tabId'].every((key) => stage.owner[key] === current[key])
    || !ACTION_ID.test(stage.reloadActionId || '') || !Number.isFinite(Date.parse(stage.reloadRequestedAt || ''))) return false;
  if (stage.status !== 'titlePending') return true;
  return validPriorStructurePartialResolution(stage)
    && (isLegacyTitlePendingWithoutReadbackEvidence(stage) || validExistingPartialReadbackEvidence(stage));
}

function exactReadbackStage(stage, { actionId, operation, nodeRef, scopeRef, owner }) {
  return Boolean(stage && stage.actionId === actionId && (!operation || stage.operation === operation)
    && nodeRef?.nodePathKey === stage.nodeRef?.nodePathKey && nodeRef?.candidateId === stage.nodeRef?.candidateId
    && isDeepStrictEqual(normalizeScopeRef(scopeRef, stage.operation, nodeRef), stage.scopeRef)
    && readOnlyStageOwnerMatches(stage, owner));
}

function readReportStructureStage({ directory, reportIdentity, actionId, operation, nodeRef, scopeRef, owner }) {
  const { record } = readJournal(directory, reportIdentity);
  if (!exactStage(record.structureStage, { actionId, operation, nodeRef, scopeRef, owner })) throw new Error("REPORT_PENDING_VERIFY");
  return JSON.parse(JSON.stringify(record.structureStage));
}

function readCurrentReportStructureStage({ directory, reportIdentity, nodeRef, owner, expectedStatus }) {
  const { record } = readJournal(directory, reportIdentity);
  const stage = record.structureStage;
  if (!stage || !OPERATIONS.has(stage.operation) || !validNodeRef(stage.nodeRef)
    || !readOnlyStageOwnerMatches(stage, owner)
    || !validNodeRef(nodeRef) || nodeRef.nodePathKey !== stage.nodeRef.nodePathKey || nodeRef.candidateId !== stage.nodeRef.candidateId
    || expectedStatus && stage.status !== expectedStatus) throw new Error("REPORT_PENDING_VERIFY");
  const scopeRef = normalizeScopeRef(stage.scopeRef, stage.operation, stage.nodeRef);
  if (!isDeepStrictEqual(scopeRef, stage.scopeRef) || !ACTION_ID.test(stage.actionId || "")
    || !/^report-tree-[a-f0-9]{32}$/.test(stage.snapshot?.snapshotId || "") || !/^[a-f0-9]{64}$/.test(stage.snapshot?.sha256 || "")
    || !Number.isInteger(stage.snapshot?.bytes)) throw new Error("REPORT_PENDING_VERIFY");
  return JSON.parse(JSON.stringify(stage));
}

function readCurrentReportStructurePartialStage({ directory, reportIdentity, nodeRef, owner }) {
  const { record } = readJournal(directory, reportIdentity);
  const stage = record.structureStage;
  const createdNodeRef = stage?.resolution?.createdNodeRef;
  const evidencePresent = Boolean(stage?.resolution && Object.hasOwn(stage.resolution, "partialReadbackEvidence"));
  const priorReadbackValid = validPriorStructurePartialResolution(stage)
    && (evidencePresent ? validExistingPartialReadbackEvidence(stage) : isLegacyTitlePendingWithoutReadbackEvidence(stage));
  if (!stage || !["structure_add_child", "structure_add_sibling"].includes(stage.operation) || stage.status !== "titlePending"
    || !priorReadbackValid || !readOnlyStageOwnerMatches(stage, owner) || !validNodeRef(nodeRef)
    || nodeRef.nodePathKey !== createdNodeRef?.nodePathKey || nodeRef.candidateId !== createdNodeRef?.candidateId
    ) throw new Error("REPORT_PENDING_VERIFY");
  const scopeRef = normalizeScopeRef(stage.scopeRef, stage.operation, stage.nodeRef);
  if (!isDeepStrictEqual(scopeRef, stage.scopeRef) || !ACTION_ID.test(stage.actionId || "")
    || !/^report-tree-[a-f0-9]{32}$/.test(stage.snapshot?.snapshotId || "") || !/^[a-f0-9]{64}$/.test(stage.snapshot?.sha256 || "")
    || !Number.isInteger(stage.snapshot?.bytes)) throw new Error("REPORT_PENDING_VERIFY");
  return JSON.parse(JSON.stringify(stage));
}

function claimReportStructureReload({ directory, reportIdentity, actionId, operation, nodeRef, scopeRef, owner, reloadActionId }) {
  if (!ACTION_ID.test(reloadActionId || "")) throw new Error("REPORT_STRUCTURE_RELOAD_INVALID");
  const { file, stats, record } = readJournal(directory, reportIdentity);
  const stage = record.structureStage;
  if (!exactStage(stage, { actionId, operation, nodeRef, scopeRef, owner }) || stage.status !== "staged" || stage.reloadActionId) throw new Error("REPORT_PENDING_VERIFY");
  stage.status = "reloadClaimed";
  stage.reloadActionId = reloadActionId;
  stage.reloadClaimedAt = new Date().toISOString();
  replaceJournal(file, stats, record);
  return { reloadActionId, operation: stage.operation };
}

function recordReportStructureReloadRequested({ directory, reportIdentity, actionId, operation, nodeRef, scopeRef, owner, reloadActionId, documentTimeOrigin }) {
  const { file, stats, record } = readJournal(directory, reportIdentity);
  const stage = record.structureStage;
  if (!exactStage(stage, { actionId, operation, nodeRef, scopeRef, owner }) || stage.status !== "reloadClaimed" || stage.reloadActionId !== reloadActionId
    || !Number.isFinite(documentTimeOrigin) || documentTimeOrigin !== stage.origin.documentTimeOrigin) throw new Error("REPORT_PENDING_VERIFY");
  stage.status = "reloadRequested";
  stage.reloadRequestedAt = new Date().toISOString();
  replaceJournal(file, stats, record);
  return { reloadRequested: true, reloadActionId };
}

function sameNode(a, b, nodePathKey) {
  return Boolean(a && b && b.nodePathKey === nodePathKey
    && a.candidateId === b.candidateId && a.label === b.label
    && typeof a.expanded === "boolean" && typeof b.expanded === "boolean");
}

function sameSubtree(before, after, newPath) {
  return Boolean(sameNode(before, after, newPath) && Array.isArray(before.children) && Array.isArray(after.children)
    && before.children.length === after.children.length
    && before.children.every((child, index) => sameSubtree(child, after.children[index], newPath + "/" + index)));
}

function containsNodeId(nodes, candidateId) {
  return nodes.some((node) => node.candidateId === candidateId || containsNodeId(node.children || [], candidateId));
}

function collectNodeIds(node, target = new Set()) {
  target.add(node.candidateId);
  for (const child of node.children || []) collectNodeIds(child, target);
  return target;
}

function sameScopeRef(actual, expected) {
  if (!actual || actual.kind !== expected.kind) return false;
  if (expected.kind === "treeRoot") return actual.scopePath === "";
  const actualScopePath = actual.scopePath === undefined ? actual.nodePathKey : actual.scopePath;
  return actualScopePath === expected.scopePath && actual.nodePathKey === expected.nodePathKey && actual.candidateId === expected.candidateId
    && (expected.label === undefined || actual.label === expected.label);
}

function sameScopeTarget(actual, expected) {
  if (expected === null) return actual === null;
  return Boolean(actual && expected && actual.nodePathKey === expected.nodePathKey && actual.candidateId === expected.candidateId
    && actual.label === expected.label && typeof actual.expanded === "boolean" && typeof expected.expanded === "boolean");
}

function verifyStructureReadback(stage, baseline, observed) {
  const observedKind = "structure_scope_read";
  if (!observed || observed.complete !== true || observed.operationIndex !== stage.operationIndex || observed.operationKind !== observedKind
    || observed.scopePath !== stage.scopeRef.scopePath || !sameScopeRef(observed.scopeRef, stage.scopeRef)
    || !Array.isArray(observed.siblings)) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const scopePath = baseline.scopePath;
  const valid = observed.siblings.every((node, index) => validSubtree(node, scopedPath(scopePath, index), true));
  if (!valid || !uniqueTreeIds(observed.siblings)) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  if (stage.operation === "structure_add_child") {
    if (!sameScopeTarget(observed.target, baseline.scopeTarget) || observed.siblings.length !== baseline.siblings.length + 1) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
    if (!baseline.siblings.every((node, index) => sameSubtree(node, observed.siblings[index], scopedPath(scopePath, index)))) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
    const added = observed.siblings[observed.siblings.length - 1];
    if (!validSubtree(added, scopedPath(scopePath, observed.siblings.length - 1), true)
      || containsNodeId(observed.siblings, observed.target.candidateId)) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
    return { added, titlePending: added.label !== stage.intendedTitle };
  }
  if (stage.operation === "structure_add_sibling") {
    const anchorIndex = Number(stage.nodeRef.nodePathKey.slice(stage.nodeRef.nodePathKey.lastIndexOf("/") + 1));
    if (!sameScopeTarget(observed.target, baseline.scopeTarget) || observed.siblings.length !== baseline.siblings.length + 1) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
    for (let index = 0; index < baseline.siblings.length; index += 1) {
      if (index === anchorIndex) {
        if (!sameSubtree(baseline.siblings[index], observed.siblings[index], scopedPath(scopePath, index))) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
      } else {
        const shifted = index > anchorIndex ? index + 1 : index;
        if (!sameSubtree(baseline.siblings[index], observed.siblings[shifted], scopedPath(scopePath, shifted))) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
      }
    }
    const added = observed.siblings[anchorIndex + 1];
    if (!validSubtree(added, scopedPath(scopePath, anchorIndex + 1), true) || added.candidateId === stage.nodeRef.candidateId) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
    return { added, titlePending: added.label !== stage.intendedTitle };
  }
  const deletedIds = collectNodeIds(baseline.target);
  if (!sameScopeTarget(observed.target, baseline.scopeTarget) || observed.siblings.length !== baseline.siblings.length - 1
    || stage.scopeRef.kind === "node" && containsNodeId(observed.siblings, stage.scopeRef.candidateId)
    || [...deletedIds].some((candidateId) => containsNodeId(observed.siblings, candidateId))) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const targetIndex = Number(stage.nodeRef.nodePathKey.slice(stage.nodeRef.nodePathKey.lastIndexOf("/") + 1));
  for (let index = 0; index < baseline.siblings.length; index += 1) {
    if (index === targetIndex) continue;
    const shifted = index > targetIndex ? index - 1 : index;
    if (!sameSubtree(baseline.siblings[index], observed.siblings[shifted], scopedPath(scopePath, shifted))) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  }
  return { added: null, titlePending: false };
}

function writeArchive(directory, record) {
  const archiveDirectory = path.join(directory, "resolved");
  fs.mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  const directoryStats = fs.lstatSync(archiveDirectory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink() || (process.platform !== "win32" && (directoryStats.mode & 0o077) !== 0)) throw new Error("REPORT_PENDING_DIRECTORY_UNSAFE");
  const archiveId = "resolution-" + randomBytes(16).toString("hex");
  const archive = path.join(archiveDirectory, archiveId + ".json");
  let descriptor;
  try {
    descriptor = fs.openSync(archive, "wx", 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(record), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
  } catch (cause) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(archive); } catch {}
    throw cause;
  }
  return { archiveId, archive };
}

function archiveReportStructureAfterReloadReadback({ directory, reportIdentity, actionId, operation, nodeRef, scopeRef, owner, reloadActionId, snapshotDirectory, snapshot, observedTreeSnapshot, origin }) {
  const { file, stats, record } = readJournal(directory, reportIdentity);
  const stage = record.structureStage;
  if (!exactReadbackStage(stage, { actionId, operation, nodeRef, scopeRef, owner }) || stage.status !== "reloadRequested" || stage.reloadActionId !== reloadActionId
    || !validOrigin(origin) || origin.documentTimeOrigin <= stage.origin.documentTimeOrigin
    || stage.origin.pageOrigin && origin.pageOrigin !== stage.origin.pageOrigin
    || !isDeepStrictEqual(stage.snapshot, { snapshotId: snapshot?.snapshotId, sha256: snapshot?.sha256, bytes: snapshot?.bytes })) throw new Error("REPORT_RELOAD_REQUIRED");
  const baseline = readBaseline({ snapshotDirectory, snapshot, reportIdentity, nodeRef, scopeRef: stage.scopeRef, operationIndex: stage.operationIndex, operation: stage.operation });
  const result = verifyStructureReadback(stage, baseline, observedTreeSnapshot);
  const partialReadbackEvidence = result.titlePending && result.added ? {
    type: "verified-structure-scope-readback",
    operationIndex: stage.operationIndex,
    scopeRef: JSON.parse(JSON.stringify(stage.scopeRef)),
    reloadActionId,
    snapshot: { snapshotId: stage.snapshot.snapshotId, sha256: stage.snapshot.sha256 },
    observedTreeSha256: createHash("sha256").update(JSON.stringify(observedTreeSnapshot)).digest("hex"),
    documentTimeOrigin: origin.documentTimeOrigin,
    createdNodeRef: { nodePathKey: result.added.nodePathKey, candidateId: result.added.candidateId },
    placeholderLabelVerified: DEFAULT_PLACEHOLDER_LABEL.test(result.added.label) && result.added.label !== stage.intendedTitle,
  } : null;
  const createdNodeRef = result.added ? { nodePathKey: result.added.nodePathKey, candidateId: result.added.candidateId } : undefined;
  const resolution = {
    type: "structure-saved-after-reload-readback",
    structureStatus: "saved",
    partial: result.titlePending,
    titleStatus: result.titlePending ? "pending-verification" : "verified",
    titlePending: result.titlePending,
    operationComplete: !result.titlePending,
    operation: stage.operation,
    operationIndex: stage.operationIndex,
    nodeRef: stage.nodeRef,
    ...(createdNodeRef ? { createdNodeRef } : {}),
    ...(partialReadbackEvidence ? { partialReadbackEvidence } : {}),
    snapshotId: snapshot.snapshotId,
    owner: { bindingId: owner.bindingId, tabId: owner.tabId },
    origin: normalizedOrigin(origin),
    reloadActionId,
    verifiedAt: new Date().toISOString(),
  };
  assertJournalUnchanged(file, stats);
  const archive = writeArchive(directory, { ...record, resolution });
  try {
    if (result.titlePending) {
      stage.status = "titlePending";
      stage.resolution = resolution;
      replaceJournal(file, stats, record);
    } else if (record.settingsStage) {
      delete record.structureStage;
      record.structureResolutions = [...(Array.isArray(record.structureResolutions) ? record.structureResolutions : []), resolution];
      replaceJournal(file, stats, record);
    } else {
      assertJournalUnchanged(file, stats);
      fs.unlinkSync(file);
    }
  } catch (cause) {
    try { fs.unlinkSync(archive.archive); } catch {}
    throw cause;
  }
  return {
    archiveId: archive.archiveId,
    structureStatus: "saved",
    titlePending: result.titlePending,
    operationComplete: !result.titlePending,
    actionComplete: !result.titlePending && !record.settingsStage,
    createdNodeRef,
  };
}

function isExactBlankEditorModel(model) {
  if (!model || typeof model !== "object" || Array.isArray(model) || model.type !== "doc"
    || !Array.isArray(model.content) || model.content.length !== 1
    || Object.keys(model).some((key) => !["type", "content"].includes(key))) return false;
  const paragraph = model.content[0];
  if (!paragraph || typeof paragraph !== "object" || Array.isArray(paragraph) || paragraph.type !== "paragraph"
    || Object.keys(paragraph).some((key) => !["type", "content", "attrs"].includes(key))) return false;
  const attributes = paragraph.attrs;
  const validIndent = (value) => value === null || Number.isInteger(value) && value >= 0 && value <= 4
    || typeof value === "string" && value.length <= 2 && /^[0-4]$/.test(value);
  const validLineHeight = (value) => {
    if (value === null || value === "normal") return true;
    if (typeof value === "number") return Number.isFinite(value) && value >= 0.5 && value <= 3;
    if (typeof value !== "string" || value.length > 12) return false;
    const numeric = value.match(/^(\d+(?:\.\d{1,2})?)(%|px)?$/);
    if (!numeric) return false;
    const number = Number(numeric[1]);
    return numeric[2] === "%" ? number >= 50 && number <= 300
      : numeric[2] === "px" ? number >= 8 && number <= 48
        : number >= 0.5 && number <= 3;
  };
  const validTextAlign = (value) => value === null || ["left", "center", "right", "justify", "start", "end"].includes(value);
  const validators = { indent: validIndent, lineHeight: validLineHeight, textAlign: validTextAlign };
  if (attributes !== undefined && (!attributes || typeof attributes !== "object" || Array.isArray(attributes)
    || Object.keys(attributes).length > 3 || Object.keys(attributes).some((key) => !Object.hasOwn(validators, key) || !validators[key](attributes[key])))) return false;
  return (!Object.hasOwn(paragraph, "content") || Array.isArray(paragraph.content) && paragraph.content.length === 0);
}

function archiveReportStructurePartialAfterReadback({ directory, reportIdentity, nodeRef, owner, snapshotDirectory, snapshot, observedTreeSnapshot, observedNode, editor, editorModel, documentTimeOrigin, security }) {
  const { file, stats, record } = readJournal(directory, reportIdentity);
  const stage = record.structureStage;
  const prior = stage?.resolution;
  const priorEvidencePresent = Boolean(prior && Object.hasOwn(prior, "partialReadbackEvidence"));
  const priorReadbackValid = validPriorStructurePartialResolution(stage)
    && (priorEvidencePresent ? validExistingPartialReadbackEvidence(stage) : isLegacyTitlePendingWithoutReadbackEvidence(stage));
  if (!stage || !["structure_add_child", "structure_add_sibling"].includes(stage.operation) || stage.status !== "titlePending"
    || !readOnlyStageOwnerMatches(stage, owner) || !validNodeRef(nodeRef)
    || nodeRef.nodePathKey !== prior?.createdNodeRef?.nodePathKey || nodeRef.candidateId !== prior?.createdNodeRef?.candidateId
    || prior?.type !== "structure-saved-after-reload-readback" || prior.structureStatus !== "saved"
    || prior.titlePending !== true || prior.operationComplete !== false || prior.reloadActionId !== stage.reloadActionId
    || !priorReadbackValid
    || !isDeepStrictEqual(stage.snapshot, { snapshotId: snapshot?.snapshotId, sha256: snapshot?.sha256, bytes: snapshot?.bytes })
    || record.stage || record.saveActionId || record.saveDocumentTimeOrigin) throw new Error("REPORT_PENDING_VERIFY");
  if (security?.readOnly !== true || security?.writesPerformed !== false || !validOrigin({ documentTimeOrigin: stage.origin.documentTimeOrigin, pageOrigin: stage.origin.pageOrigin })
    || !Number.isFinite(documentTimeOrigin) || documentTimeOrigin <= stage.origin.documentTimeOrigin
    || !Number.isFinite(editorModel?.documentTimeOrigin) || editorModel.documentTimeOrigin !== documentTimeOrigin
    || editor?.modelAvailable !== true || editor.modelEditable !== false || editor.domEditable !== "false"
    || !["containment", "node-id", "node-id-token"].includes(editor.association)
    || editor.saveControlAvailable !== false || !/^sha256:[a-f0-9]{64}$/.test(editor.modelHash || "")
    || !isExactBlankEditorModel(editorModel?.model)
    || `sha256:${createHash("sha256").update(JSON.stringify(editorModel.model)).digest("hex")}` !== editor.modelHash) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const scopeRef = normalizeScopeRef(stage.scopeRef, stage.operation, stage.nodeRef);
  const baseline = readBaseline({ snapshotDirectory, snapshot, reportIdentity, nodeRef: stage.nodeRef, scopeRef, operationIndex: stage.operationIndex, operation: stage.operation });
  const verified = verifyStructureReadback(stage, baseline, observedTreeSnapshot);
  const added = verified.added;
  if (!verified.titlePending || !added || added.children.length !== 0 || !DEFAULT_PLACEHOLDER_LABEL.test(added.label)
    || added.label === stage.intendedTitle || added.nodePathKey !== nodeRef.nodePathKey || added.candidateId !== nodeRef.candidateId
    || observedNode?.nodePathKey !== added.nodePathKey || observedNode?.candidateId !== added.candidateId || observedNode?.label !== added.label
    || !observedTreeSnapshot || observedTreeSnapshot.complete !== true) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const createdNodeRef = { nodePathKey: added.nodePathKey, candidateId: added.candidateId };
  const scopeDigest = createHash("sha256").update(JSON.stringify(observedTreeSnapshot)).digest("hex");
  const resolution = {
    type: "structure-partial-title-not-executed-after-empty-model-readback",
    structureStatus: "saved",
    partial: true,
    titleStatus: "not-executed",
    titlePending: true,
    titleNotExecuted: true,
    operationComplete: false,
    actionComplete: false,
    operation: stage.operation,
    operationIndex: stage.operationIndex,
    nodeRef: stage.nodeRef,
    createdNodeRef,
    reloadActionId: stage.reloadActionId,
    snapshot: { snapshotId: stage.snapshot.snapshotId, sha256: stage.snapshot.sha256 },
    partialEvidence: {
      type: "verified-structure-scope-and-empty-readonly-model",
      scopeRef: JSON.parse(JSON.stringify(scopeRef)),
      observedTreeSha256: scopeDigest,
      placeholderLabel: added.label,
      placeholderLabelVerified: true,
      emptyModelVerified: true,
      readonlyModelVerified: true,
      saveControlAbsent: true,
      modelHash: editor.modelHash,
      documentTimeOrigin,
      reloadActionId: stage.reloadActionId,
    },
    owner: { bindingId: owner.bindingId, tabId: owner.tabId },
    verifiedAt: new Date().toISOString(),
  };
  assertJournalUnchanged(file, stats);
  const archive = writeArchive(directory, { ...record, resolution });
  try {
    if (record.settingsStage) {
      delete record.structureStage;
      record.structureResolutions = [...(Array.isArray(record.structureResolutions) ? record.structureResolutions : []), resolution];
      replaceJournal(file, stats, record);
    } else {
      assertJournalUnchanged(file, stats);
      fs.unlinkSync(file);
    }
  } catch (cause) {
    try { fs.unlinkSync(archive.archive); } catch {}
    throw cause;
  }
  return {
    archiveId: archive.archiveId,
    structureStatus: "saved",
    partial: true,
    titlePending: true,
    titleNotExecuted: true,
    operationComplete: false,
    actionComplete: false,
    structurePendingReleased: true,
    reportPendingRetained: Boolean(record.settingsStage),
    createdNodeRef,
  };
}

module.exports = {
  stageReportStructurePending,
  readReportStructureStage,
  readCurrentReportStructureStage,
  readCurrentReportStructurePartialStage,
  claimReportStructureReload,
  recordReportStructureReloadRequested,
  archiveReportStructureAfterReloadReadback,
  archiveReportStructurePartialAfterReadback,
};
