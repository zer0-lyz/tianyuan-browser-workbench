import { redactFeedback } from "./redaction.js";
import { validateFeedbackPayload } from "./validation.js";

function responseJson(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function allowedOrigins(env) {
  return new Set(
    String(env.FEEDBACK_ALLOWED_EXTENSION_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((id) => `chrome-extension://${id}`),
  );
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  return origin && allowedOrigins(env).has(origin)
    ? { "access-control-allow-origin": origin, vary: "Origin" }
    : {};
}

function feedbackId(now) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `TYF-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function clientHash(request, pepper) {
  const forwarded = String(request.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  const source = request.headers.get("cf-connecting-ip") || forwarded || "anonymous";
  const bytes = new TextEncoder().encode(`${pepper}:${source}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export class D1FeedbackStore {
  constructor(database) {
    this.database = database;
  }

  async consumeRateLimit(clientId, { nowMs, max, windowMs }) {
    const existing = await this.database
      .prepare(
        "SELECT window_started, request_count FROM feedback_rate_limits WHERE client_hash = ?",
      )
      .bind(clientId)
      .first();
    const sameWindow = existing
      && nowMs - Number(existing.window_started) < windowMs;
    const windowStarted = sameWindow
      ? Number(existing.window_started)
      : nowMs;
    const requestCount = sameWindow
      ? Number(existing.request_count) + 1
      : 1;
    await this.database
      .prepare(
        `INSERT INTO feedback_rate_limits
          (client_hash, window_started, request_count, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(client_hash) DO UPDATE SET
          window_started = excluded.window_started,
          request_count = excluded.request_count,
          updated_at = excluded.updated_at`,
      )
      .bind(clientId, windowStarted, requestCount, new Date(nowMs).toISOString())
      .run();
    return {
      allowed: requestCount <= max,
      retryAfterMs: Math.max(0, windowMs - (nowMs - windowStarted)),
    };
  }

  async createFeedback(feedback) {
    await this.database
      .prepare(
        `INSERT INTO feedback
          (id, type, title, description, steps, diagnostics_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`,
      )
      .bind(
        feedback.id,
        feedback.type,
        feedback.title,
        feedback.description,
        feedback.steps,
        feedback.diagnostics ? JSON.stringify(feedback.diagnostics) : null,
        feedback.createdAt,
      )
      .run();
  }
}

export function createFeedbackWorker({
  storeFactory = (env) => new D1FeedbackStore(env.FEEDBACK_DB),
  now = () => new Date(),
} = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return responseJson({
          ok: true,
          service: "tianyuan-workbench-feedback",
          storage: "private",
        });
      }

      const cors = corsHeaders(request, env);
      if (request.method === "OPTIONS") {
        if (!cors["access-control-allow-origin"]) {
          return responseJson({ ok: false, message: "Origin not allowed" }, 403);
        }
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            "access-control-allow-headers": "content-type",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-max-age": "600",
          },
        });
      }
      if (request.method !== "POST" || url.pathname !== "/api/feedback") {
        return responseJson({ ok: false, message: "Not found" }, 404, cors);
      }
      if (!cors["access-control-allow-origin"]) {
        return responseJson({ ok: false, message: "Origin not allowed" }, 403);
      }
      if (!env.RATE_LIMIT_PEPPER) {
        return responseJson({ ok: false, message: "反馈服务暂时不可用" }, 503, cors);
      }

      const maxBodyBytes = Number(env.FEEDBACK_MAX_BODY_BYTES || 16 * 1024);
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > maxBodyBytes) {
        return responseJson({ ok: false, message: "反馈内容过大" }, 413, cors);
      }

      const store = storeFactory(env);
      const current = now();
      const limit = await store.consumeRateLimit(
        await clientHash(request, env.RATE_LIMIT_PEPPER),
        {
          nowMs: current.getTime(),
          max: Number(env.FEEDBACK_RATE_LIMIT_MAX || 10),
          windowMs: Number(env.FEEDBACK_RATE_LIMIT_WINDOW_MS || 3_600_000),
        },
      );
      if (!limit.allowed) {
        return responseJson(
          { ok: false, message: "提交过于频繁，请稍后再试" },
          429,
          {
            ...cors,
            "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        );
      }

      try {
        const rawText = await request.text();
        if (new TextEncoder().encode(rawText).byteLength > maxBodyBytes) {
          return responseJson({ ok: false, message: "反馈内容过大" }, 413, cors);
        }
        const feedback = redactFeedback(validateFeedbackPayload(JSON.parse(rawText)));
        const id = feedbackId(current);
        await store.createFeedback({
          ...feedback,
          id,
          createdAt: current.toISOString(),
        });
        return responseJson({ ok: true, feedbackId: id }, 201, cors);
      } catch (error) {
        const message = String(error?.message || error);
        const clientError = /^(INVALID|MISSING|UNKNOWN|PRIVACY|TITLE|DESCRIPTION|STEPS|DIAGNOSTIC)/.test(
          message,
        );
        return responseJson({
          ok: false,
          message: clientError
            ? "反馈内容格式不正确，请检查后重试"
            : "反馈服务暂时不可用",
        }, clientError ? 400 : 503, cors);
      }
    },
  };
}

export default createFeedbackWorker();
