"use strict";

const fs = require("node:fs");
const path = require("node:path");
const directoryPicker = require("../directory-picker.js");

const PICKER_RESULT_MARKER = "TIANYUAN_PICKER_RESULT:";

function security() {
  return { credentialsReturned: false };
}

function pickerResult(stdout, options = {}) {
  const rawOutput = String(stdout || "").replace(/^\uFEFF/, "").trimStart();
  const lines = rawOutput.split(/\r?\n/).reverse();
  const markerLine = lines.find((candidate) => candidate.startsWith(PICKER_RESULT_MARKER));
  if (markerLine) {
    let result;
    try {
      result = JSON.parse(markerLine.slice(PICKER_RESULT_MARKER.length));
    } catch {
      return {
        ok: false,
        cancelled: false,
        reason: "FILE_PICKER_RESULT_INVALID",
        stage: "picker_result",
        errorCode: "INVALID_RESULT",
        userMessage: "目录选择器未返回可识别的结果。请重新选择目录。",
        guidance: "重新打开选择器并再次选择。",
        security: security(),
      };
    }
    if (result?.cancelled === true) {
      return {
        ok: false,
        cancelled: true,
        reason: "FILE_SELECTION_CANCELLED",
        stage: "picker_execution",
        security: security(),
      };
    }
    const paths = Array.isArray(result?.paths)
      ? result.paths.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    if (!paths.length) {
      return {
        ok: false,
        cancelled: false,
        reason: "FILE_PICKER_EMPTY_RESULT",
        stage: "picker_result",
        errorCode: "EMPTY_RESULT",
        userMessage: "目录选择器没有返回文件夹。请重新选择。",
        guidance: "重新打开选择器并选择一个文件夹。",
        security: security(),
      };
    }
    return { ok: true, paths, security: security() };
  }
  if (options.requireMarker) {
    return {
      ok: false,
      cancelled: false,
      reason: "FILE_PICKER_RESULT_INVALID",
      stage: "picker_result",
      errorCode: "RESULT_MARKER_MISSING",
      userMessage: "目录选择器未返回可识别的结果。请重新选择目录。",
      guidance: "重新打开选择器并再次选择。",
      security: security(),
    };
  }
  const paths = rawOutput
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!paths.length) {
    return {
      ok: false,
      cancelled: false,
      reason: "FILE_PICKER_EMPTY_RESULT",
      stage: "picker_result",
      errorCode: "EMPTY_RESULT",
      userMessage: "目录选择器没有返回文件夹。请重新选择。",
      guidance: "重新打开选择器并选择一个文件夹。",
      security: security(),
    };
  }
  return {
    ok: true,
    paths,
    security: security(),
  };
}

function pickerFailure(error, options = {}) {
  return directoryPicker.pickerFailure(error, options);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function createFileCredentialReference({ fallbackPath, key, secret }) {
  const values = readJson(fallbackPath, { secrets: {} });
  values.secrets = values.secrets || {};
  values.secrets[key] = secret;
  writeJson(fallbackPath, values);
  return `file:${fallbackPath}#${key}`;
}

function resolveFileCredentialReference(reference) {
  if (!String(reference || "").startsWith("file:")) return "";
  const [filePart, key] = String(reference).slice(5).split("#");
  if (!filePart || !key) return "";
  try {
    const values = readJson(filePart, {});
    return String(values?.secrets?.[key] || values?.[key] || "");
  } catch {
    return "";
  }
}

function commandAvailable(execFileSync, command, args = ["--version"]) {
  try {
    execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  commandAvailable,
  createFileCredentialReference,
  PICKER_RESULT_MARKER,
  pickerFailure,
  pickerResult,
  readJson,
  resolveFileCredentialReference,
  security,
  writeJson,
};
