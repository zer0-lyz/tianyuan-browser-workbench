"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomBytes } = require("node:crypto");

const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const NODE_ID = /^[A-Za-z0-9:_-]{1,200}$/;
const NODE_PATH = /^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/;

function saveReportSnapshot({ directory, reportIdentity, nodeRef, model }) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) throw new Error("REPORT_SNAPSHOT_DIRECTORY_INVALID");
  if (!["projectId", "companyId", "reportType", "reportDetailId"].every((key) => ID.test(reportIdentity?.[key] || ""))
    || !["add", "edit"].includes(reportIdentity?.mode)) throw new Error("REPORT_SNAPSHOT_IDENTITY_INVALID");
  if (!NODE_PATH.test(nodeRef?.nodePathKey || "") || !NODE_ID.test(nodeRef?.candidateId || "")) throw new Error("REPORT_SNAPSHOT_NODE_INVALID");
  if (!model || typeof model !== "object" || Array.isArray(model) || model.type !== "doc") throw new Error("REPORT_SNAPSHOT_MODEL_INVALID");
  const identity = { projectId: reportIdentity.projectId, companyId: reportIdentity.companyId, reportType: reportIdentity.reportType, mode: reportIdentity.mode, reportDetailId: reportIdentity.reportDetailId };
  const snapshot = JSON.stringify({ version: 1, reportIdentity: identity, nodeRef: { nodePathKey: nodeRef.nodePathKey, candidateId: nodeRef.candidateId }, model });
  const bytes = Buffer.from(snapshot, "utf8");
  if (bytes.length > MAX_SNAPSHOT_BYTES) throw new Error("REPORT_SNAPSHOT_TOO_LARGE");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryStats = fs.lstatSync(directory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink() || (process.platform !== "win32" && (directoryStats.mode & 0o077) !== 0)) throw new Error("REPORT_SNAPSHOT_DIRECTORY_UNSAFE");
  const snapshotId = `report-${randomBytes(16).toString("hex")}`;
  const file = path.join(directory, `${snapshotId}.json`);
  let descriptor;
  try {
    descriptor = fs.openSync(file, "wx", 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } catch (cause) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
      try { fs.unlinkSync(file); } catch {}
    }
    throw cause;
  }
  fs.closeSync(descriptor);
  return { snapshotId, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

function saveReportTreeSnapshot({ directory, reportIdentity, nodeRef, operationIndex, operationKind, treeSnapshot }) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) throw new Error("REPORT_SNAPSHOT_DIRECTORY_INVALID");
  if (!["projectId", "companyId", "reportType", "reportDetailId"].every((key) => ID.test(reportIdentity?.[key] || ""))
    || !["add", "edit"].includes(reportIdentity?.mode)) throw new Error("REPORT_SNAPSHOT_IDENTITY_INVALID");
  if (!NODE_PATH.test(nodeRef?.nodePathKey || "") || !NODE_ID.test(nodeRef?.candidateId || "")) throw new Error("REPORT_SNAPSHOT_NODE_INVALID");
  if (!Number.isInteger(operationIndex) || operationIndex < 0 || operationIndex >= 50
    || !(operationKind === "settings_open" || operationKind === "settings_write" || ["structure_add", "structure_add_child", "structure_add_sibling", "structure_copy", "structure_move", "structure_delete"].includes(operationKind))) throw new Error("REPORT_SNAPSHOT_OPERATION_INVALID");
  if (!treeSnapshot || typeof treeSnapshot !== "object" || Array.isArray(treeSnapshot)) throw new Error("REPORT_TREE_SNAPSHOT_INVALID");
  const identity = { projectId: reportIdentity.projectId, companyId: reportIdentity.companyId, reportType: reportIdentity.reportType, mode: reportIdentity.mode, reportDetailId: reportIdentity.reportDetailId };
  let bytes;
  try {
    bytes = Buffer.from(JSON.stringify({ version: 1, type: "tree", reportIdentity: identity, nodeRef: { nodePathKey: nodeRef.nodePathKey, candidateId: nodeRef.candidateId }, operationIndex, operationKind, treeSnapshot }), "utf8");
  } catch { throw new Error("REPORT_TREE_SNAPSHOT_INVALID"); }
  if (bytes.length > MAX_SNAPSHOT_BYTES) throw new Error("REPORT_SNAPSHOT_TOO_LARGE");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryStats = fs.lstatSync(directory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink() || (process.platform !== "win32" && (directoryStats.mode & 0o077) !== 0)) throw new Error("REPORT_SNAPSHOT_DIRECTORY_UNSAFE");
  const snapshotId = `report-tree-${randomBytes(16).toString("hex")}`;
  const file = path.join(directory, `${snapshotId}.json`);
  let descriptor;
  try {
    descriptor = fs.openSync(file, "wx", 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } catch (cause) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
      try { fs.unlinkSync(file); } catch {}
    }
    throw cause;
  }
  fs.closeSync(descriptor);
  return { snapshotId, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

function verifiedSnapshotBytes(directory, snapshot) {
  if (typeof directory !== "string" || !path.isAbsolute(directory) || !/^report-[a-f0-9]{32}$/.test(snapshot?.snapshotId || "") || !/^[a-f0-9]{64}$/.test(snapshot?.sha256 || "")) return null;
  try {
    const file = path.join(directory, `${snapshot.snapshotId}.json`);
    const stats = fs.lstatSync(file);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_SNAPSHOT_BYTES || stats.size !== snapshot.bytes) return null;
    const bytes = fs.readFileSync(file);
    return bytes.length === stats.size && createHash("sha256").update(bytes).digest("hex") === snapshot.sha256 ? bytes : null;
  } catch { return null; }
}

function verifyReportSnapshot(directory, snapshot) {
  return verifiedSnapshotBytes(directory, snapshot) !== null;
}

function readReportSnapshot({ directory, snapshot, reportIdentity, nodeRef }) {
  const bytes = verifiedSnapshotBytes(directory, snapshot);
  if (!bytes) throw new Error("REPORT_SNAPSHOT_INVALID");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("REPORT_SNAPSHOT_INVALID"); }
  if (value?.version !== 1 || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => typeof reportIdentity?.[key] === "string" && reportIdentity[key] === value.reportIdentity?.[key])
    || nodeRef?.nodePathKey !== value.nodeRef?.nodePathKey || nodeRef?.candidateId !== value.nodeRef?.candidateId || value.model?.type !== "doc") throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  return value.model;
}

function readReportTreeSnapshot({ directory, snapshot, reportIdentity, nodeRef, operationIndex, operationKind }) {
  if (typeof directory !== "string" || !path.isAbsolute(directory) || !/^report-tree-[a-f0-9]{32}$/.test(snapshot?.snapshotId || "") || !/^[a-f0-9]{64}$/.test(snapshot?.sha256 || "")) throw new Error("REPORT_SNAPSHOT_INVALID");
  let bytes;
  try {
    const file = path.join(directory, `${snapshot.snapshotId}.json`);
    const stats = fs.lstatSync(file);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_SNAPSHOT_BYTES || stats.size !== snapshot.bytes) throw new Error();
    bytes = fs.readFileSync(file);
    if (bytes.length !== stats.size || createHash("sha256").update(bytes).digest("hex") !== snapshot.sha256) throw new Error();
  } catch { throw new Error("REPORT_SNAPSHOT_INVALID"); }
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("REPORT_SNAPSHOT_INVALID"); }
  if (value?.version !== 1 || value?.type !== "tree" || !["projectId", "companyId", "reportType", "mode", "reportDetailId"].every((key) => typeof reportIdentity?.[key] === "string" && reportIdentity[key] === value.reportIdentity?.[key])
    || nodeRef?.nodePathKey !== value.nodeRef?.nodePathKey || nodeRef?.candidateId !== value.nodeRef?.candidateId
    || operationIndex !== value.operationIndex || operationKind !== value.operationKind || !value.treeSnapshot || typeof value.treeSnapshot !== "object" || Array.isArray(value.treeSnapshot)) throw new Error("REPORT_SNAPSHOT_TARGET_MISMATCH");
  return value.treeSnapshot;
}

module.exports = { saveReportSnapshot, saveReportTreeSnapshot, verifyReportSnapshot, readReportSnapshot, readReportTreeSnapshot, MAX_SNAPSHOT_BYTES };
