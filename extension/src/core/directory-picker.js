const LEGACY_OUTPUT_FAILURES = new Set([
  "OUTPUT_DIRECTORY_CREATE_FAILED",
  "EXPORT_DIRECTORY_CREATE_FAILED",
  "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED",
  "TABLE_FORMAT_OUTPUT_DIRECTORY_CREATE_FAILED",
  "LAND_OUTPUT_DIRECTORY_CREATE_FAILED",
  "ALIBABA_OUTPUT_DIRECTORY_CREATE_FAILED",
  "ANJUKE_OUTPUT_DIRECTORY_CREATE_FAILED",
  "FILE_ARCHIVE_OUTPUT_DIRECTORY_CREATE_FAILED",
  "FILE_ARCHIVE_CONVERSATION_OUTPUT_DIRECTORY_CREATE_FAILED",
  "DEPRECIATION_OUTPUT_DIRECTORY_CREATE_FAILED",
  "OUTPUT_DIRECTORY_SELECTION_FAILED",
  "DIRECTORY_SELECTION_FAILED",
]);

const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "EHOSTDOWN", "EHOSTUNREACH", "ENETDOWN",
  "ENETUNREACH", "ENOTCONN", "ESTALE",
]);

function errorPayload(value) {
  if (value?.payload && typeof value.payload === "object") return value.payload;
  if (value?.cause?.payload && typeof value.cause.payload === "object") return value.cause.payload;
  return value && typeof value === "object" ? value : {};
}

function errorToken(value) {
  const token = String(value || "").trim();
  return /^[A-Z][A-Z0-9_:-]{0,79}$/.test(token) ? token : "";
}

function stageToken(value) {
  const token = String(value || "").trim();
  return /^[A-Z][A-Z0-9_:-]{0,79}$/i.test(token) ? token.toUpperCase() : "";
}

export function isDirectoryPickerCancelled(payloadValue) {
  const payload = errorPayload(payloadValue);
  const reason = String(payload.reason || payload.message || payloadValue?.message || "").trim();
  const explicitCancellation = typeof payload.cancelled === "boolean"
    ? payload.cancelled
    : typeof payload.canceled === "boolean"
      ? payload.canceled
      : undefined;
  return explicitCancellation === undefined
    ? reason === "FILE_SELECTION_CANCELLED"
    : explicitCancellation;
}

function directoryPickerError(payloadValue, subject = "文件夹") {
  const payload = errorPayload(payloadValue);
  const reason = errorToken(payload.reason || payload.message || payload.code || payloadValue?.message);
  const code = errorToken(payload.errorCode || payload.code || "");
  const stage = stageToken(payload.stage || "");
  const isOutput = /OUTPUT|EXPORT|PRINT|LAND|ALIBABA|ANJUKE|ARCHIVE|DEPRECIATION/i.test(reason)
    || /输出|导出/.test(String(subject));
  const label = String(subject || "文件夹");
  const legacyCreateFailure = LEGACY_OUTPUT_FAILURES.has(reason);
  let message = "";
  let guidance = "";

  if (isDirectoryPickerCancelled(payloadValue)) {
    return { cancelled: true, message: "", guidance: "", stage, errorCode: code || reason };
  }
  if (payload.userMessage && /[\u3400-\u9fff]/.test(String(payload.userMessage))) {
    message = String(payload.userMessage).trim();
    guidance = String(payload.guidance || "").trim();
  } else if (code === "EACCES" || code === "EPERM") {
    if (stage === "PARENT_PATH_RESOLVE" || stage === "PARENT_PATH_VALIDATE") {
      message = "无法访问所选目录。请确认该位置当前可用，或重新选择其他文件夹；原有设置已保留。";
      guidance = "确认当前账户可以打开所选目录，或重新选择可访问的位置。";
    } else {
      message = "系统拒绝在所选位置创建或写入文件。请检查当前账户能否在此位置新建文件，或重新选择可用位置后重试；原有设置已保留。";
      guidance = "检查当前账户能否在该位置新建文件，或重新选择可写位置后重试。";
    }
  } else if (code === "ENOSPC") {
    message = "所选磁盘空间不足，无法完成目录检查。请释放空间或选择其他位置后重试；原有设置已保留。";
    guidance = "释放磁盘空间或选择其他有空间的位置，再重新选择目录。";
  } else if (code === "EROFS") {
    message = "所选位置为只读，无法创建输出文件。请改选可写位置后重试；原有设置已保留。";
    guidance = "选择非只读位置后重试。";
  } else if (code === "ENAMETOOLONG") {
    message = "所选路径过长，无法完成目录准备。请改选较短的本机路径后重试；原有设置已保留。";
    guidance = "选择较短的本机路径后重试。";
  } else if (code === "EEXIST" && stage === "MANAGED_DIRECTORY_CREATE") {
    message = "专用子文件夹名称已被同名文件占用。请改选其他上级目录后重试；原有设置已保留。";
    guidance = "请改选其他上级目录，或在文件管理器中处理同名文件后重试。";
  } else if (NETWORK_ERROR_CODES.has(code)) {
    message = "所选网络位置当前不可达。请检查该位置是否仍可访问，或改选本机文件夹后重试；原有设置已保留。";
    guidance = "确认网络盘或映射盘已连接后重试，也可选择本机文件夹。";
  } else if (code === "ENOENT") {
    message = stage === "PICKER_EXECUTION"
      ? "本机目录选择器无法启动。请确认工作台本机组件可用，然后重试。"
      : "所选目录当前不存在或已不可访问。请重新选择一个可访问的位置；原有设置已保留。";
    guidance = "重新打开选择器并选择当前存在的位置。";
  } else if (code === "ETIMEDOUT" || reason === "FILE_PICKER_TIMEOUT" || reason === "NATIVE_HELPER_TIMEOUT") {
    message = "目录选择器响应超时。请稍后重试；原有设置已保留。";
    guidance = "关闭无响应的选择窗口后再次选择目录。";
  } else if (reason === "PLATFORM_FILE_PICKER_UNSUPPORTED") {
    message = "当前运行环境不支持本机文件夹选择器。请在受支持的桌面环境中重试。";
    guidance = "检查工作台本机组件与当前操作系统的兼容状态。";
  } else if (reason === "FILE_PICKER_FAILED" || reason === "FILE_PICKER_RESULT_INVALID" || reason === "FILE_PICKER_EMPTY_RESULT") {
    message = "目录选择器未能完成操作。请重新打开选择器并再次选择。";
    guidance = "重新选择目录；若问题持续，请提供诊断详情。";
  } else if (legacyCreateFailure) {
    message = "无法完成目录准备。请确认所选位置当前可访问，或改选其他本机文件夹后重试；原有设置已保留。";
    guidance = "旧版本机组件未提供底层原因；重新选择目录后可重试。";
  } else {
    message = `无法完成${isOutput ? label : "文件夹选择"}。请确认所选位置当前可访问，或重新选择后重试；原有设置已保留。`;
    guidance = "重新选择可访问的文件夹后重试。";
  }

  return {
    cancelled: false,
    message,
    guidance,
    stage,
    errorCode: code || (reason && reason !== "UNKNOWN" ? reason : ""),
    cleanupErrorCode: errorToken(payload.cleanupErrorCode),
    cleanupFileName: /^[A-Za-z0-9._-]{1,120}$/.test(String(payload.cleanupFileName || ""))
      && ![".", ".."].includes(String(payload.cleanupFileName || ""))
      ? String(payload.cleanupFileName)
      : "",
  };
}

function directoryPickerStatusElement(button, documentRef = button?.ownerDocument || globalThis.document) {
  if (!button || !documentRef?.createElement) return null;
  const statusId = `${button.id || "directory-picker"}-status`;
  let status = documentRef.getElementById?.(statusId);
  if (status) return status;
  status = documentRef.createElement("div");
  status.id = statusId;
  status.className = "directory-picker-feedback";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const row = button.closest?.(".directory-row, .land-publicity-output-row, .alibaba-auction-output-row, .anjuke-property-output-row, .file-archive-path-row")
    || button.parentElement;
  if (row?.insertAdjacentElement) row.insertAdjacentElement("afterend", status);
  else if (row?.parentElement?.insertBefore) row.parentElement.insertBefore(status, row.nextSibling || null);
  return status;
}

export function clearDirectoryPickerStatus(button, documentRef) {
  const statusId = `${button?.id || "directory-picker"}-status`;
  const status = documentRef?.getElementById?.(statusId)
    || directoryPickerStatusElement(button, documentRef);
  if (!status) return;
  status.replaceChildren?.();
  status.textContent = "";
  status.hidden = true;
  status.dataset.kind = "";
}

export function setDirectoryPickerStatus(button, payloadValue, options = {}) {
  const documentRef = options.documentRef || button?.ownerDocument || globalThis.document;
  const result = directoryPickerError(payloadValue, options.subject || "文件夹");
  if (result.cancelled) {
    clearDirectoryPickerStatus(button, documentRef);
    return null;
  }
  const status = directoryPickerStatusElement(button, documentRef);
  if (!status) return result;
  status.replaceChildren?.();
  status.textContent = result.message;
  status.hidden = false;
  status.dataset.kind = options.kind || "error";
  if (result.guidance) {
    const guidance = documentRef.createElement("span");
    guidance.className = "directory-picker-guidance";
    guidance.textContent = result.guidance;
    status.appendChild(guidance);
  }
  const diagnostic = [
    result.stage ? `阶段：${result.stage}` : "",
    result.errorCode ? `错误代码：${result.errorCode}` : "",
    result.cleanupErrorCode ? `清理错误：${result.cleanupErrorCode}` : "",
    result.cleanupFileName ? `清理文件名：${result.cleanupFileName}` : "",
  ].filter(Boolean).join("；");
  if (diagnostic) {
    const details = documentRef.createElement("details");
    const summary = documentRef.createElement("summary");
    const code = documentRef.createElement("code");
    summary.textContent = "技术详情";
    code.textContent = diagnostic;
    details.append(summary, code);
    status.appendChild(details);
  }
  return result;
}

export { directoryPickerError };
