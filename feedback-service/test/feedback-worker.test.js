import assert from "node:assert/strict";
import test from "node:test";
import { createFeedbackWorker } from "../src/worker.js";

const origin = "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc";

function payload(overrides = {}) {
  return {
    type: "feature",
    title: "增加批量检查",
    description: "希望支持批量检查状态",
    steps: "",
    diagnostics: null,
    privacyConfirmed: true,
    ...overrides,
  };
}

function request(body = payload(), requestOrigin = origin) {
  return new Request("https://feedback.example/api/feedback", {
    method: "POST",
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
      "cf-connecting-ip": "192.0.2.1",
    },
    body: JSON.stringify(body),
  });
}

test("stores a validated feedback record without returning private content", async () => {
  const stored = [];
  const worker = createFeedbackWorker({
    now: () => new Date("2026-07-28T08:00:00.000Z"),
    storeFactory: () => ({
      async consumeRateLimit() {
        return { allowed: true, retryAfterMs: 0 };
      },
      async createFeedback(value) {
        stored.push(value);
      },
    }),
  });
  const response = await worker.fetch(request(), {
    FEEDBACK_ALLOWED_EXTENSION_IDS: "lkflndcnklpeaejohaacoaolnmhgigoc",
    RATE_LIMIT_PEPPER: "test-only-pepper",
  });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.ok, true);
  assert.match(result.feedbackId, /^TYF-20260728-/);
  assert.deepEqual(Object.keys(result).sort(), ["feedbackId", "ok"]);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].description, "希望支持批量检查状态");
});

test("rejects unknown origins and rate limited clients", async () => {
  const store = {
    async consumeRateLimit() {
      return { allowed: false, retryAfterMs: 30_000 };
    },
    async createFeedback() {
      throw new Error("must not store");
    },
  };
  const worker = createFeedbackWorker({ storeFactory: () => store });
  const env = {
    FEEDBACK_ALLOWED_EXTENSION_IDS: "lkflndcnklpeaejohaacoaolnmhgigoc",
    RATE_LIMIT_PEPPER: "test-only-pepper",
  };
  const forbidden = await worker.fetch(
    request(payload(), "https://evil.example"),
    env,
  );
  assert.equal(forbidden.status, 403);
  const limited = await worker.fetch(request(), env);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "30");
});

test("health endpoint exposes no stored feedback", async () => {
  const worker = createFeedbackWorker();
  const response = await worker.fetch(
    new Request("https://feedback.example/health"),
    {},
  );
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "tianyuan-workbench-feedback",
    storage: "private",
  });
});
