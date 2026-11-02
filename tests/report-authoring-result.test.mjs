import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeReportFailure } from "../extension/src/sidepanel/report-result.mjs";

test("failed editor opening preserves the UI state change without leaking content", () => {
  const result = sanitizeReportFailure({ reason: "REPORT_EDITOR_NOT_FOUND", uiStateChanged: true, privateText: "合成正文" }, "report_editor_open");
  assert.equal(result.security.uiStateChanged, true);
  assert.equal(result.security.writesPerformed, false);
  assert.equal(JSON.stringify(result).includes("合成正文"), false);
});

test("unverified search preserves its UI state warning", () => {
  const result = sanitizeReportFailure({ reason: "REPORT_SEARCH_UNVERIFIED", uiStateChanged: true }, "report_navigate");
  assert.equal(result.reason, "REPORT_SEARCH_UNVERIFIED");
  assert.equal(result.security.uiStateChanged, true);
  assert.equal(result.security.writesPerformed, false);
});

test("pending report result retains bounded verification evidence without content", () => {
  const result = sanitizeReportFailure({
    ok: false,
    reason: "REPORT_PERSISTENCE_UNVERIFIED",
    status: "pendingVerify",
    executed: 1,
    planHashConsumed: true,
    contentHashAfter: "fnv1a32:1234abcd",
    security: { writesPerformed: true, cookie: "secret-cookie" },
    results: [{ index: 0, status: "pendingVerify", readback: { hash: "fnv1a32:8765abcd", textPreview: "full report body", modelChanged: true }, createdNodeRef: { nodePathKey: "1/2", label: "测试节点", candidateId: "node-12" }, linkage: { renumberAffected: true, tocAffected: false, observedPattern: "sensitive" } }],
  }, "report_execute");
  assert.equal(result.status, "pendingVerify");
  assert.equal(result.reason, "REPORT_PERSISTENCE_UNVERIFIED");
  assert.equal(result.executed, 1);
  assert.equal(result.planHashConsumed, true);
  assert.equal(result.contentHashAfter, "fnv1a32:1234abcd");
  assert.deepEqual(result.results[0].readback, { hash: "fnv1a32:8765abcd", modelChanged: true });
  assert.deepEqual(result.results[0].createdNodeRef, { nodePathKey: "1/2", label: "测试节点", candidateId: "node-12" });
  assert.deepEqual(result.results[0].linkage, { renumberAffected: true, tocAffected: false });
  assert.equal(JSON.stringify(result).includes("secret-cookie"), false);
  assert.equal(JSON.stringify(result).includes("full report body"), false);
});

test("unsafe errors, identifiers, settings and toast content are not forwarded", () => {
  const result = sanitizeReportFailure({
    reason: "token=not-a-code", status: "pendingVerify", uiEvidence: { present: true, sample: "password=secret" },
    results: [{ index: 0, status: "pendingVerify", error: "Cookie=secret", createdNodeRef: { nodePathKey: "../escape", label: "password=secret", candidateId: "token-secret" }, readback: { fields: [{ label: "节点类型", selected: ["正文", "token-secret"] }, { label: "password", selected: ["secret"] }] } }],
  }, "report_execute");
  assert.equal(result.reason, "REPORT_EXECUTE_FAILED");
  assert.equal(result.security.writeOutcomeUncertain, true);
  assert.deepEqual(result.uiEvidence, { present: true });
  assert.deepEqual(result.results[0].readback.fields, [{ label: "节点类型", selected: ["正文"] }]);
  assert.equal(result.results[0].createdNodeRef, undefined);
  assert.equal(result.results[0].error, undefined);
  assert.doesNotMatch(JSON.stringify(result), /secret|password|cookie/i);
});

test("pending write forwards only valid SHA-256 model evidence", () => {
  const modelHash = `sha256:${"a".repeat(64)}`;
  const makeResult = (value) => sanitizeReportFailure({ status: "pendingVerify", results: [{ index: 0, status: "pendingVerify", readback: { modelHash: value, textPreview: "private" } }] }, "report_execute");
  assert.equal(makeResult(modelHash).results[0].readback.modelHash, modelHash);
  assert.equal(makeResult("sha256:password").results[0].readback, undefined);
  assert.equal(JSON.stringify(makeResult(modelHash)).includes("private"), false);
});

test("save evidence forwards only a valid document origin", () => {
  const result = sanitizeReportFailure({ status: "pendingVerify", reason: "REPORT_SAVE_UNVERIFIED", documentTimeOrigin: 12345, security: { writesPerformed: true } }, "report_editor_save");
  assert.equal(result.documentTimeOrigin, 12345);
  assert.equal(sanitizeReportFailure({ documentTimeOrigin: "12345" }, "report_editor_save").documentTimeOrigin, undefined);
});

test("settings submission evidence and failed confirmation status pass through safely", () => {
  const result = sanitizeReportFailure({
    status: "pendingVerify",
    reason: "REPORT_PERSISTENCE_UNVERIFIED",
    submissionAttempted: true,
    documentTimeOrigin: 12345,
    expectedFields: [{ label: "是否编号", value: "是" }],
    security: { writesPerformed: true },
    results: [{
      index: 0,
      kind: "settings_write",
      status: "pendingVerify",
      error: "REPORT_SETTINGS_CONFIRM_TIMEOUT",
      readback: {
        submissionAttempted: true,
        settingsDialogClosed: false,
        fields: [{ label: "是否编号", selected: ["是"] }],
      },
    }],
  }, "report_execute");
  assert.equal(result.status, "pendingVerify");
  assert.equal(result.submissionAttempted, true);
  assert.equal(result.documentTimeOrigin, 12345);
  assert.deepEqual(result.expectedFields, [{ label: "是否编号", value: "是" }]);
  assert.equal(result.results[0].error, "REPORT_SETTINGS_CONFIRM_TIMEOUT");
  assert.deepEqual(result.results[0].readback.fields, [{ label: "是否编号", selected: ["是"] }]);
  assert.equal(result.results[0].readback.settingsDialogClosed, false);
});

test("invalid preview retains per-node error without forwarding before or after text", () => {
  const result = sanitizeReportFailure({ reason: "REPORT_PLAN_INVALID", ops: [{ index: 0, kind: "editor_text", error: "REPORT_EDITOR_AMBIGUOUS", nodeRef: { nodePathKey: "0", label: "测试节点", candidateId: "node-1" }, before: "private text", after: "private text" }] }, "report_preview");
  assert.equal(result.reason, "REPORT_PLAN_INVALID");
  assert.equal(result.ops[0].error, "REPORT_EDITOR_AMBIGUOUS");
  assert.equal(result.ops[0].nodeRef.candidateId, "node-1");
  assert.equal(JSON.stringify(result).includes("private text"), false);
});
