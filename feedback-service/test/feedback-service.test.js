import assert from "node:assert/strict";
import test from "node:test";
import { createFeedbackApp } from "../src/app.js";
import { redactText } from "../src/redaction.js";
import { createRateLimiter } from "../src/rate-limit.js";
import { validateFeedbackPayload } from "../src/validation.js";

const origin = "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc";

test("validates the bounded allow-listed payload", () => {
  const result = validateFeedbackPayload({
    type: "bug",
    title: "无法加载公司清单",
    description: "点击加载后没有显示内容",
    steps: "打开工作台后点击加载",
    diagnostics: {
      version: "0.12.2",
      buildNumber: 2026072701,
      platform: "mac",
      architecture: "arm64",
      connectorConnected: true,
      mcpStatus: "connected",
      cliStatus: "connected",
    },
    privacyConfirmed: true,
  });
  assert.equal(result.type, "bug");
  assert.equal(result.diagnostics.version, "0.12.2");
  assert.throws(
    () => validateFeedbackPayload({ ...result, token: "secret" }),
    /UNKNOWN_FIELD:token/,
  );
});

test("redacts credentials and local paths", () => {
  const value = redactText(
    "Authorization: Bearer abcdefghijklmnop\n/Users/test/private/a.xlsx zhmcp_abcdefghijklmnop",
  );
  assert.equal(value.includes("abcdefghijklmnop"), false);
  assert.equal(value.includes("/Users/test"), false);
  assert.match(value, /REDACTED/);
});

test("creates a private issue through the injected GitHub App client", async () => {
  const calls = [];
  const app = createFeedbackApp({
    allowedOrigins: [origin],
    issueClient: {
      async createIssue(value) {
        calls.push(value);
        return { number: 17, html_url: "https://github.example/issues/17" };
      },
    },
    now: () => new Date("2026-07-26T08:00:00.000Z"),
  });
  const response = await app(new Request("https://feedback.example/api/feedback", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify({
      type: "feature",
      title: "增加批量检查",
      description: "希望支持批量检查状态",
      steps: "",
      diagnostics: null,
      privacyConfirmed: true,
    }),
  }));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.match(body.feedbackId, /^TYF-20260726-/);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].labels, ["feedback", "feature", "needs-triage"]);
});

test("rejects unknown origins and rate limits repeated requests", async () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: () => 1 });
  const app = createFeedbackApp({
    allowedOrigins: [origin],
    rateLimiter: limiter,
    issueClient: {
      async createIssue() {
        return { number: 1, html_url: "https://github.example/issues/1" };
      },
    },
  });
  const payload = JSON.stringify({
    type: "other",
    title: "测试",
    description: "测试说明",
    steps: "",
    diagnostics: null,
    privacyConfirmed: true,
  });
  const forbidden = await app(new Request("https://feedback.example/api/feedback", {
    method: "POST",
    headers: { origin: "https://evil.example" },
    body: payload,
  }));
  assert.equal(forbidden.status, 403);
  const first = await app(new Request("https://feedback.example/api/feedback", {
    method: "POST",
    headers: { origin, "x-forwarded-for": "1.1.1.1" },
    body: payload,
  }));
  assert.equal(first.status, 201);
  const second = await app(new Request("https://feedback.example/api/feedback", {
    method: "POST",
    headers: { origin, "x-forwarded-for": "1.1.1.1" },
    body: payload,
  }));
  assert.equal(second.status, 429);
});
