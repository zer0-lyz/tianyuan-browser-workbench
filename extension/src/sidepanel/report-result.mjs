const sensitive = /(?:cookie|authorization|token|password|密码|验证码)/i;
const settingLabels = new Set(["节点条件", "节点类型", "大纲级别", "是否分段", "是否编号", "编号样式", "是否设置分隔符"]);

function safeText(value, max = 120) {
  if (typeof value !== "string" || value.length > max || sensitive.test(value)) return null;
  return value;
}

function safeHash(value) {
  return typeof value === "string" && /^(?:fnv1a32:[0-9a-f]{8}|sha256:[0-9a-f]{64})$/.test(value) ? value : null;
}

function safeNodeRef(value) {
  if (!value || typeof value !== "object") return null;
  const nodePathKey = typeof value.nodePathKey === "string" && /^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/.test(value.nodePathKey) ? value.nodePathKey : null;
  const label = safeText(value.label, 120);
  const candidateId = typeof value.candidateId === "string" && /^[A-Za-z0-9:_-]{1,200}$/.test(value.candidateId) && !sensitive.test(value.candidateId) ? value.candidateId : null;
  return nodePathKey && label ? { nodePathKey, label, candidateId } : null;
}

function safeReadback(value) {
  if (!value || typeof value !== "object") return null;
  const output = {};
  const hash = safeHash(value.hash);
  if (hash) output.hash = hash;
  const modelHash = safeHash(value.modelHash);
  if (modelHash && modelHash.startsWith("sha256:")) output.modelHash = modelHash;
  if (typeof value.modelChanged === "boolean") output.modelChanged = value.modelChanged;
  if (value.formatScopeVerified === true) output.formatScopeVerified = true;
  if (value.settingsDialogOpen === true) output.settingsDialogOpen = true;
  if (value.targetVerified === true) output.targetVerified = true;
  if (typeof value.submissionAttempted === "boolean") output.submissionAttempted = value.submissionAttempted;
  if (typeof value.settingsDialogClosed === "boolean") output.settingsDialogClosed = value.settingsDialogClosed;
  if (Array.isArray(value.expectedFields)) {
    const expectedFields = value.expectedFields.slice(0, 1).filter((field) => field?.label === "是否编号" && field.value === "是");
    if (expectedFields.length) output.expectedFields = expectedFields.map((field) => ({ label: field.label, value: field.value }));
  }
  if (["toolbar", "inline-icon"].includes(value.via)) output.via = value.via;
  if (Array.isArray(value.fields)) output.fields = value.fields.slice(0, 12).flatMap((field) => {
    if (!settingLabels.has(field?.label) || !Array.isArray(field.selected)) return [];
    const selected = field.selected.slice(0, 12).map((item) => safeText(item, 80)).filter((item) => item !== null);
    return [{ label: field.label, selected }];
  });
  return Object.keys(output).length ? output : null;
}

export function sanitizeReportFailure(value, actionType) {
  const fallback = /^report_[a-z_]{1,80}$/.test(actionType || "") ? `${actionType.toUpperCase()}_FAILED` : "REPORT_ACTION_FAILED";
  const reason = /^(?:REPORT_[A-Z0-9_]{1,80}|AGENT_CONTROL_REVOKED)$/.test(value?.reason || "") ? value.reason : fallback;
  const status = ["pendingVerify", "failed"].includes(value?.status) ? value.status : "failed";
  const writesPerformed = value?.security?.writesPerformed === true;
  const output = { ok: false, reason, status, security: { readOnly: !writesPerformed, writesPerformed, credentialsReturned: false } };
  if (value?.uiStateChanged === true || value?.security?.uiStateChanged === true) output.security.uiStateChanged = true;
  if (value?.modelUnchangedVerified === true) output.modelUnchangedVerified = true;
  if (status === "pendingVerify" && !writesPerformed) output.security.writeOutcomeUncertain = true;
  if (Number.isInteger(value?.executed) && value.executed >= 0 && value.executed <= 50) output.executed = value.executed;
  if (typeof value?.planHashConsumed === "boolean") output.planHashConsumed = value.planHashConsumed;
  if (typeof value?.confirmDialogPresent === "boolean") output.confirmDialogPresent = value.confirmDialogPresent;
  if (typeof value?.uiEvidence?.present === "boolean") output.uiEvidence = { present: value.uiEvidence.present };
  if (Number.isFinite(value?.documentTimeOrigin) && value.documentTimeOrigin > 0) output.documentTimeOrigin = value.documentTimeOrigin;
  if (typeof value?.submissionAttempted === "boolean") output.submissionAttempted = value.submissionAttempted;
  if (Array.isArray(value?.expectedFields)) {
    const expectedFields = value.expectedFields.slice(0, 1).filter((field) => field?.label === "是否编号" && field.value === "是");
    if (expectedFields.length) output.expectedFields = expectedFields.map((field) => ({ label: field.label, value: field.value }));
  }
  const hash = safeHash(value?.contentHashAfter);
  if (hash) output.contentHashAfter = hash;
  if (Array.isArray(value?.ops)) output.ops = value.ops.slice(0, 50).map((item) => {
    const op = { index: Number.isInteger(item?.index) ? item.index : null };
    if (["settings_open", "settings_write", "editor_text", "editor_command", "structure_add", "structure_add_child", "structure_add_sibling", "structure_copy", "structure_move", "structure_delete"].includes(item?.kind)) op.kind = item.kind;
    if (/^REPORT_[A-Z0-9_]{1,80}$/.test(item?.error || "")) op.error = item.error;
    const nodeRef = safeNodeRef(item?.nodeRef);
    if (nodeRef) op.nodeRef = nodeRef;
    return op;
  });
  if (Array.isArray(value?.results)) output.results = value.results.slice(0, 50).map((item) => {
    const result = { index: Number.isInteger(item?.index) ? item.index : null, status: ["saved", "pendingVerify", "failed", "skipped"].includes(item?.status) ? item.status : "failed" };
    if (["settings_open", "settings_write", "editor_text", "editor_command", "structure_add", "structure_add_child", "structure_add_sibling", "structure_copy", "structure_move", "structure_delete"].includes(item?.kind)) result.kind = item.kind;
    if (/^REPORT_[A-Z0-9_]{1,80}$/.test(item?.error || "")) result.error = item.error;
    const readback = safeReadback(item?.readback);
    if (readback) result.readback = readback;
    const createdNodeRef = safeNodeRef(item?.createdNodeRef);
    if (createdNodeRef) result.createdNodeRef = createdNodeRef;
    if (typeof item?.linkage?.renumberAffected === "boolean" && typeof item?.linkage?.tocAffected === "boolean") result.linkage = { renumberAffected: item.linkage.renumberAffected, tocAffected: item.linkage.tocAffected };
    return result;
  });
  return output;
}
