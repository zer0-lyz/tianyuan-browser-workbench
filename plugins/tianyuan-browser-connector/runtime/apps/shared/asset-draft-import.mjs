import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { parseWorkbook } from "/Library/Application Support/tycpv/app/src/lib/excel.js";
import { filterSubjectsByImportMetadata, loadImportMetadata } from "/Library/Application Support/tycpv/app/src/lib/import-metadata.js";
import { requireAuthToken } from "/Library/Application Support/tycpv/app/src/lib/auth.js";
import { resolveConfiguredServerUrl } from "/Library/Application Support/tycpv/app/src/lib/config.js";
import { callTool, createMcpClient } from "/Library/Application Support/tycpv/app/src/lib/mcp.js";
import DetailTableExporter from "/Library/Application Support/tycpv/app/src/detail-table-export-engine/detail-table-exporter.js";

const PENDING_IMPORT_TTL_MS = 10 * 60 * 1000;
const pendingImports = new Map();

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} 必须是正整数。`);
  return parsed;
}

function companyIds(values) {
  if (!Array.isArray(values) || values.length < 1) throw new Error("companyIds 至少需要一个目标公司。 ");
  return [...new Set(values.map((value) => positiveInteger(value, "companyId")))];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function scrubTokens(value) {
  if (Array.isArray(value)) return value.map(scrubTokens);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/confirmationtoken|token|authorization|credential/i.test(key))
    .map(([key, item]) => [key, scrubTokens(item)]));
}

function safeToolData(result) {
  const data = result?.data;
  return scrubTokens(data && typeof data === "object" ? data : { result: data });
}

function cleanupPendingImports() {
  const now = Date.now();
  for (const [prepareId, pending] of pendingImports) {
    if (now - pending.createdAt <= PENDING_IMPORT_TTL_MS) continue;
    pending.client.close().catch(() => {});
    pendingImports.delete(prepareId);
  }
}

function isExcludedSubject(subject, excludedCodes, excludedNames) {
  const code = normalizeText(subject.subjectCode).toUpperCase();
  const name = normalizeText(subject.subjectName);
  return excludedCodes.has(code) || excludedNames.has(name);
}

function summarizeSubjects(subjects) {
  return subjects.map((subject) => ({
    subjectCode: subject.subjectCode || "",
    subjectName: subject.subjectName || "",
    rowCount: Array.isArray(subject.rows) ? subject.rows.length : 0,
    columnCount: Array.isArray(subject.columns) ? subject.columns.length : 0,
  }));
}

async function parseImportWorkbook(filePath, exclusions = {}) {
  const absolutePath = path.resolve(filePath || "");
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error("申报表导入文件不存在或不是文件。 ");
  }
  if (!/\.xls[xm]$/i.test(absolutePath)) throw new Error("申报表导入文件必须是 .xlsx 或 .xlsm。 ");

  const parsed = await parseWorkbook({ filePath: absolutePath });
  const metadataResult = await loadImportMetadata();
  if (!metadataResult.metadata) throw new Error(metadataResult.warning || "未找到资产基础法申报数据导入字段元数据。 ");
  const filtered = filterSubjectsByImportMetadata(parsed.subjects, metadataResult.metadata);
  const excludedCodes = new Set((exclusions.subjectCodes || []).map((value) => normalizeText(value).toUpperCase()).filter(Boolean));
  const excludedNames = new Set((exclusions.subjectNames || []).map((value) => normalizeText(value)).filter(Boolean));
  const excluded = filtered.subjects.filter((subject) => isExcludedSubject(subject, excludedCodes, excludedNames));
  const subjects = filtered.subjects.filter((subject) => !isExcludedSubject(subject, excludedCodes, excludedNames));
  if (!subjects.length) throw new Error("没有解析到可导入的申报表数据。 ");
  return {
    absolutePath,
    parsed,
    subjects,
    reports: filtered.reports,
    excluded: excluded.map((subject) => ({ subjectCode: subject.subjectCode || "", subjectName: subject.subjectName || "", rowCount: subject.rows.length })),
  };
}

export async function prepareAssetDraftImport(input = {}) {
  cleanupPendingImports();
  const projectId = positiveInteger(input.projectId, "projectId");
  const targetCompanyIds = companyIds(input.companyIds);
  const workbook = await parseImportWorkbook(input.filePath, {
    subjectCodes: input.excludedSubjectCodes,
    subjectNames: input.excludedSubjectNames,
  });
  const serverUrl = await resolveConfiguredServerUrl();
  const token = await requireAuthToken({ serverUrl });
  const client = await createMcpClient({ serverUrl, token });

  try {
    const request = {
      projectId,
      targetCompanyIds,
      sourceFileName: workbook.parsed.sourceFileName,
      sourceFileSha256: workbook.parsed.sourceFileSha256,
      subjects: workbook.subjects,
    };
    const result = await callTool(client.client, "prepare_asset_based_approach_draft_import", request);
    if (result.raw?.isError || result.data?.success !== true) {
      await client.close();
      return { ok: false, stage: "prepare", result: safeToolData(result), security: { writesPerformed: false, credentialsReturned: false } };
    }
    const confirmationToken = result.data?.nextToolArguments?.confirmationToken || result.data?.confirmationToken;
    if (!confirmationToken) {
      await client.close();
      throw new Error("预检未返回可用于执行的确认凭证。 ");
    }
    const prepareId = randomUUID();
    pendingImports.set(prepareId, {
      client,
      createdAt: Date.now(),
      projectId,
      targetCompanyIds,
      confirmationToken,
      executeArguments: result.data?.nextToolArguments || {},
    });
    return {
      ok: true,
      stage: "prepare",
      prepareId,
      expiresInSeconds: Math.floor(PENDING_IMPORT_TTL_MS / 1000),
      source: {
        fileName: workbook.parsed.sourceFileName,
        sourceRowCount: workbook.subjects.reduce((total, subject) => total + subject.rows.length, 0),
        subjects: summarizeSubjects(workbook.subjects),
        parserWarnings: workbook.parsed.warnings,
        metadataReports: workbook.reports,
      },
      preview: scrubTokens(result.data?.preview || {}),
      confirmationPrompt: result.data?.confirmationPrompt || "确认执行导入并覆盖上述目标吗？",
      exclusions: {
        requestedSubjectCodes: input.excludedSubjectCodes || [],
        requestedSubjectNames: input.excludedSubjectNames || [],
        excludedSubjects: workbook.excluded,
        enforced: (input.excludedSubjectCodes || []).length > 0 || (input.excludedSubjectNames || []).length > 0,
      },
      security: { writesPerformed: false, remoteConfirmationHeldInPluginProcess: true, credentialsReturned: false },
    };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

export async function executeAssetDraftImport(input = {}) {
  cleanupPendingImports();
  if (input.confirmText !== "确认执行申报表导入") {
    throw new Error("confirmText 必须精确为“确认执行申报表导入”。 ");
  }
  const prepareId = normalizeText(input.prepareId);
  const pending = pendingImports.get(prepareId);
  if (!pending) throw new Error("导入预检已过期或不存在，请重新执行预检。 ");
  pendingImports.delete(prepareId);
  try {
    const result = await callTool(pending.client.client, "execute_asset_based_approach_draft_import", {
      ...pending.executeArguments,
      confirmationToken: pending.confirmationToken,
      confirmed: true,
    });
    return {
      ok: result.raw?.isError !== true && result.data?.success === true,
      stage: "execute",
      projectId: pending.projectId,
      targetCompanyIds: pending.targetCompanyIds,
      result: safeToolData(result),
      security: { writesPerformed: result.data?.success === true, credentialsReturned: false },
    };
  } finally {
    await pending.client.close().catch(() => {});
  }
}

class ExportApiClient {
  constructor(client) {
    this.client = client;
  }

  async request(method, requestPath, options = {}) {
    const response = await callTool(this.client, "request_detail_table_export_api", {
      method,
      path: requestPath,
      ...(options.params ? { params: options.params } : {}),
      ...(options.body ? { body: options.body } : {}),
    });
    if (response.raw?.isError || response.data?.success !== true) {
      throw new Error(`系统回读导出接口失败：${response.data?.error || "unknown error"}`);
    }
    return response.data.data;
  }

  async get(requestPath, params) {
    return this.request("GET", requestPath, { params });
  }

  async post(requestPath, body) {
    return this.request("POST", requestPath, { body });
  }
}

export async function exportAssetDeclareTable(input = {}) {
  const projectId = positiveInteger(input.projectId, "projectId");
  const selectedCompanyIds = companyIds(input.companyIds);
  const outDir = path.resolve(input.outDir || path.join(process.cwd(), "exports", "asset-declare-table"));
  fs.mkdirSync(outDir, { recursive: true });
  const serverUrl = await resolveConfiguredServerUrl();
  const token = await requireAuthToken({ serverUrl });
  const client = await createMcpClient({ serverUrl, token });
  const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const templatePath = "/Library/Application Support/tycpv/app/assets/templates/declare.xlsx";
  try {
    const exporter = new DetailTableExporter(new ExportApiClient(client.client), {
      projectId,
      companyIds: selectedCompanyIds,
      types: ["declare"],
      outDir,
      limit: 5000,
      templatePaths: { declare: templatePath },
      workspaceRoot: pluginRoot,
    });
    const files = await exporter.run();
    return {
      ok: true,
      projectId,
      companyIds: selectedCompanyIds,
      files,
      security: { readOnly: true, writesPerformed: false, credentialsReturned: false },
    };
  } finally {
    await client.close().catch(() => {});
  }
}
