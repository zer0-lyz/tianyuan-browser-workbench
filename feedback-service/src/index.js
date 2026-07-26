import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createFeedbackApp } from "./app.js";
import { createGithubIssueClient } from "./github-app.js";
import { createRateLimiter } from "./rate-limit.js";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`MISSING_ENVIRONMENT_VARIABLE:${name}`);
  return value;
}

const extensionIds = required("FEEDBACK_ALLOWED_EXTENSION_IDS")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const issueClient = createGithubIssueClient({
  appId: required("GITHUB_APP_ID"),
  installationId: required("GITHUB_APP_INSTALLATION_ID"),
  privateKey: required("GITHUB_APP_PRIVATE_KEY"),
  repository: required("GITHUB_FEEDBACK_REPOSITORY"),
});
const app = createFeedbackApp({
  issueClient,
  allowedOrigins: extensionIds.map((id) => `chrome-extension://${id}`),
  rateLimiter: createRateLimiter({
    max: Number(process.env.FEEDBACK_RATE_LIMIT_MAX || 10),
    windowMs: Number(process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS || 3_600_000),
  }),
});
const port = Number(process.env.PORT || 8787);

createServer(async (request, response) => {
  const protocol = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers.host || "localhost";
  const webRequest = new Request(`${protocol}://${host}${request.url}`, {
    method: request.method,
    headers: request.headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : Readable.toWeb(request),
    duplex: "half",
  });
  const webResponse = await app(webRequest);
  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}).listen(port, "0.0.0.0", () => {
  console.log(`Feedback service listening on port ${port}`);
});
