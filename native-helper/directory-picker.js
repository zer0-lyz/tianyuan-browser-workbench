"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "EHOSTDOWN", "EHOSTUNREACH", "ENETDOWN",
  "ENETUNREACH", "ENOTCONN", "ESTALE",
]);

function errorCode(error) {
  if (error?.timedOut || error?.code === "ETIMEDOUT" || error?.killed) return "ETIMEDOUT";
  const code = error?.code;
  if (typeof code === "string" && code.trim()) return code.trim().toUpperCase();
  if (Number.isInteger(code)) return `PROCESS_EXIT_${code}`;
  return "UNKNOWN";
}

function directoryFailureMessage(code, stage) {
  if (code === "EACCES" || code === "EPERM") {
    if (stage === "parent_path_resolve" || stage === "parent_path_validate") {
      return "无法访问所选目录。请确认该位置当前可用，或重新选择其他文件夹；原有设置已保留。";
    }
    return "系统拒绝在所选位置创建或写入文件。请检查当前账户能否在此位置新建文件，或重新选择可用位置后重试；原有设置已保留。";
  }
  if (code === "ENOSPC") return "所选磁盘空间不足，无法完成目录检查。请释放空间或选择其他位置后重试；原有设置已保留。";
  if (code === "EROFS") return "所选位置为只读，无法创建输出文件。请改选可写位置后重试；原有设置已保留。";
  if (code === "ENAMETOOLONG") return "所选路径过长，无法完成目录准备。请改选较短的本机路径后重试；原有设置已保留。";
  if (code === "EEXIST" && stage === "managed_directory_create") {
    return "专用子文件夹名称已被同名文件占用。请改选其他上级目录后重试；原有设置已保留。";
  }
  if (NETWORK_ERROR_CODES.has(code)) {
    return "所选网络位置当前不可达。请检查该位置是否仍可访问，或改选本机文件夹后重试；原有设置已保留。";
  }
  if (code === "ENOENT") {
    return stage === "picker_execution"
      ? "本机目录选择器无法启动。请确认工作台本机组件可用，然后重试。"
      : "所选目录当前不存在或已不可访问。请重新选择一个可访问的位置；原有设置已保留。";
  }
  if (code === "ETIMEDOUT") return "目录选择器响应超时。请稍后重试；原有设置已保留。";
  if (code === "ENOTDIR") return "所选路径中的某一部分不是文件夹。请重新选择有效文件夹；原有设置已保留。";
  return "无法完成目录准备。请确认所选位置当前可访问，或改选其他本机文件夹后重试；原有设置已保留。";
}

function directoryFailureGuidance(code, stage) {
  if (code === "EACCES" || code === "EPERM") {
    if (stage === "parent_path_resolve" || stage === "parent_path_validate") return "确认当前账户可以打开所选目录，或重新选择可访问的位置。";
    return "检查当前账户能否在该位置新建文件，或重新选择可写位置后重试。";
  }
  if (code === "ENOSPC") return "释放磁盘空间或选择其他有空间的位置，再重新选择目录。";
  if (code === "EROFS") return "选择非只读位置后重试。";
  if (code === "ENAMETOOLONG") return "选择较短的本机路径后重试。";
  if (code === "EEXIST" && stage === "managed_directory_create") return "请改选其他上级目录，或在文件管理器中处理同名文件后重试。";
  if (NETWORK_ERROR_CODES.has(code)) return "确认网络盘或映射盘已连接后重试，也可选择本机文件夹。";
  if (code === "ENOENT") return "重新打开选择器并选择当前存在的位置。";
  if (code === "ETIMEDOUT") return "关闭无响应的选择窗口后再次选择目录。";
  return "重新选择可访问的文件夹后重试。";
}

function directorySelectionFailure(result, options = {}) {
  const fallbackReason = String(options.failureReason || "OUTPUT_DIRECTORY_SELECTION_FAILED");
  const explicitCancellation = typeof result?.cancelled === "boolean"
    ? result.cancelled
    : typeof result?.canceled === "boolean"
      ? result.canceled
      : undefined;
  const cancelled = explicitCancellation === undefined
    ? result?.reason === "FILE_SELECTION_CANCELLED"
    : explicitCancellation;
  const stage = String(result?.stage || (cancelled ? "picker_execution" : "picker_result"));
  const code = String(result?.errorCode || (result?.ok === true ? "EMPTY_RESULT" : "UNKNOWN"));
  const action = String(options.action || result?.action || "");
  const emptyResultMessage = "目录选择器没有返回文件夹。请重新打开选择器并选择一个文件夹；原有设置已保留。";
  const emptyResultGuidance = "重新打开目录选择器并选择一个文件夹。";
  const normalized = {
    ...result,
    ok: false,
    cancelled,
    action,
    path: "",
    paths: [],
    outputDirectory: "",
    security: { credentialsReturned: false },
  };
  if (cancelled) {
    return {
      ...normalized,
      reason: result?.reason || "FILE_SELECTION_CANCELLED",
      stage,
    };
  }
  return {
    ...normalized,
    reason: result?.reason || fallbackReason,
    stage,
    errorCode: code,
    userMessage: result?.userMessage || (code === "EMPTY_RESULT"
      ? emptyResultMessage
      : directoryFailureMessage(code, stage)),
    guidance: result?.guidance || (code === "EMPTY_RESULT"
      ? emptyResultGuidance
      : directoryFailureGuidance(code, stage)),
  };
}

function realpathNative(fsImpl, value) {
  const nativeRealpath = fsImpl.realpathSync?.native;
  if (typeof nativeRealpath === "function") return nativeRealpath.call(fsImpl.realpathSync, value);
  return fsImpl.realpathSync(value);
}

function throwWithStage(stage, error, extra = {}) {
  const wrapped = new Error("DIRECTORY_PREPARATION_FAILED");
  wrapped.code = error?.code;
  wrapped.stage = stage;
  wrapped.cleanupErrorCode = extra.cleanupErrorCode;
  wrapped.cleanupFileName = extra.cleanupFileName;
  throw wrapped;
}

function writeProbe(directory, options = {}) {
  const fsImpl = options.fs || fs;
  const pathImpl = options.path || path;
  const makeId = options.randomId || randomUUID;
  const maxAttempts = Math.max(1, Number(options.probeNameAttempts) || 3);
  let descriptor = null;
  let probePath = "";
  let probeName = "";
  let createdByThisCall = false;
  let failure = null;
  let cleanupError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    probeName = `.tianyuan-directory-write-probe-${String(makeId()).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 48) || randomUUID()}.tmp`;
    probePath = pathImpl.join(directory, probeName);
    try {
      descriptor = fsImpl.openSync(probePath, "wx", 0o600);
      createdByThisCall = true;
      break;
    } catch (error) {
      if (error?.code === "EEXIST" && attempt + 1 < maxAttempts) continue;
      throwWithStage("write_probe", error);
    }
  }

  try {
    fsImpl.writeSync(descriptor, Buffer.from([0x54]), 0, 1, null);
  } catch (error) {
    failure = { stage: "write_probe", error };
  } finally {
    if (descriptor !== null) {
      try {
        fsImpl.closeSync(descriptor);
      } catch (error) {
        cleanupError ||= error;
      }
      descriptor = null;
    }
    if (createdByThisCall) {
      try {
        fsImpl.unlinkSync(probePath);
      } catch (error) {
        cleanupError ||= error;
      }
    }
  }

  if (failure) {
    throwWithStage(failure.stage, failure.error, cleanupError ? {
      cleanupErrorCode: errorCode(cleanupError),
      cleanupFileName: createdByThisCall ? probeName : "",
    } : {});
  }
  if (cleanupError) {
    throwWithStage("write_probe_cleanup", cleanupError, {
      cleanupErrorCode: errorCode(cleanupError),
      cleanupFileName: createdByThisCall ? probeName : "",
    });
  }
}

function prepareManagedOutputDirectory(parentValue, directoryName, options = {}) {
  const fsImpl = options.fs || fs;
  const pathImpl = options.path || path;
  const fallbackReason = String(options.failureReason || "OUTPUT_DIRECTORY_CREATE_FAILED");
  const action = String(options.action || "");
  const rawParent = String(parentValue || "").trim();
  const folderName = String(directoryName || "").trim();
  let stage = "parent_path_validate";

  try {
    if (!rawParent || rawParent.includes("\0") || !pathImpl.isAbsolute(rawParent)) {
      const invalid = new Error("DIRECTORY_PATH_INVALID");
      invalid.code = "EINVAL";
      throwWithStage(stage, invalid);
    }
    if (!folderName || folderName === "." || folderName === ".."
      || folderName.includes("\0") || pathImpl.basename(folderName) !== folderName
      || /[\\/]/.test(folderName)) {
      const invalid = new Error("DIRECTORY_NAME_INVALID");
      invalid.code = "EINVAL";
      throwWithStage("managed_directory_name_validate", invalid);
    }

    stage = "parent_path_resolve";
    const parentPath = realpathNative(fsImpl, rawParent);
    stage = "parent_path_validate";
    if (!fsImpl.statSync(parentPath).isDirectory()) {
      const notDirectory = new Error("DIRECTORY_PARENT_NOT_DIRECTORY");
      notDirectory.code = "ENOTDIR";
      throw notDirectory;
    }

    const outputPath = pathImpl.basename(parentPath) === folderName
      ? parentPath
      : pathImpl.join(parentPath, folderName);
    stage = "managed_directory_create";
    const createdPath = fsImpl.mkdirSync(outputPath, { recursive: true, mode: 0o700 });
    stage = "managed_directory_resolve";
    const selectedPath = realpathNative(fsImpl, outputPath);
    stage = "managed_directory_validate";
    if (!fsImpl.statSync(selectedPath).isDirectory()) {
      const notDirectory = new Error("OUTPUT_DIRECTORY_NOT_DIRECTORY");
      notDirectory.code = "ENOTDIR";
      throw notDirectory;
    }
    stage = "write_probe";
    writeProbe(selectedPath, options);
    return {
      ok: true,
      action,
      path: selectedPath,
      paths: [selectedPath],
      outputDirectory: selectedPath,
      parentPath,
      directoryName: folderName,
      createdDirectory: typeof createdPath === "string",
      security: { credentialsReturned: false },
    };
  } catch (error) {
    const failureStage = error?.stage || stage;
    const code = errorCode(error);
    const cleanupErrorCode = error?.cleanupErrorCode || "";
    const cleanupFileName = error?.cleanupFileName || "";
    return {
      ok: false,
      action,
      path: "",
      paths: [],
      outputDirectory: "",
      reason: fallbackReason,
      stage: failureStage,
      errorCode: code,
      userMessage: failureStage === "write_probe_cleanup"
        ? "已创建目录，但无法清理本次临时写入检查文件。请检查所选位置是否留有临时文件，再重新选择；原有设置已保留。"
        : directoryFailureMessage(code, failureStage),
      guidance: failureStage === "write_probe_cleanup"
        ? "检查所选位置是否留有临时文件，再重新选择目录。"
        : directoryFailureGuidance(code, failureStage),
      ...(cleanupErrorCode ? { cleanupErrorCode } : {}),
      ...(cleanupFileName ? { cleanupFileName } : {}),
      security: { credentialsReturned: false },
    };
  }
}

function pickerFailure(error, options = {}) {
  const platform = String(options.platform || "");
  const appleScriptText = platform === "macos"
    ? `${error?.message || ""} ${error?.stderr || ""}`
    : "";
  const cancelled = platform === "macos"
    && (/User canceled/i.test(appleScriptText) || /\(-128\)|\b-128\b/.test(appleScriptText));
  const legacyWindowsCancel = platform === "windows"
    && Number(error?.code) === 2
    && error?.killed !== true;
  if (cancelled || legacyWindowsCancel) {
    return {
      ok: false,
      cancelled: true,
      reason: "FILE_SELECTION_CANCELLED",
      stage: "picker_execution",
      security: { credentialsReturned: false },
    };
  }
  const code = errorCode(error);
  const timedOut = code === "ETIMEDOUT";
  const reason = timedOut ? "FILE_PICKER_TIMEOUT" : "FILE_PICKER_FAILED";
  const stage = "picker_execution";
  return {
    ok: false,
    cancelled: false,
    reason,
    stage,
    errorCode: code,
    userMessage: directoryFailureMessage(code, stage),
    guidance: directoryFailureGuidance(code, stage),
    security: { credentialsReturned: false },
  };
}

module.exports = {
  directoryFailureGuidance,
  directoryFailureMessage,
  directorySelectionFailure,
  errorCode,
  pickerFailure,
  prepareManagedOutputDirectory,
  realpathNative,
  writeProbe,
};
