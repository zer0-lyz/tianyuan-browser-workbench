import { createHash, randomUUID } from "node:crypto";
import { redactFeedback } from "./redaction.js";
import { createRateLimiter } from "./rate-limit.js";
import { validateFeedbackPayload } from "./validation.js";

const TYPE_LABELS = {
  feature: ["feedback", "feature", "needs-triage"],
  configuration: ["feedback", "configuration", "needs-triage"],
  bug: ["feedback", "bug", "needs-triage"],
  experience: ["feedback", "experience", "needs-triage"],
  other: ["feedback", "needs-triage"],
};

const TYPE_NAMES = {
  feature: "功能建议",
  configuration: "配置问题",
  bug: "故障反馈",
  experience: "使用体验",
  other: "其他",
};

function feedbackId(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `TYF-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function issueBody(feedback, id) {
  const lines = [
    `反馈编号：\`${id}\``,
    "",
    "## 详细说明",
    "",
    feedback.description,
  ];
  if (feedback.steps) {
    lines.push("", "## 复现步骤或使用场景", "", feedback.steps);
  }
  if (feedback.diagnostics) {
    lines.push(
      "",
      "## 安全环境信息",
      "",
      "```json",
      JSON.stringify(feedback.diagnostics, null, 2),
      "```",
    );
  }
  lines.push(
    "",
    "## 隐私检查",
    "",
    "- 用户已确认不含客户资料、项目编号、文件路径或账号凭据",
    "- 服务端已执行字段白名单和敏感信息脱敏",
  );
  return lines.join("\n");
}

function anonymousClientId(request) {
  const forwarded = String(request.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  const source = forwarded || request.headers.get("cf-connecting-ip") || "anonymous";
  return createHash("sha256").update(source).digest("hex");
}

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

export function createFeedbackApp({
  issueClient,
  allowedOrigins = [],
  rateLimiter = createRateLimiter(),
  maxBodyBytes = 16 * 1024,
  now = () => new Date(),
} = {}) {
  const origins = new Set(allowedOrigins);
  return async function handle(request) {
    const origin = request.headers.get("origin") || "";
    const corsHeaders = origin && origins.has(origin)
      ? { "access-control-allow-origin": origin, vary: "Origin" }
      : {};
    if (request.method === "OPTIONS") {
      if (!corsHeaders["access-control-allow-origin"]) {
        return responseJson({ ok: false, message: "Origin not allowed" }, 403);
      }
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-max-age": "600",
        },
      });
    }
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/feedback") {
      return responseJson({ ok: false, message: "Not found" }, 404, corsHeaders);
    }
    if (!corsHeaders["access-control-allow-origin"]) {
      return responseJson({ ok: false, message: "Origin not allowed" }, 403);
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > maxBodyBytes) {
      return responseJson({ ok: false, message: "Feedback is too large" }, 413, corsHeaders);
    }
    const limit = rateLimiter.consume(anonymousClientId(request));
    if (!limit.allowed) {
      return responseJson(
        { ok: false, message: "Too many feedback requests" },
        429,
        { ...corsHeaders, "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) },
      );
    }
    try {
      const rawText = await request.text();
      if (Buffer.byteLength(rawText, "utf8") > maxBodyBytes) {
        return responseJson({ ok: false, message: "Feedback is too large" }, 413, corsHeaders);
      }
      const feedback = redactFeedback(validateFeedbackPayload(JSON.parse(rawText)));
      const id = feedbackId(now());
      const issue = await issueClient.createIssue({
        title: `[${TYPE_NAMES[feedback.type]}] ${feedback.title}`,
        body: issueBody(feedback, id),
        labels: TYPE_LABELS[feedback.type],
      });
      return responseJson({
        ok: true,
        feedbackId: id,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      }, 201, corsHeaders);
    } catch (error) {
      const message = String(error?.message || error);
      const clientError = /^(INVALID|MISSING|UNKNOWN|PRIVACY|TITLE|DESCRIPTION|STEPS|DIAGNOSTIC)/.test(message);
      return responseJson({
        ok: false,
        message: clientError ? "反馈内容格式不正确，请检查后重试" : "反馈服务暂时不可用",
      }, clientError ? 400 : 503, corsHeaders);
    }
  };
}
