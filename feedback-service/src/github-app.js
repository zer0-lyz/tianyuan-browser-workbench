import { createSign } from "node:crypto";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function appJwt(appId, privateKey, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iat: nowSeconds - 30,
    exp: nowSeconds + 9 * 60,
    iss: String(appId),
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey, "base64url")}`;
}

async function githubJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "tianyuan-workbench-feedback-service",
      ...(options.headers || {}),
    },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GITHUB_API_${response.status}:${value.message || "request failed"}`);
  }
  return value;
}

export function createGithubIssueClient({
  appId,
  installationId,
  privateKey,
  repository,
}) {
  const [owner, repo] = String(repository || "").split("/");
  if (!appId || !installationId || !privateKey || !owner || !repo) {
    throw new Error("GITHUB_APP_CONFIGURATION_INCOMPLETE");
  }
  const normalizedKey = String(privateKey).replace(/\\n/g, "\n");
  let tokenCache = null;

  async function installationToken() {
    if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
      return tokenCache.token;
    }
    const tokenResult = await githubJson(
      `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${appJwt(appId, normalizedKey)}`,
        },
      },
    );
    tokenCache = {
      token: tokenResult.token,
      expiresAt: Date.parse(tokenResult.expires_at),
    };
    return tokenCache.token;
  }

  return {
    async createIssue({ title, body, labels }) {
      const token = await installationToken();
      return githubJson(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ title, body, labels }),
        },
      );
    },
  };
}
