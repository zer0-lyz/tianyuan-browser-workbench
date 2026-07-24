#!/usr/bin/env node
"use strict";

const { execFileSync, spawn } = require("node:child_process");

const DEFAULT_BASE_URL = "https://excel.zhrdc.net";
const DEFAULT_PORT = 9222;
const DEFAULT_CHROME_APP = "/Applications/Google Chrome.app";
const DEFAULT_PROFILE = "/Volumes/A区/MacAppData/Google/Chrome";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (["restart-chrome", "no-restart", "select-all-companies"].includes(key)) {
      args[key] = true;
      continue;
    }
    args[key] = argv[i + 1];
    i += 1;
  }
  return args;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) throw new Error(`Missing required --${key}`);
  return value;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function canReachPort(port) {
  try {
    await fetchJson(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return true;
  } catch {
    return false;
  }
}

function quitChrome() {
  try {
    execFileSync("osascript", ["-e", 'tell application "Google Chrome" to quit'], {
      stdio: "ignore",
    });
  } catch {
    // Chrome may not be running.
  }
}

function openChrome({ chromeApp, port, profile, url }) {
  spawn(
    "open",
    [
      "-na",
      chromeApp,
      "--args",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      url,
    ],
    { detached: true, stdio: "ignore" },
  ).unref();
}

async function waitForPort(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canReachPort(port)) return;
    await sleep(500);
  }
  throw new Error(`Chrome DevTools port ${port} is not reachable`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(JSON.stringify(message.error)));
    else callbacks.resolve(message.result);
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  return {
    send(method, params = {}) {
      const messageId = ++id;
      ws.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
      });
    },
    close() {
      ws.close();
    },
  };
}

async function getPage(port, baseUrl) {
  const pages = await fetchJson(`http://127.0.0.1:${port}/json`);
  const page =
    pages.find((p) => p.type === "page" && p.url.includes(`${baseUrl}/ty/operation/`)) ||
    pages.find((p) => p.type === "page");
  if (!page) throw new Error("No controllable Chrome page found");
  return page;
}

async function saveSubject(client, url) {
  if (url) {
    await client.send("Page.navigate", { url });
    await sleep(4500);
  }
  const result = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const visible = (el) => Boolean(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const text = (el) => (el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || el.title || "")
        .replace(/\\s+/g, " ")
        .trim();

      for (let i = 0; i < 50; i += 1) {
        const body = document.body?.innerText || "";
        if (/登录|Login/.test(body) && !/资产基础法底稿/.test(body)) {
          return { ok: false, reason: "login_required", title: document.title, url: location.href };
        }
        if (body.includes("资产基础法底稿") && body.includes("保存")) break;
        await sleep(300);
      }

      const controls = [...document.querySelectorAll("button,.el-button,[role='button'],a,span")].filter(visible);
      const save = controls.find((el) => text(el) === "保存");
      if (!save) {
        return {
          ok: false,
          reason: "save_button_not_found",
          title: document.title,
          url: location.href,
          buttons: controls.map(text).filter(Boolean).slice(0, 80),
        };
      }

      save.scrollIntoView({ block: "center", inline: "center" });
      await sleep(200);
      save.click();
      await sleep(2500);

      const confirm = [...document.querySelectorAll("button,.el-button")]
        .filter(visible)
        .find((el) => ["确定", "确认"].includes(text(el)));
      if (confirm) {
        confirm.click();
        await sleep(1500);
      }

      await sleep(2000);
      const body = document.body?.innerText || "";
      return {
        ok: true,
        title: document.title,
        url: location.href,
        saveSuccess: body.includes("保存成功"),
        tail: body.slice(-500),
      };
    })()`,
  });
  return result.result.value;
}

async function selectAllCompanies(client, url) {
  await client.send("Page.navigate", { url });
  await sleep(4500);
  const result = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const visible = (el) => Boolean(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const text = (el) => (el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || el.title || "")
        .replace(/\\s+/g, " ")
        .trim();
      const controls = () => [...document.querySelectorAll("button,.el-button,[role='button'],a,span")]
        .filter(visible);
      const byText = (label) => controls().find((el) => text(el) === label);

      for (let i = 0; i < 50; i += 1) {
        const body = document.body?.innerText || "";
        if (/登录|Login/.test(body) && !/资产基础法底稿/.test(body)) {
          return { ok: false, reason: "login_required", title: document.title, url: location.href };
        }
        if (body.includes("资产基础法底稿") && body.includes("选择更多")) break;
        await sleep(300);
      }

      const more = byText("选择更多");
      if (!more) {
        return {
          ok: false,
          reason: "choose_more_not_found",
          title: document.title,
          url: location.href,
          buttons: controls().map(text).filter(Boolean).slice(0, 80),
        };
      }
      more.click();
      await sleep(800);

      const selectAll = byText("全选");
      if (!selectAll) {
        return {
          ok: false,
          reason: "select_all_not_found",
          title: document.title,
          url: location.href,
          buttons: controls().map(text).filter(Boolean).slice(0, 120),
          body: (document.body?.innerText || "").slice(-1500),
        };
      }
      selectAll.click();
      await sleep(500);

      const okButton = byText("确定");
      if (!okButton) {
        return {
          ok: false,
          reason: "confirm_not_found",
          title: document.title,
          url: location.href,
          buttons: controls().map(text).filter(Boolean).slice(0, 120),
          body: (document.body?.innerText || "").slice(-1500),
        };
      }
      okButton.click();
      await sleep(1200);

      return {
        ok: true,
        title: document.title,
        url: location.href,
        tail: (document.body?.innerText || "").slice(-800),
      };
    })()`,
  });
  return result.result.value;
}

async function main() {
  const args = parseArgs(process.argv);
  const projectId = requireArg(args, "project-id");
  const companyId = requireArg(args, "company-id");
  const subjectCodes = (args["subject-codes"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!subjectCodes.length) {
    throw new Error("Missing --subject-codes, for example C3-1-2,C3-5,C5-5");
  }

  const baseUrl = args["base-url"] || DEFAULT_BASE_URL;
  const port = Number(args.port || DEFAULT_PORT);
  const chromeApp = args["chrome-app"] || DEFAULT_CHROME_APP;
  const profile = args.profile || DEFAULT_PROFILE;
  const firstUrl = `${baseUrl}/ty/operation/${projectId}/${companyId}/asset-based-approach/draft?subjectCode=${encodeURIComponent(subjectCodes[0])}`;

  if (!(await canReachPort(port))) {
    if (!args["restart-chrome"]) {
      throw new Error(`Chrome DevTools port ${port} is not reachable. Re-run with --restart-chrome or start Chrome with --remote-debugging-port=${port}.`);
    }
    quitChrome();
    await sleep(2500);
    openChrome({ chromeApp, port, profile, url: firstUrl });
    await waitForPort(port);
  }

  const page = await getPage(port, baseUrl);
  const client = await connectCdp(page.webSocketDebuggerUrl);
  const results = [];

  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.bringToFront");

    for (const code of subjectCodes) {
      const url = `${baseUrl}/ty/operation/${projectId}/${companyId}/asset-based-approach/draft?subjectCode=${encodeURIComponent(code)}`;
      if (args["select-all-companies"]) {
        const selection = await selectAllCompanies(client, url);
        console.log(JSON.stringify({ subjectCode: code, companySelection: selection }));
        if (!selection.ok) {
          results.push({ subjectCode: code, ...selection });
          break;
        }
        const result = await saveSubject(client, null);
        results.push({ subjectCode: code, ...result });
        console.log(JSON.stringify(results[results.length - 1]));
        if (!result.ok) break;
      } else {
        const result = await saveSubject(client, url);
        results.push({ subjectCode: code, ...result });
        console.log(JSON.stringify(results[results.length - 1]));
        if (!result.ok) break;
      }
    }
  } finally {
    client.close();
  }

  const failed = results.filter((item) => !item.ok);
  const summary = {
    projectId,
    companyId,
    saved: results.filter((item) => item.ok).map((item) => item.subjectCode),
    failed,
  };
  console.log(JSON.stringify({ summary }, null, 2));
  if (failed.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
