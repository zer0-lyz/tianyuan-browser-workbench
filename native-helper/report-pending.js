"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { createHash, randomBytes } = require("node:crypto");
const { readReportSnapshot, readReportTreeSnapshot, saveReportSnapshot } = require("./report-snapshot.js");

function pendingFile(directory, reportIdentity) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) throw new Error("REPORT_PENDING_DIRECTORY_INVALID");
  const fields = ["projectId", "companyId", "reportType", "mode", "reportDetailId"];
  if (!fields.every((key) => typeof reportIdentity?.[key] === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(reportIdentity[key]))) throw new Error("REPORT_PENDING_IDENTITY_INVALID");
  const key = createHash("sha256").update(JSON.stringify(fields.map((field) => reportIdentity[field]))).digest("hex");
  return path.join(directory, `${key}.json`);
}

function sameReportIdentity(record, reportIdentity) {
  return ["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => record?.reportIdentity?.[key] === reportIdentity?.[key]);
}

function hasReportPending(directory, reportIdentity) {
  const file = pendingFile(directory, reportIdentity);
  try { fs.lstatSync(file); return true; } catch (cause) { if (cause.code === "ENOENT") return false; throw cause; }
}

function orphanReportSaveActionId({ directory, reportIdentity }) {
  const file = pendingFile(directory, reportIdentity);
  let record;
  try { record = JSON.parse(fs.readFileSync(file, "utf8")); } catch (cause) { if (cause.code === "ENOENT") return null; throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (record.version !== 1 || record.state !== "pendingVerify" || record.action !== "report_editor_save"
    || record.stage || record.saveActionId || record.reloadActionId
    || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => record.reportIdentity?.[key] === reportIdentity[key])
    || !/^action_[A-Za-z0-9_-]{1,100}$/.test(record.actionId || "")) return null;
  return record.actionId;
}

function readReportStage({ directory, reportIdentity, nodeRef, owner }) {
  const file = pendingFile(directory, reportIdentity);
  let record;
  try { record = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  const stage = record.stage;
  if (record.version !== 1 || record.state !== "staged" || !stage
    || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => record.reportIdentity?.[key] === reportIdentity[key])
    || !["nodePathKey", "candidateId"].every((key) => stage.nodeRef?.[key] && stage.nodeRef[key] === nodeRef?.[key])
    || !["sessionId", "sessionEpoch", "bindingId", "controlEpoch", "tabId"].every((key) => stage.owner?.[key] === owner?.[key])
    || !/^sha256:[0-9a-f]{64}$/.test(stage.modelHash || "")) throw new Error("REPORT_PENDING_VERIFY");
  return { file, record, modelHash: stage.modelHash };
}

function replacePendingRecord(file, record) {
  const original = fs.lstatSync(file);
  if (!original.isFile() || original.isSymbolicLink()) throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  const temp = `${file}.${randomBytes(16).toString("hex")}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(record), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    const current = fs.lstatSync(file);
    if (current.dev !== original.dev || current.ino !== original.ino || current.size !== original.size || current.mtimeMs !== original.mtimeMs) throw new Error("REPORT_PENDING_JOURNAL_CHANGED");
    fs.renameSync(temp, file);
  } catch (cause) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(temp); } catch {}
    throw cause;
  }
}

function readPendingRecord(directory, reportIdentity) {
  const file = pendingFile(directory, reportIdentity);
  let stats;
  let record;
  try {
    stats = fs.lstatSync(file);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("invalid");
    record = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (record?.version !== 1 || !sameReportIdentity(record, reportIdentity)) throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  return { file, stats, record };
}

function validNodeRef(nodeRef) {
  return Boolean(nodeRef && /^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/.test(nodeRef.nodePathKey || "")
    && /^[A-Za-z0-9:_-]{1,200}$/.test(nodeRef.candidateId || ""));
}

function validOwner(owner) {
  return Boolean(owner && ["sessionId", "sessionEpoch", "bindingId", "controlEpoch"].every((key) => typeof owner[key] === "string" && owner[key])
    && Number.isInteger(owner.tabId) && owner.tabId > 0);
}

function settingsStageOwnerMatches(stage, owner) {
  return validOwner(owner)
    && ["sessionId", "bindingId", "controlEpoch", "tabId"].every((key) => stage.owner?.[key] === owner[key])
    && (stage.owner?.sessionEpoch === owner.sessionEpoch
      || (stage.reloadRequested === true && /^action_[A-Za-z0-9_-]{1,100}$/.test(stage.reloadActionId || "")));
}

function normalizedNodeRef(nodeRef) {
  return { nodePathKey: nodeRef.nodePathKey, candidateId: nodeRef.candidateId, ...(typeof nodeRef.label === "string" ? { label: nodeRef.label } : {}) };
}

function archivePendingRecord(directory, pendingFilePath, originalStats, pending, resolution) {
  const archiveDirectory = path.join(directory, "resolved");
  fs.mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  const archiveStats = fs.lstatSync(archiveDirectory);
  if (!archiveStats.isDirectory() || archiveStats.isSymbolicLink() || (process.platform !== "win32" && (archiveStats.mode & 0o077) !== 0)) throw new Error("REPORT_PENDING_DIRECTORY_UNSAFE");
  const archiveId = `resolution-${randomBytes(16).toString("hex")}`;
  const archive = path.join(archiveDirectory, `${archiveId}.json`);
  let descriptor;
  try {
    descriptor = fs.openSync(archive, "wx", 0o600);
    fs.writeFileSync(descriptor, JSON.stringify({ ...pending, resolution }), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    const current = fs.lstatSync(pendingFilePath);
    if (current.dev !== originalStats.dev || current.ino !== originalStats.ino || current.size !== originalStats.size || current.mtimeMs !== originalStats.mtimeMs) throw new Error("REPORT_PENDING_JOURNAL_CHANGED");
    fs.unlinkSync(pendingFilePath);
  } catch (cause) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(archive); } catch {}
    throw cause;
  }
  return { archiveId };
}

function stageReportPending({ directory, reportIdentity, actionId, nodeRef, owner, modelHash }) {
  const file = pendingFile(directory, reportIdentity);
  let record;
  try { record = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (record.version !== 1 || record.action !== "report_execute" || record.actionId !== actionId || record.state !== "pendingVerify" || record.saveActionId || record.stage
    || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => record.reportIdentity?.[key] === reportIdentity[key])
    || !/^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/.test(nodeRef?.nodePathKey || "")
    || !/^[A-Za-z0-9:_-]{1,200}$/.test(nodeRef?.candidateId || "")
    || !/^sha256:[0-9a-f]{64}$/.test(modelHash || "")
    || !owner || !["sessionId", "sessionEpoch", "bindingId", "controlEpoch"].every((key) => typeof owner[key] === "string" && owner[key])
    || !Number.isInteger(owner.tabId)) throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  record.state = "staged";
  record.stage = { nodeRef: { nodePathKey: nodeRef.nodePathKey, candidateId: nodeRef.candidateId }, owner, modelHash };
  replacePendingRecord(file, record);
}

function claimReportStageSave({ directory, reportIdentity, nodeRef, owner, actionId }) {
  if (!/^action_[A-Za-z0-9_-]{1,100}$/.test(actionId || "")) throw new Error("REPORT_PENDING_ACTION_INVALID");
  const stage = readReportStage({ directory, reportIdentity, nodeRef, owner });
  stage.record.state = "pendingVerify";
  stage.record.saveActionId = actionId;
  replacePendingRecord(stage.file, stage.record);
  return stage.modelHash;
}

function recordReportSaveDocument({ directory, reportIdentity, actionId, documentTimeOrigin }) {
  const file = pendingFile(directory, reportIdentity);
  let record;
  try { record = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (record.version !== 1 || record.state !== "pendingVerify" || record.saveActionId !== actionId || !record.stage
    || !Number.isFinite(documentTimeOrigin) || documentTimeOrigin <= 0) throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  record.saveDocumentTimeOrigin = documentTimeOrigin;
  replacePendingRecord(file, record);
}

function claimReportReload({ directory, reportIdentity, nodeRef, bindingId, tabId, actionId }) {
  const file = pendingFile(directory, reportIdentity);
  let record;
  try { record = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (record.version === 1 && sameReportIdentity(record, reportIdentity) && record.state === "pendingVerify" && record.action === "report_execute" && record.settingsStage) {
    const stage = record.settingsStage;
    if (!stage.submissionAttempted || stage.reloadActionId || stage.reloadRequested || stage.owner?.bindingId !== bindingId || stage.owner?.tabId !== tabId
      || !["nodePathKey", "candidateId"].every((key) => stage.nodeRef?.[key] === nodeRef?.[key])
      || !/^action_[A-Za-z0-9_-]{1,100}$/.test(actionId || "")) throw new Error("REPORT_PENDING_VERIFY");
    stage.reloadActionId = actionId;
    replacePendingRecord(file, record);
    return;
  }
  if (record.version !== 1 || record.state !== "pendingVerify" || !record.saveActionId || !record.stage || record.reloadActionId
    || !Number.isFinite(record.saveDocumentTimeOrigin) || record.saveDocumentTimeOrigin <= 0
    || record.stage.owner?.bindingId !== bindingId || record.stage.owner?.tabId !== tabId
    || !["nodePathKey", "candidateId"].every((key) => record.stage.nodeRef?.[key] === nodeRef?.[key])
    || !/^action_[A-Za-z0-9_-]{1,100}$/.test(actionId || "")) throw new Error("REPORT_PENDING_VERIFY");
  record.reloadActionId = actionId;
  replacePendingRecord(file, record);
}

function stageOrphanReportSave({ directory, reportIdentity, nodeRef, owner, actionId, modelHash, documentTimeOrigin }) {
  const file = pendingFile(directory, reportIdentity);
  let record;
  try { record = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (record.version !== 1 || record.state !== "pendingVerify" || record.action !== "report_editor_save" || record.actionId !== actionId
    || record.stage || record.saveActionId || record.reloadActionId
    || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => record.reportIdentity?.[key] === reportIdentity[key])
    || !/^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/.test(nodeRef?.nodePathKey || "")
    || !/^[A-Za-z0-9:_-]{1,200}$/.test(nodeRef?.candidateId || "")
    || !/^sha256:[0-9a-f]{64}$/.test(modelHash || "")
    || !Number.isFinite(documentTimeOrigin) || documentTimeOrigin <= 0
    || !owner || !["sessionId", "sessionEpoch", "bindingId", "controlEpoch"].every((key) => typeof owner[key] === "string" && owner[key])
    || !Number.isInteger(owner.tabId)) throw new Error("REPORT_PENDING_RECOVERY_MISMATCH");
  record.stage = { nodeRef: { nodePathKey: nodeRef.nodePathKey, candidateId: nodeRef.candidateId }, owner, modelHash };
  record.saveActionId = actionId;
  record.saveDocumentTimeOrigin = documentTimeOrigin;
  record.recovery = { type: "orphaned-editor-save", stagedAt: new Date().toISOString() };
  replacePendingRecord(file, record);
  return { modelHash, saveActionId: actionId };
}

function verifyReportSavedAfterReload({ directory, reportIdentity, nodeRef, snapshotDirectory, model, observedModelHash, documentTimeOrigin, bindingId, tabId }) {
  const file = pendingFile(directory, reportIdentity);
  let record;
  try { record = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (record.version !== 1 || record.state !== "pendingVerify" || !record.saveActionId || !record.stage
    || !Number.isFinite(record.saveDocumentTimeOrigin) || !Number.isFinite(documentTimeOrigin)
    || documentTimeOrigin <= record.saveDocumentTimeOrigin
    || record.stage.owner?.bindingId !== bindingId || record.stage.owner?.tabId !== tabId
    || !["nodePathKey", "candidateId"].every((key) => record.stage.nodeRef?.[key] === nodeRef?.[key])) throw new Error("REPORT_RELOAD_REQUIRED");
  const actual = `sha256:${createHash("sha256").update(JSON.stringify(model)).digest("hex")}`;
  if (actual !== observedModelHash || actual !== record.stage.modelHash) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const snapshot = saveReportSnapshot({ directory: snapshotDirectory, reportIdentity, nodeRef, model });
  return archiveReportPendingAfterSavedReadback({ directory, reportIdentity, nodeRef, snapshotDirectory, snapshot, observedModelHash, saveActionId: record.saveActionId });
}

function stageLegacyAppend({ directory, reportIdentity, nodeRef, owner, actionId, snapshotDirectory, originalSnapshot, currentSnapshot, appendedText, confirmText }) {
  if (confirmText !== "确认保存报告" || typeof appendedText !== "string" || !appendedText || appendedText.length > 20000
    || /(?:cookie|authorization|token|password|密码|验证码)/i.test(appendedText)) throw new Error("REPORT_CONFIRM_TEXT_INVALID");
  const original = readReportSnapshot({ directory: snapshotDirectory, snapshot: originalSnapshot, reportIdentity, nodeRef });
  const current = readReportSnapshot({ directory: snapshotDirectory, snapshot: currentSnapshot, reportIdentity, nodeRef });
  const reverted = structuredClone(current);
  function lastText(node) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node.content)) {
      for (let index = node.content.length - 1; index >= 0; index -= 1) {
        const found = lastText(node.content[index]);
        if (found) return found;
      }
    }
    return node.type === "text" && typeof node.text === "string" ? node : null;
  }
  const last = lastText(reverted);
  if (!last || !last.text.endsWith(appendedText)) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  last.text = last.text.slice(0, -appendedText.length);
  if (JSON.stringify(reverted) !== JSON.stringify(original)) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const modelHash = `sha256:${createHash("sha256").update(JSON.stringify(current)).digest("hex")}`;
  stageReportPending({ directory, reportIdentity, actionId, nodeRef, owner, modelHash });
  return { modelHash };
}

function markReportPending({ directory, reportIdentity, actionId, action, settingsOpen, settingsWriteIntent }) {
  const file = pendingFile(directory, reportIdentity);
  if (!/^action_[A-Za-z0-9_-]{1,100}$/.test(actionId || "") || !["report_execute", "report_save", "report_editor_save", "report_editor_command", "report_editor_open", "report_editor_close"].includes(action)) throw new Error("REPORT_PENDING_ACTION_INVALID");
  const validPlanHash = (value) => /^plan-[0-9a-f]{32}$/.test(value || "");
  const validateSettingsIntent = (intent) => Boolean(intent && validNodeRef(intent.nodeRef) && validOwner(intent.owner)
    && validPlanHash(intent.planHash) && Array.isArray(intent.expectedFields) && intent.expectedFields.length === 1
    && intent.expectedFields[0]?.label === "是否编号" && intent.expectedFields[0]?.value === "是");
  if ((settingsOpen && (!validNodeRef(settingsOpen.nodeRef) || !validOwner(settingsOpen.owner) || !validPlanHash(settingsOpen.planHash)))
    || (settingsWriteIntent && !validateSettingsIntent(settingsWriteIntent))) throw new Error("REPORT_PENDING_ACTION_INVALID");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stats = fs.lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (process.platform !== "win32" && (stats.mode & 0o077) !== 0)) throw new Error("REPORT_PENDING_DIRECTORY_UNSAFE");
  const fields = ["projectId", "companyId", "reportType", "mode", "reportDetailId"];
  const identity = Object.fromEntries(fields.map((field) => [field, reportIdentity[field]]));
  const record = { version: 1, reportIdentity: identity, actionId, action, state: "pendingVerify", createdAt: new Date().toISOString() };
  if (settingsOpen) record.settingsOpen = { nodeRef: normalizedNodeRef(settingsOpen.nodeRef), owner: settingsOpen.owner, planHash: settingsOpen.planHash };
  if (settingsWriteIntent) record.settingsWriteIntent = { nodeRef: normalizedNodeRef(settingsWriteIntent.nodeRef), owner: settingsWriteIntent.owner, planHash: settingsWriteIntent.planHash, expectedFields: settingsWriteIntent.expectedFields };
  const payload = JSON.stringify(record);
  let descriptor;
  try {
    descriptor = fs.openSync(file, "wx", 0o600);
    fs.writeFileSync(descriptor, payload, "utf8");
    fs.fsyncSync(descriptor);
  } catch (cause) {
    if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch {} try { fs.unlinkSync(file); } catch {} }
    if (cause.code === "EEXIST") throw new Error("REPORT_PENDING_VERIFY");
    throw cause;
  }
  fs.closeSync(descriptor);
}

function recordReportSettingsStage({ directory, reportIdentity, actionId, nodeRef, owner, planHash, expectedFields, submissionAttempted, documentTimeOrigin, submitActionId }) {
  const { file, record } = readPendingRecord(directory, reportIdentity);
  const intent = record.settingsWriteIntent;
  if (record.version !== 1 || !sameReportIdentity(record, reportIdentity) || record.state !== "pendingVerify" || record.action !== "report_execute" || record.actionId !== actionId
    || !intent || !validNodeRef(nodeRef) || !validOwner(owner) || !/^plan-[0-9a-f]{32}$/.test(planHash || "")
    || submissionAttempted !== true || submitActionId !== actionId || !Number.isFinite(documentTimeOrigin) || documentTimeOrigin <= 0
    || intent.planHash !== planHash || !["nodePathKey", "candidateId"].every((key) => intent.nodeRef?.[key] === nodeRef?.[key])
    || !["sessionId", "sessionEpoch", "bindingId", "controlEpoch", "tabId"].every((key) => intent.owner?.[key] === owner?.[key])
    || !isDeepStrictEqual(intent.expectedFields, expectedFields)
    || !Array.isArray(expectedFields) || expectedFields.length !== 1 || expectedFields[0]?.label !== "是否编号" || expectedFields[0]?.value !== "是"
    || record.settingsStage) throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  record.settingsStage = {
    nodeRef: normalizedNodeRef(nodeRef), owner, planHash, expectedFields,
    documentTimeOrigin, submitActionId, submissionAttempted: true,
  };
  replacePendingRecord(file, record);
}

function canReopenReportSettings({ directory, reportIdentity, nodeRef, owner }) {
  const { record } = readPendingRecord(directory, reportIdentity);
  const stage = record.settingsStage;
  return Boolean(record.version === 1 && record.state === "pendingVerify" && record.action === "report_execute"
    && stage && stage.submissionAttempted === true && stage.reloadActionId && stage.reloadRequested === true
    && /^action_[A-Za-z0-9_-]{1,100}$/.test(stage.reloadActionId) && stage.submitActionId === record.actionId
    && Number.isFinite(stage.documentTimeOrigin) && stage.documentTimeOrigin > 0
    && Array.isArray(stage.expectedFields) && stage.expectedFields.length === 1 && stage.expectedFields[0]?.label === "是否编号" && stage.expectedFields[0]?.value === "是"
    && validNodeRef(nodeRef) && validOwner(owner)
    && ["nodePathKey", "candidateId"].every((key) => stage.nodeRef?.[key] === nodeRef?.[key])
    && settingsStageOwnerMatches(stage, owner));
}

function readReportSettingsStage({ directory, reportIdentity, nodeRef, owner }) {
  const { record } = readPendingRecord(directory, reportIdentity);
  const stage = record.settingsStage;
  if (record.version !== 1 || !sameReportIdentity(record, reportIdentity) || record.state !== "pendingVerify" || record.action !== "report_execute" || !stage
    || !validNodeRef(nodeRef) || !validOwner(owner)
    || stage.submissionAttempted !== true || stage.submitActionId !== record.actionId || !Number.isFinite(stage.documentTimeOrigin) || stage.documentTimeOrigin <= 0
    || !Array.isArray(stage.expectedFields) || stage.expectedFields.length !== 1 || stage.expectedFields[0]?.label !== "是否编号" || stage.expectedFields[0]?.value !== "是"
    || !["nodePathKey", "candidateId"].every((key) => stage.nodeRef?.[key] === nodeRef?.[key])
    || !settingsStageOwnerMatches(stage, owner)) throw new Error("REPORT_PENDING_VERIFY");
  return stage;
}

function recordReportReloadRequested({ directory, reportIdentity, nodeRef, bindingId, tabId, actionId }) {
  const { file, record } = readPendingRecord(directory, reportIdentity);
  const stage = record.settingsStage;
  if (!stage) return false;
  if (!stage || stage.reloadActionId !== actionId || stage.owner?.bindingId !== bindingId || stage.owner?.tabId !== tabId
    || !sameReportIdentity(record, reportIdentity)
    || !["nodePathKey", "candidateId"].every((key) => stage.nodeRef?.[key] === nodeRef?.[key])) throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  stage.reloadRequested = true;
  stage.reloadRequestedAt = new Date().toISOString();
  replacePendingRecord(file, record);
  return true;
}

function archiveReportPendingAfterSettingsOpen({ directory, reportIdentity, actionId, nodeRef, owner, planHash, dialogOpen, targetVerified }) {
  const { file, stats, record } = readPendingRecord(directory, reportIdentity);
  const opened = record.settingsOpen;
  if (record.version !== 1 || record.state !== "pendingVerify" || record.action !== "report_execute" || record.actionId !== actionId
    || !opened || !validNodeRef(nodeRef) || !validOwner(owner) || !/^plan-[0-9a-f]{32}$/.test(planHash || "")
    || dialogOpen !== true || targetVerified !== true || opened.planHash !== planHash
    || !["nodePathKey", "candidateId"].every((key) => opened.nodeRef?.[key] === nodeRef?.[key])
    || !["sessionId", "sessionEpoch", "bindingId", "controlEpoch", "tabId"].every((key) => opened.owner?.[key] === owner?.[key])) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const archived = archivePendingRecord(directory, file, stats, record, {
    type: "settings-open-verified-not-saved",
    nodeRef: normalizedNodeRef(nodeRef),
    planHash,
    settingsDialogOpen: true,
    targetVerified: true,
    saved: false,
    verifiedAt: new Date().toISOString(),
  });
  return { archiveId: archived.archiveId, saved: false };
}

function archiveReportPendingAfterSettingsReadback({ directory, reportIdentity, nodeRef, owner, reloadActionId, documentTimeOrigin, settings }) {
  const { file, stats, record } = readPendingRecord(directory, reportIdentity);
  const stage = record.settingsStage;
  if (record.version !== 1 || record.state !== "pendingVerify" || record.action !== "report_execute" || !stage
    || !stage.submissionAttempted || !stage.reloadRequested || stage.reloadActionId !== reloadActionId
    || !/^action_[A-Za-z0-9_-]{1,100}$/.test(reloadActionId || "")
    || !validNodeRef(nodeRef) || !validOwner(owner)
    || !["nodePathKey", "candidateId"].every((key) => stage.nodeRef?.[key] === nodeRef?.[key])
    || !settingsStageOwnerMatches(stage, owner)
    || !Number.isFinite(documentTimeOrigin) || documentTimeOrigin <= stage.documentTimeOrigin
    || settings?.available !== true || !Array.isArray(settings.fields)) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  for (const expected of stage.expectedFields || []) {
    const observed = settings.fields.filter((field) => field?.label === expected.label);
    if (observed.length !== 1 || !Array.isArray(observed[0].selected) || !isDeepStrictEqual(observed[0].selected, [expected.value])) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  }
  if (!Array.isArray(stage.expectedFields) || stage.expectedFields.length !== 1 || stage.expectedFields[0]?.label !== "是否编号" || stage.expectedFields[0]?.value !== "是") throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  const archived = archivePendingRecord(directory, file, stats, record, {
    type: "settings-saved-after-reload-readback",
    nodeRef: normalizedNodeRef(nodeRef),
    settings: stage.expectedFields,
    documentTimeOrigin,
    reloadActionId,
    submitActionId: stage.submitActionId,
    verifiedAt: new Date().toISOString(),
  });
  return { archiveId: archived.archiveId, settings: stage.expectedFields };
}

function clearReportPendingAfterNoWrite({ directory, reportIdentity, actionId }) {
  const file = pendingFile(directory, reportIdentity);
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (value?.version !== 1 || value.actionId !== actionId || value.state !== "pendingVerify") throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  fs.unlinkSync(file);
}

function archiveReportPendingAfterNoWrite({ directory, reportIdentity, actionId, evidenceCode, nodeRef, snapshotDirectory, snapshot, operationIndex, operationKind, observedTreeSnapshot }) {
  const file = pendingFile(directory, reportIdentity);
  let pending;
  let originalStats;
  try {
    originalStats = fs.lstatSync(file);
    if (!originalStats.isFile() || originalStats.isSymbolicLink()) throw new Error("invalid");
    pending = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  const allowedEvidence = new Set(["REPORT_STRUCTURE_CONTROL_NOT_FOUND", "REPORT_TREE_ROW_CONTROL_LAYOUT_MISMATCH"]);
  if (pending?.version !== 1 || pending.state !== "pendingVerify" || pending.action !== "report_execute" || pending.actionId !== actionId
    || pending.stage || pending.saveActionId || pending.reloadActionId || !allowedEvidence.has(evidenceCode)
    || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => pending.reportIdentity?.[key] === reportIdentity?.[key])) {
    throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  }
  const expectedTreeSnapshot = readReportTreeSnapshot({ directory: snapshotDirectory, snapshot, reportIdentity, nodeRef, operationIndex, operationKind });
  const expectedHash = createHash("sha256").update(JSON.stringify(expectedTreeSnapshot)).digest("hex");
  const observedHash = createHash("sha256").update(JSON.stringify(observedTreeSnapshot)).digest("hex");
  if (expectedHash !== observedHash) throw new Error("REPORT_PENDING_READBACK_MISMATCH");

  const archiveDirectory = path.join(directory, "resolved");
  fs.mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  const archiveStats = fs.lstatSync(archiveDirectory);
  if (!archiveStats.isDirectory() || archiveStats.isSymbolicLink() || (process.platform !== "win32" && (archiveStats.mode & 0o077) !== 0)) throw new Error("REPORT_PENDING_DIRECTORY_UNSAFE");
  const archiveId = `resolution-${randomBytes(16).toString("hex")}`;
  const archive = path.join(archiveDirectory, `${archiveId}.json`);
  const record = JSON.stringify({ ...pending, resolution: { type: "no-write-confirmed", evidenceCode, nodeRef: { nodePathKey: nodeRef.nodePathKey, candidateId: nodeRef.candidateId }, snapshotId: snapshot.snapshotId, treeSnapshotHash: expectedHash, verifiedAt: new Date().toISOString() } });
  let descriptor;
  try {
    descriptor = fs.openSync(archive, "wx", 0o600);
    fs.writeFileSync(descriptor, record, "utf8");
    fs.fsyncSync(descriptor);
  } catch (cause) {
    if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch {} try { fs.unlinkSync(archive); } catch {} }
    throw cause;
  }
  fs.closeSync(descriptor);
  const currentStats = fs.lstatSync(file);
  if (currentStats.dev !== originalStats.dev || currentStats.ino !== originalStats.ino || currentStats.size !== originalStats.size || currentStats.mtimeMs !== originalStats.mtimeMs) throw new Error("REPORT_PENDING_JOURNAL_CHANGED");
  fs.unlinkSync(file);
  return { archiveId, treeSnapshotHash: expectedHash };
}

function archiveReportPendingAfterChildReadback({ directory, reportIdentity, actionId, nodeRef, snapshotDirectory, snapshot, operationIndex, observedTreeSnapshot, actionStartDocumentTimeOrigin, documentTimeOrigin, owner }) {
  const file = pendingFile(directory, reportIdentity);
  let pending;
  let originalStats;
  try {
    originalStats = fs.lstatSync(file);
    if (!originalStats.isFile() || originalStats.isSymbolicLink()) throw new Error("invalid");
    pending = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (pending?.version !== 1 || pending.state !== "pendingVerify" || pending.action !== "report_execute" || pending.actionId !== actionId
    || !/^action_[A-Za-z0-9_-]{1,100}$/.test(actionId || "")
    || Object.hasOwn(pending, "stage") || Object.hasOwn(pending, "saveActionId") || Object.hasOwn(pending, "reloadActionId") || Object.hasOwn(pending, "saveDocumentTimeOrigin")
    || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => pending.reportIdentity?.[key] === reportIdentity?.[key])) {
    throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  }
  const createdAt = Date.parse(pending.createdAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(documentTimeOrigin) || documentTimeOrigin <= createdAt
    || actionStartDocumentTimeOrigin !== undefined && (!Number.isFinite(actionStartDocumentTimeOrigin) || actionStartDocumentTimeOrigin <= 0 || documentTimeOrigin <= actionStartDocumentTimeOrigin)
    || !owner || typeof owner.bindingId !== "string" || !/^[A-Za-z0-9:_-]{1,200}$/.test(owner.bindingId) || !Number.isInteger(owner.tabId) || owner.tabId <= 0) {
    throw new Error("REPORT_RELOAD_REQUIRED");
  }
  if (!Number.isInteger(operationIndex) || operationIndex < 0 || operationIndex >= 50) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  const originalTree = readReportTreeSnapshot({ directory: snapshotDirectory, snapshot, reportIdentity, nodeRef, operationIndex, operationKind: "structure_add_child" });
  const validNode = (node, requireCandidateId = false) => Boolean(node && typeof node === "object" && !Array.isArray(node)
    && /^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/.test(node.nodePathKey || "")
    && typeof node.candidateId === "string" && (!node.candidateId || /^[A-Za-z0-9:_-]{1,200}$/.test(node.candidateId))
    && (!requireCandidateId || /^[A-Za-z0-9:_-]{1,200}$/.test(node.candidateId))
    && typeof node.label === "string" && node.label.length > 0 && typeof node.expanded === "boolean");
  if (originalTree.complete !== true || originalTree.operationIndex !== operationIndex || originalTree.operationKind !== "structure_add_child"
    || originalTree.scopePath !== nodeRef?.nodePathKey || !validNode(originalTree.target, true)
    || originalTree.target.nodePathKey !== nodeRef.nodePathKey || originalTree.target.candidateId !== nodeRef.candidateId
    || !Array.isArray(originalTree.siblings) || originalTree.siblings.some((child, index) => !validNode(child)
      || child.nodePathKey !== `${originalTree.scopePath}/${index}`)) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  if (!observedTreeSnapshot || observedTreeSnapshot.complete !== true || observedTreeSnapshot.operationIndex !== operationIndex
    || observedTreeSnapshot.operationKind !== "structure_add_child" || observedTreeSnapshot.scopePath !== originalTree.scopePath
    || !isDeepStrictEqual(observedTreeSnapshot.target, originalTree.target) || !Array.isArray(observedTreeSnapshot.siblings)
    || observedTreeSnapshot.siblings.length !== originalTree.siblings.length + 1) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  if (observedTreeSnapshot.siblings.some((child, index) => !validNode(child)
    || child.nodePathKey !== `${observedTreeSnapshot.scopePath}/${index}`)) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  let oldIndex = 0;
  const added = [];
  for (const child of observedTreeSnapshot.siblings) {
    if (oldIndex < originalTree.siblings.length && isDeepStrictEqual(child, originalTree.siblings[oldIndex])) oldIndex += 1;
    else added.push(child);
  }
  if (oldIndex !== originalTree.siblings.length || added.length !== 1 || !validNode(added[0], true)) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const candidateIds = new Set([originalTree.target.candidateId]);
  for (const child of observedTreeSnapshot.siblings) {
    if (!child.candidateId) continue;
    if (candidateIds.has(child.candidateId)) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
    candidateIds.add(child.candidateId);
  }
  const refreshEvidence = {
    basis: actionStartDocumentTimeOrigin === undefined ? "pending-created-at" : "action-start-time-origin",
    documentTimeOrigin,
    createdAt: pending.createdAt,
    ...(actionStartDocumentTimeOrigin === undefined ? {} : { actionStartDocumentTimeOrigin }),
  };
  let originalHash;
  let observedHash;
  try {
    originalHash = createHash("sha256").update(JSON.stringify(originalTree)).digest("hex");
    observedHash = createHash("sha256").update(JSON.stringify(observedTreeSnapshot)).digest("hex");
  } catch { throw new Error("REPORT_PENDING_READBACK_MISMATCH"); }

  const archiveDirectory = path.join(directory, "resolved");
  fs.mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  const archiveStats = fs.lstatSync(archiveDirectory);
  if (!archiveStats.isDirectory() || archiveStats.isSymbolicLink() || (process.platform !== "win32" && (archiveStats.mode & 0o077) !== 0)) throw new Error("REPORT_PENDING_DIRECTORY_UNSAFE");
  const archiveId = `resolution-${randomBytes(16).toString("hex")}`;
  const archive = path.join(archiveDirectory, `${archiveId}.json`);
  const record = JSON.stringify({ ...pending, resolution: {
    type: "child-structure-saved-title-pending",
    structureStatus: "saved",
    titleStatus: "not-completed",
    explanation: "标题弹窗超时，标题尚未完成；本次仅确认新增子节点结构已保存，不确认标题或报告正文保存。",
    parentNodeRef: { nodePathKey: nodeRef.nodePathKey, candidateId: nodeRef.candidateId },
    childNodeRef: { nodePathKey: added[0].nodePathKey, candidateId: added[0].candidateId, label: added[0].label },
    snapshotId: snapshot.snapshotId,
    originalTreeSnapshotHash: originalHash,
    observedTreeSnapshotHash: observedHash,
    refreshEvidence,
    owner: { bindingId: owner.bindingId, tabId: owner.tabId },
    verifiedAt: new Date().toISOString(),
  } });
  let descriptor;
  try {
    descriptor = fs.openSync(archive, "wx", 0o600);
    fs.writeFileSync(descriptor, record, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    const currentStats = fs.lstatSync(file);
    if (currentStats.dev !== originalStats.dev || currentStats.ino !== originalStats.ino || currentStats.size !== originalStats.size || currentStats.mtimeMs !== originalStats.mtimeMs) throw new Error("REPORT_PENDING_JOURNAL_CHANGED");
    fs.unlinkSync(file);
  } catch (cause) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(archive); } catch {}
    throw cause;
  }
  return { archiveId, treeSnapshotHash: observedHash, childNodeRef: { nodePathKey: added[0].nodePathKey, candidateId: added[0].candidateId } };
}

function archiveReportPendingAfterSiblingMemoryReadback({ directory, reportIdentity, actionId, nodeRef, snapshotDirectory, snapshot, operationIndex, observedParentTree, owner }) {
  const file = pendingFile(directory, reportIdentity);
  let pending;
  let originalStats;
  try { originalStats = fs.lstatSync(file); if (!originalStats.isFile() || originalStats.isSymbolicLink()) throw new Error("invalid"); pending = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (pending?.version !== 1 || pending.state !== "pendingVerify" || pending.action !== "report_execute" || pending.actionId !== actionId
    || Object.hasOwn(pending, "stage") || Object.hasOwn(pending, "saveActionId") || Object.hasOwn(pending, "reloadActionId")
    || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => pending.reportIdentity?.[key] === reportIdentity?.[key])
    || !owner || typeof owner.bindingId !== "string" || !/^[A-Za-z0-9:_-]{1,200}$/.test(owner.bindingId) || !Number.isInteger(owner.tabId) || owner.tabId <= 0) {
    throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  }
  if (!Number.isInteger(operationIndex) || operationIndex < 0 || operationIndex >= 50) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  const original = readReportTreeSnapshot({ directory: snapshotDirectory, snapshot, reportIdentity, nodeRef, operationIndex, operationKind: "structure_add_sibling" });
  if (original.complete !== true || original.operationKind !== "structure_add_sibling" || original.scopePath !== nodeRef.nodePathKey.slice(0, nodeRef.nodePathKey.lastIndexOf("/"))
    || original.target?.nodePathKey !== nodeRef.nodePathKey || original.target?.candidateId !== nodeRef.candidateId
    || !Array.isArray(original.siblings) || !observedParentTree?.complete || observedParentTree.scopePath !== original.scopePath
    || !Array.isArray(observedParentTree.siblings) || observedParentTree.siblings.length !== original.siblings.length + 1) {
    throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  }
  let oldIndex = 0;
  const added = [];
  for (const child of observedParentTree.siblings) {
    if (oldIndex < original.siblings.length && isDeepStrictEqual(child, original.siblings[oldIndex])) oldIndex += 1;
    else added.push(child);
  }
  const anchorIndex = original.siblings.findIndex((child) => child.nodePathKey === nodeRef.nodePathKey && child.candidateId === nodeRef.candidateId);
  if (oldIndex !== original.siblings.length || added.length !== 1 || anchorIndex < 0
    || observedParentTree.siblings.indexOf(added[0]) !== anchorIndex + 1
    || !/^[A-Za-z0-9:_-]{1,200}$/.test(added[0].candidateId || "") || !added[0].label) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const archiveDirectory = path.join(directory, "resolved");
  fs.mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  const archiveId = `resolution-${randomBytes(16).toString("hex")}`;
  const archive = path.join(archiveDirectory, `${archiveId}.json`);
  const record = JSON.stringify({ ...pending, resolution: {
    type: "sibling-structure-in-memory-title-pending",
    structureStatus: "in-memory-verified",
    persistenceStatus: "not-verified",
    titleStatus: "not-completed",
    anchorNodeRef: { nodePathKey: nodeRef.nodePathKey, candidateId: nodeRef.candidateId },
    siblingNodeRef: { nodePathKey: added[0].nodePathKey, candidateId: added[0].candidateId, label: added[0].label },
    snapshotId: snapshot.snapshotId,
    owner: { bindingId: owner.bindingId, tabId: owner.tabId },
    verifiedAt: new Date().toISOString(),
  } });
  let descriptor;
  try {
    descriptor = fs.openSync(archive, "wx", 0o600);
    fs.writeFileSync(descriptor, record, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    const currentStats = fs.lstatSync(file);
    if (currentStats.dev !== originalStats.dev || currentStats.ino !== originalStats.ino || currentStats.size !== originalStats.size || currentStats.mtimeMs !== originalStats.mtimeMs) throw new Error("REPORT_PENDING_JOURNAL_CHANGED");
    fs.unlinkSync(file);
  } catch (cause) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(archive); } catch {}
    throw cause;
  }
  return { archiveId, siblingNodeRef: { nodePathKey: added[0].nodePathKey, candidateId: added[0].candidateId, label: added[0].label } };
}

function archiveReportPendingAfterOriginalReadback({ directory, reportIdentity, nodeRef, snapshotDirectory, snapshot, observedModelHash }) {
  const file = pendingFile(directory, reportIdentity);
  let pending;
  let originalStats;
  try {
    originalStats = fs.lstatSync(file);
    if (!originalStats.isFile() || originalStats.isSymbolicLink()) throw new Error("invalid");
    pending = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (pending?.version !== 1 || pending.state !== "pendingVerify" || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => pending.reportIdentity?.[key] === reportIdentity?.[key])) throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  const model = readReportSnapshot({ directory: snapshotDirectory, snapshot, reportIdentity, nodeRef });
  const expected = `sha256:${createHash("sha256").update(JSON.stringify(model)).digest("hex")}`;
  if (observedModelHash !== expected) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const archiveDirectory = path.join(directory, "resolved");
  fs.mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  const stats = fs.lstatSync(archiveDirectory);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (process.platform !== "win32" && (stats.mode & 0o077) !== 0)) throw new Error("REPORT_PENDING_DIRECTORY_UNSAFE");
  const archiveId = `resolution-${randomBytes(16).toString("hex")}`;
  const archive = path.join(archiveDirectory, `${archiveId}.json`);
  const record = JSON.stringify({ ...pending, resolution: { type: "original-model-readback", nodeRef: { nodePathKey: nodeRef.nodePathKey, candidateId: nodeRef.candidateId }, snapshotId: snapshot.snapshotId, modelHash: expected, verifiedAt: new Date().toISOString() } });
  let descriptor;
  try {
    descriptor = fs.openSync(archive, "wx", 0o600);
    fs.writeFileSync(descriptor, record, "utf8");
    fs.fsyncSync(descriptor);
  } catch (cause) {
    if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch {} try { fs.unlinkSync(archive); } catch {} }
    throw cause;
  }
  fs.closeSync(descriptor);
  const currentStats = fs.lstatSync(file);
  if (currentStats.dev !== originalStats.dev || currentStats.ino !== originalStats.ino || currentStats.size !== originalStats.size || currentStats.mtimeMs !== originalStats.mtimeMs) throw new Error("REPORT_PENDING_JOURNAL_CHANGED");
  fs.unlinkSync(file);
  return { archiveId, modelHash: expected };
}

function archiveReportPendingAfterSavedReadback({ directory, reportIdentity, nodeRef, snapshotDirectory, snapshot, observedModelHash, saveActionId }) {
  const file = pendingFile(directory, reportIdentity);
  let pending;
  let originalStats;
  try {
    originalStats = fs.lstatSync(file);
    if (!originalStats.isFile() || originalStats.isSymbolicLink()) throw new Error("invalid");
    pending = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { throw new Error("REPORT_PENDING_JOURNAL_INVALID"); }
  if (pending?.version !== 1 || pending.state !== "pendingVerify" || pending.saveActionId !== saveActionId || !pending.stage
    || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => pending.reportIdentity?.[key] === reportIdentity?.[key])
    || !["nodePathKey", "candidateId"].every((key) => pending.stage.nodeRef?.[key] === nodeRef?.[key])) throw new Error("REPORT_PENDING_JOURNAL_INVALID");
  const model = readReportSnapshot({ directory: snapshotDirectory, snapshot, reportIdentity, nodeRef });
  const expected = `sha256:${createHash("sha256").update(JSON.stringify(model)).digest("hex")}`;
  if (observedModelHash !== expected || pending.stage.modelHash !== expected) throw new Error("REPORT_PENDING_READBACK_MISMATCH");
  const archiveDirectory = path.join(directory, "resolved");
  fs.mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  const stats = fs.lstatSync(archiveDirectory);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (process.platform !== "win32" && (stats.mode & 0o077) !== 0)) throw new Error("REPORT_PENDING_DIRECTORY_UNSAFE");
  const archiveId = `resolution-${randomBytes(16).toString("hex")}`;
  const archive = path.join(archiveDirectory, `${archiveId}.json`);
  const record = JSON.stringify({ ...pending, resolution: { type: "saved-model-readback", snapshotId: snapshot.snapshotId, modelHash: expected, verifiedAt: new Date().toISOString() } });
  let descriptor;
  try {
    descriptor = fs.openSync(archive, "wx", 0o600);
    fs.writeFileSync(descriptor, record, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
  } catch (cause) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(archive); } catch {}
    throw cause;
  }
  const currentStats = fs.lstatSync(file);
  if (currentStats.dev !== originalStats.dev || currentStats.ino !== originalStats.ino || currentStats.size !== originalStats.size || currentStats.mtimeMs !== originalStats.mtimeMs) throw new Error("REPORT_PENDING_JOURNAL_CHANGED");
  fs.unlinkSync(file);
  return { archiveId, modelHash: expected };
}

module.exports = { hasReportPending, orphanReportSaveActionId, markReportPending, clearReportPendingAfterNoWrite, archiveReportPendingAfterNoWrite, archiveReportPendingAfterChildReadback, archiveReportPendingAfterSiblingMemoryReadback, archiveReportPendingAfterOriginalReadback, archiveReportPendingAfterSavedReadback, archiveReportPendingAfterSettingsOpen, archiveReportPendingAfterSettingsReadback, recordReportSettingsStage, canReopenReportSettings, readReportSettingsStage, recordReportReloadRequested, stageReportPending, readReportStage, claimReportStageSave, stageLegacyAppend, recordReportSaveDocument, verifyReportSavedAfterReload, claimReportReload, stageOrphanReportSave };
