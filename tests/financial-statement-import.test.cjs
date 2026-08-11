"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const http = require("node:http");
const { test, after } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "plugins", "tianyuan-browser-connector", "runtime", "scripts", "financial-statement-import.mjs");
let server;
let serverUrl;
const requests = [];

function responseJson(response, payload, headers = {}) {
  response.writeHead(200, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(payload));
}

function toolResult(value) {
  return { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(value) }] } };
}

server = http.createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    requests.push({ body, authorization: request.headers.authorization, session: request.headers["mcp-session-id"] || "" });
    if (body.method === "initialize") {
      responseJson(response, { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05" } }, { "Mcp-Session-Id": "test-session" });
      return;
    }
    if (body.method === "notifications/initialized") {
      response.writeHead(202);
      response.end();
      return;
    }
    if (body.method === "tools/list") {
      responseJson(response, {
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: [
          { name: "get_project_companies" },
          { name: "prepare_financial_statement_report_import" },
          { name: "execute_financial_statement_report_import" },
          { name: "get_financial_statement_reports" },
        ] },
      });
      return;
    }
    if (body.method !== "tools/call") {
      responseJson(response, { jsonrpc: "2.0", id: body.id, result: {} });
      return;
    }
    const name = body.params?.name;
    const args = body.params?.arguments || {};
    if (name === "get_project_companies") {
      responseJson(response, toolResult([{ id: 123, name: "测试公司", shortName: "测试" }]));
    } else if (name === "prepare_financial_statement_report_import") {
      responseJson(response, toolResult({
        confirmationToken: "confirmation-token-1234567890",
        confirmationPrompt: "确认导入测试报表",
        amountPreview: [{ reportYear: 2024, subjectName: "货币资金", amount: 100 }],
        received: args,
      }));
    } else if (name === "execute_financial_statement_report_import") {
      responseJson(response, toolResult({ success: true, saved: true, received: args }));
    } else if (name === "get_financial_statement_reports") {
      responseJson(response, toolResult({ success: true, reportCount: 1, reports: [{ statementType: "balance_sheet", existingYears: [2024] }] }));
    } else {
      responseJson(response, { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "unknown tool" } });
    }
  });
});

function runCli(args, home) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, HOME: home },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status, signal) => resolve({ status: status ?? (signal ? 1 : 0), signal, stdout, stderr }));
  });
}

function setupHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-financial-import-"));
  fs.mkdirSync(path.join(home, ".tycpv"), { recursive: true });
  fs.writeFileSync(path.join(home, ".tycpv", "auth.json"), JSON.stringify({ serverUrl, expiresAt: new Date(Date.now() + 60_000).toISOString() }));
  fs.writeFileSync(path.join(home, ".tycpv", "token.secret.json"), JSON.stringify({ provider: "plain-file", value: Buffer.from("server-token").toString("base64url") }));
  return home;
}

test("financial statement import uses MCP session and preserves preflight gate", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}/valuation-mcp`;
  const home = setupHome();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-financial-payload-"));
  const sourceFile = path.join(temp, "测试资产负债表.xlsx");
  const payloadFile = path.join(temp, "parsed.json");
  fs.writeFileSync(sourceFile, "test source");
  fs.writeFileSync(payloadFile, JSON.stringify({
    sheetList: [{ reportYear: 2024, sourceSheetName: "资产负债表", auditType: 2, detail: [{ subjectName: "货币资金", amount: 100 }] }],
  }));

  const companies = await runCli(["companies", "--project-id", "10"], home);
  assert.equal(companies.status, 0, companies.stderr);
  assert.equal(JSON.parse(companies.stdout).result[0].shortName, "测试");

  const prepared = await runCli(["prepare", "--project-id", "10", "--company-id", "20", "--file", sourceFile, "--type", "balance_sheet", "--json", payloadFile], home);
  assert.equal(prepared.status, 0, prepared.stderr);
  const preview = JSON.parse(prepared.stdout);
  assert.equal(preview.confirmationToken, "confirmation-token-1234567890");
  assert.equal(preview.received.sheetList[0].auditType, 2);
  assert.doesNotMatch(prepared.stdout, /server-token|Bearer/);
  assert.doesNotMatch(prepared.stderr, /server-token|Bearer/);
  assert.equal(requests.filter((item) => item.body.method === "tools/call" && item.body.params.name === "execute_financial_statement_report_import").length, 0);

  const executed = await runCli(["execute", "--token", preview.confirmationToken], home);
  assert.equal(executed.status, 0, executed.stderr);
  assert.equal(JSON.parse(executed.stdout).saved, true);
  const read = await runCli(["read", "--project-id", "10", "--company-id", "20", "--type", "all"], home);
  assert.equal(read.status, 0, read.stderr);
  assert.equal(JSON.parse(read.stdout).reportCount, 1);

  const calls = requests.filter((item) => item.body.method === "tools/call");
  assert.ok(calls.length >= 4);
  assert.ok(calls.every((item) => item.authorization === "Bearer server-token"));
  assert.ok(calls.every((item) => item.session === "test-session"));
});

test("financial statement import rejects missing parsed data before MCP write", async () => {
  const home = setupHome();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-financial-missing-"));
  const sourceFile = path.join(temp, "报表.xlsx");
  fs.writeFileSync(sourceFile, "test source");
  const result = await runCli(["prepare", "--project-id", "10", "--company-id", "20", "--file", sourceFile, "--type", "balance_sheet"], home);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHEET_LIST_INVALID/);
});

after(() => server?.close());
