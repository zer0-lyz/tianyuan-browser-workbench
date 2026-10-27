import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import {
  clearDirectoryPickerStatus,
  directoryPickerError,
  isDirectoryPickerCancelled,
  setDirectoryPickerStatus,
} from "../extension/src/core/directory-picker.js";
import { detailTableWorkflowModule } from "../extension/src/modules/detail-table-workflow/module.js";
import { detailTableWorkflowTemplate } from "../extension/src/modules/detail-table-workflow/template.js";
import { declarationTableWorkflowModule } from "../extension/src/modules/declaration-table-workflow/module.js";
import { declarationTableWorkflowTemplate } from "../extension/src/modules/declaration-table-workflow/template.js";

const require = createRequire(import.meta.url);
const directoryPicker = require("../native-helper/directory-picker.js");
const platformCommon = require("../native-helper/platform/common.js");
const { createPlatformAdapter } = require("../native-helper/platform/index.js");
const PICKER_MARKER = "TIANYUAN_PICKER_RESULT:";

function withCode(code) {
  return Object.assign(new Error("injected filesystem failure"), { code });
}

function fsFailureFacade(stage, code, baseFs = fs) {
  const facade = Object.create(baseFs);
  let realpathCount = 0;
  let statCount = 0;
  const realpath = (...args) => baseFs.realpathSync(...args);
  realpath.native = (...args) => {
    realpathCount += 1;
    if (stage === "parent_path_resolve" && realpathCount === 1) throw withCode(code);
    if (stage === "managed_directory_resolve" && realpathCount === 2) throw withCode(code);
    return baseFs.realpathSync.native(...args);
  };
  facade.realpathSync = realpath;
  facade.statSync = (...args) => {
    statCount += 1;
    if (stage === "parent_path_validate" && statCount === 1) throw withCode(code);
    return baseFs.statSync(...args);
  };
  facade.mkdirSync = (...args) => {
    if (stage === "managed_directory_create") throw withCode(code);
    return baseFs.mkdirSync(...args);
  };
  facade.openSync = (...args) => baseFs.openSync(...args);
  facade.writeSync = (...args) => {
    if (stage === "write_probe") throw withCode(code);
    return baseFs.writeSync(...args);
  };
  facade.fsyncSync = (...args) => baseFs.fsyncSync(...args);
  facade.closeSync = (...args) => baseFs.closeSync(...args);
  facade.unlinkSync = (...args) => baseFs.unlinkSync(...args);
  return facade;
}

function newTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-directory-picker-"));
}

function getWindowsShortPath(targetPath) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DirectoryPickerShortPath {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern uint GetShortPathName(string longPath, StringBuilder shortPath, uint bufferLength);
  public static string Get(string longPath) {
    uint required = GetShortPathName(longPath, null, 0);
    if (required == 0) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    var buffer = new StringBuilder((int)required);
    if (GetShortPathName(longPath, buffer, (uint)buffer.Capacity) == 0)
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    return buffer.ToString();
  }
}
'@
[Console]::WriteLine([DirectoryPickerShortPath]::Get($env:TIANYUAN_DIRECTORY_PICKER_TEST_PATH))
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return execFileSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encoded,
  ], {
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, TIANYUAN_DIRECTORY_PICKER_TEST_PATH: targetPath },
  }).trim();
}

function cleanupTestRoot(targetValue) {
  const tempParent = path.resolve(os.tmpdir());
  const target = path.resolve(String(targetValue || ""));
  assert.ok(path.isAbsolute(target), "temporary cleanup target must be absolute");
  assert.equal(path.dirname(target), tempParent, "temporary cleanup target must be a direct child of os.tmpdir()");
  assert.match(path.basename(target), /^tianyuan-directory-picker-[a-zA-Z0-9-]+$/);
  const stat = fs.lstatSync(target);
  assert.equal(stat.isDirectory(), true, "temporary cleanup target must be a directory");
  assert.equal(stat.isSymbolicLink(), false, "temporary cleanup target must not be a symbolic link");
  fs.rmSync(target, { recursive: true, force: false });
}

function makeWindowsAdapter(execFile) {
  const root = path.join(os.tmpdir(), "tianyuan-picker-adapter-test");
  return createPlatformAdapter({
    platform: "win32",
    homeDir: path.join(root, "home"),
    env: { LOCALAPPDATA: path.join(root, "local-app-data") },
    execFileSync: () => "available",
    execFile,
  });
}

class FakeElement {
  constructor(tagName, documentRef) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = documentRef;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.hidden = false;
    this.textContent = "";
    this.className = "";
    this.parentElement = null;
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.handlers = new Map();
    this.classList = {
      toggle: (name, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(" ");
      },
    };
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  append(...items) { for (const item of items) this.appendChild(item); }
  replaceChildren(...items) { this.children = []; this.textContent = ""; this.append(...items); }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  closest() { return this.closestRow || null; }
  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parentElement = null;
  }
  async trigger(type) { return await this.handlers.get(type)?.(); }
  insertAdjacentElement(position, element) {
    assert.equal(position, "afterend");
    const parent = this.parentElement;
    const index = parent.children.indexOf(this);
    element.parentElement = parent;
    parent.children.splice(index + 1, 0, element);
    this.ownerDocument.elements.set(element.id, element);
    return element;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.head = this.createElement("head");
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  getElementById(id) { return this.elements.get(id) || null; }
  add(element, id) { element.id = id; this.elements.set(id, element); return element; }
}

function createWorkflowHarness({ module, template, pageId, storageState, pickerButtonId, pickerInputId, saveButtonId }) {
  const documentRef = new FakeDocument();
  documentRef.add(documentRef.createElement("main"), pageId);
  const idPattern = /<([A-Za-z][\w-]*)\b[^>]*\bid="([^"]+)"/g;
  for (const match of template.matchAll(idPattern)) {
    documentRef.add(documentRef.createElement(match[1]), match[2]);
  }
  const wrapperId = pageId === "page-export-detail"
    ? "detailTableWorkflowOutputDirectoryWrap"
    : "declarationTableWorkflowOutputDirectoryWrap";
  const wrapper = documentRef.getElementById(wrapperId);
  const row = documentRef.createElement("div");
  row.className = "directory-row";
  wrapper.appendChild(row);
  const input = documentRef.getElementById(pickerInputId);
  const button = documentRef.getElementById(pickerButtonId);
  row.append(input, button);
  button.closestRow = row;

  const savedConfigs = [];
  const nativeReplies = [];
  const context = {
    document: documentRef,
    manifest: module.manifest,
    chrome: { runtime: { getURL: (value) => `chrome-extension://test/${value}` } },
    scope: {
      on(element, type, handler) { if (element?.addEventListener) element.addEventListener(type, handler); },
      add() {},
    },
    storage: {
      async load() { return { ...storageState }; },
      async save(value) { savedConfigs.push({ ...value }); },
    },
    eventBus: { publish() {} },
    async sendNativeMessage() { return nativeReplies.shift(); },
    isDirectoryPickerCancelled,
    setDirectoryPickerStatus: (target, payload, options) => setDirectoryPickerStatus(target, payload, { documentRef, ...options }),
    clearDirectoryPickerStatus: (target) => clearDirectoryPickerStatus(target, documentRef),
    setStatus() {},
  };
  return {
    async initialize() { await module.create().initialize(context); },
    button,
    documentRef,
    input,
    nativeReplies,
    saveButton: documentRef.getElementById(saveButtonId),
    savedConfigs,
  };
}

test("real temporary directory with Chinese and spaces is prepared, probed, and reused", () => {
  const tempRoot = newTempRoot();
  try {
    const parent = path.join(tempRoot, "项目资料 中文目录");
    fs.mkdirSync(parent);
    const first = directoryPicker.prepareManagedOutputDirectory(parent, "输出结果 中文 文件夹", {
      action: "print_output_directory_selected",
      failureReason: "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED",
    });
    assert.equal(first.ok, true);
    assert.equal(first.parentPath, fs.realpathSync.native(parent));
    assert.equal(fs.statSync(first.outputDirectory).isDirectory(), true);
    assert.deepEqual(fs.readdirSync(first.outputDirectory), []);
    assert.equal(first.createdDirectory, true);

    fs.writeFileSync(path.join(first.outputDirectory, "保留.txt"), "existing content");
    const second = directoryPicker.prepareManagedOutputDirectory(parent, "输出结果 中文 文件夹");
    assert.equal(second.ok, true);
    assert.equal(second.createdDirectory, false);
    assert.equal(fs.readFileSync(path.join(second.outputDirectory, "保留.txt"), "utf8"), "existing content");
    assert.deepEqual(fs.readdirSync(second.outputDirectory), ["保留.txt"]);
  } finally {
    cleanupTestRoot(tempRoot);
  }
});

test("a successful picker response without a path becomes an explicit failure; cancellation stays quiet", () => {
  const empty = directoryPicker.directorySelectionFailure({ ok: true, paths: [] }, {
    action: "print_output_directory_selected",
    failureReason: "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED",
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.cancelled, false);
  assert.equal(empty.reason, "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED");
  assert.equal(empty.stage, "picker_result");
  assert.equal(empty.errorCode, "EMPTY_RESULT");
  assert.match(empty.userMessage, /没有返回文件夹/);
  assert.deepEqual(empty.paths, []);
  assert.equal(empty.outputDirectory, "");

  const cancelled = directoryPicker.directorySelectionFailure({
    ok: false,
    cancelled: true,
    reason: "FILE_SELECTION_CANCELLED",
  }, { action: "print_output_directory_selected" });
  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.cancelled, true);
  assert.equal("userMessage" in cancelled, false);

  const legacyFailure = directoryPicker.directorySelectionFailure({
    ok: false,
    cancelled: false,
    reason: "FILE_SELECTION_CANCELLED",
    stage: "picker_execution",
    errorCode: "ENOENT",
  }, { action: "print_output_directory_selected" });
  assert.equal(legacyFailure.ok, false);
  assert.equal(legacyFailure.cancelled, false);
  assert.equal(legacyFailure.errorCode, "ENOENT");
  assert.match(legacyFailure.userMessage, /选择器无法启动/);
  assert.equal(isDirectoryPickerCancelled(legacyFailure), false);
  assert.equal(isDirectoryPickerCancelled({ reason: "FILE_SELECTION_CANCELLED" }), true);
});

test("an output child occupied by a same-name file returns a distinct conflict stage", () => {
  const tempRoot = newTempRoot();
  try {
    const parent = path.join(tempRoot, "上级");
    fs.mkdirSync(parent);
    fs.writeFileSync(path.join(parent, "同名目录"), "do not overwrite");
    const result = directoryPicker.prepareManagedOutputDirectory(parent, "同名目录", {
      failureReason: "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED");
    assert.equal(result.stage, "managed_directory_create");
    assert.equal(result.errorCode, "EEXIST");
    assert.match(result.userMessage, /同名文件/);
    assert.equal(fs.readFileSync(path.join(parent, "同名目录"), "utf8"), "do not overwrite");
  } finally {
    cleanupTestRoot(tempRoot);
  }
});

test("a removed parent is reported as ENOENT without claiming a permission failure", () => {
  const tempRoot = newTempRoot();
  try {
    const parent = path.join(tempRoot, "vanished");
    fs.mkdirSync(parent);
    fs.rmdirSync(parent);
    const result = directoryPicker.prepareManagedOutputDirectory(parent, "result");
    assert.equal(result.ok, false);
    assert.equal(result.stage, "parent_path_resolve");
    assert.equal(result.errorCode, "ENOENT");
    assert.doesNotMatch(result.userMessage, /权限|拒绝访问/);
  } finally {
    cleanupTestRoot(tempRoot);
  }
});

test("native payload stages, codes, old reasons, and unknown errors render as Chinese beside a button", () => {
  const tempRoot = newTempRoot();
  try {
    const parent = path.join(tempRoot, "权限父目录");
    fs.mkdirSync(parent);
    const deniedAtParent = directoryPicker.prepareManagedOutputDirectory(parent, "output", {
      fs: fsFailureFacade("parent_path_resolve", "EACCES"),
      failureReason: "LAND_OUTPUT_DIRECTORY_CREATE_FAILED",
    });
    const formatted = directoryPickerError(deniedAtParent, "土地输出目录");
    assert.equal(formatted.stage, "PARENT_PATH_RESOLVE");
    assert.equal(formatted.errorCode, "EACCES");
    assert.match(formatted.message, /無法|无法/);
    assert.match(formatted.message, /访问所选目录/);
    assert.doesNotMatch(formatted.message, new RegExp(parent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const deniedAtWrite = directoryPicker.prepareManagedOutputDirectory(parent, "write denied", {
      fs: fsFailureFacade("write_probe", "EACCES"),
      failureReason: "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED",
    });
    assert.equal(deniedAtWrite.stage, "write_probe");
    assert.match(directoryPickerError(deniedAtWrite, "打印输出目录").message, /新建文件/);

    const legacy = directoryPickerError({ ok: false, reason: "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED" }, "打印输出目录");
    assert.match(legacy.message, /无法完成目录准备/);
    assert.doesNotMatch(legacy.message, /权限不足/);

    const unknown = directoryPickerError({ ok: false, reason: "FUTURE_UNKNOWN_FAILURE" }, "输出目录");
    assert.match(unknown.message, /无法完成/);
    assert.doesNotMatch(unknown.message, /权限|拒绝访问/);
    assert.equal(isDirectoryPickerCancelled({ reason: "FILE_SELECTION_CANCELLED" }), true);

    const documentRef = new FakeDocument();
    const wrapper = documentRef.add(documentRef.createElement("section"), "wrapper");
    const row = wrapper.appendChild(documentRef.createElement("div"));
    const button = documentRef.add(documentRef.createElement("button"), "chooseOutput");
    button.closestRow = row;
    row.appendChild(button);
    const visible = setDirectoryPickerStatus(button, deniedAtParent, { documentRef, subject: "土地输出目录" });
    const status = documentRef.getElementById("chooseOutput-status");
    assert.equal(status.tagName, "DIV");
    assert.equal(status.attributes.role, "status");
    assert.equal(status.hidden, false);
    assert.equal(status.dataset.kind, "error");
    assert.equal(wrapper.children[1], status);
    assert.equal(status.children[0].textContent, visible.guidance);
    assert.equal(status.children.at(-1).tagName, "DETAILS");
    assert.match(status.children.at(-1).children[1].textContent, /阶段：PARENT_PATH_RESOLVE；错误代码：EACCES/);

    setDirectoryPickerStatus(button, {
      ok: false,
      reason: "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED",
      stage: "write_probe_cleanup",
      errorCode: "EPERM",
      cleanupErrorCode: "EACCES",
      cleanupFileName: ".tianyuan-directory-write-probe-test.tmp",
      userMessage: "已创建目录，但无法清理本次临时写入检查文件。",
    }, { documentRef, subject: "打印输出目录" });
    assert.match(status.children.at(-1).children[1].textContent, /清理错误：EACCES/);
    assert.match(status.children.at(-1).children[1].textContent, /清理文件名：\.tianyuan-directory-write-probe-test\.tmp/);
    assert.equal(directoryPickerError({
      reason: "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED",
      cleanupFileName: "C:\\private\\file.tmp",
    }, "打印输出目录").cleanupFileName, "");

    setDirectoryPickerStatus(button, { reason: "FILE_SELECTION_CANCELLED" }, { documentRef });
    assert.equal(status.hidden, true);
    assert.equal(status.children.length, 0);
  } finally {
    cleanupTestRoot(tempRoot);
  }
});

test("detail and declaration output-directory handlers retain settings on failure and clear the message after retry", async (t) => {
  const cases = [
    {
      name: "明细表",
      module: detailTableWorkflowModule,
      template: detailTableWorkflowTemplate,
      pageId: "page-export-detail",
      pickerButtonId: "chooseDetailTableWorkflowOutput",
      pickerInputId: "detailTableWorkflowOutputDirectory",
      saveButtonId: "saveDetailTableWorkflow",
      messageId: "detailTableWorkflowMessage",
    },
    {
      name: "申报表",
      module: declarationTableWorkflowModule,
      template: declarationTableWorkflowTemplate,
      pageId: "page-export-declare",
      pickerButtonId: "chooseDeclarationTableWorkflowOutput",
      pickerInputId: "declarationTableWorkflowOutputDirectory",
      saveButtonId: "saveDeclarationTableWorkflow",
      messageId: "declarationTableWorkflowMessage",
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const oldPath = `C:\\旧目录\\${item.name}导出与整理`;
      const newPath = `C:\\新目录\\${item.name}导出与整理`;
      const harness = createWorkflowHarness({
        ...item,
        storageState: { mode: "manual_files", outputMode: "new_directory", outputDirectory: oldPath },
      });
      await harness.initialize();
      assert.equal(harness.input.value, oldPath);

      harness.nativeReplies.push({
        ok: false,
        cancelled: false,
        reason: "FILE_SELECTION_CANCELLED",
        stage: "picker_execution",
        errorCode: "ENOENT",
        userMessage: "本机目录选择器无法启动。请确认工作台本机组件可用，然后重试；原有设置已保留。",
        guidance: "检查本机组件后重新选择目录。",
      });
      await harness.button.trigger("click");

      assert.equal(harness.input.value, oldPath);
      const status = harness.documentRef.getElementById(`${item.pickerButtonId}-status`);
      assert.equal(status.hidden, false);
      assert.equal(status.attributes.role, "status");
      assert.match(status.textContent, /目录选择器无法启动/);
      assert.match(status.children[0].textContent, /检查本机组件/);
      await harness.saveButton.trigger("click");
      assert.equal(harness.savedConfigs.at(-1).outputDirectory, oldPath);

      harness.nativeReplies.push({
        ok: true,
        path: newPath,
        paths: [newPath],
        outputDirectory: newPath,
        directoryName: `${item.name}导出与整理`,
      });
      await harness.button.trigger("click");
      assert.equal(harness.input.value, newPath);
      assert.equal(status.hidden, true);
      assert.equal(status.children.length, 0);
      await harness.saveButton.trigger("click");
      assert.equal(harness.savedConfigs.at(-1).outputDirectory, newPath);
    });
  }
});

test("filesystem failure injection preserves OS codes and removes only the created probe file", () => {
  const tempRoot = newTempRoot();
  try {
    const parent = path.join(tempRoot, "可写父目录");
    fs.mkdirSync(parent);
    const cases = [
      ["parent_path_resolve", "ENOENT"],
      ["write_probe", "EACCES"],
      ["write_probe", "EPERM"],
      ["write_probe", "ENOSPC"],
      ["write_probe", "EROFS"],
      ["write_probe", "ENAMETOOLONG"],
      ["write_probe", "ENETUNREACH"],
    ];
    for (const [stage, code] of cases) {
      const result = directoryPicker.prepareManagedOutputDirectory(parent, `${stage}-${code}`, {
        fs: fsFailureFacade(stage, code),
        failureReason: "PRINT_OUTPUT_DIRECTORY_CREATE_FAILED",
      });
      assert.equal(result.ok, false, `${stage}/${code}`);
      assert.equal(result.stage, stage);
      assert.equal(result.errorCode, code);
      if (stage === "write_probe") {
        const outputPath = path.join(parent, `${stage}-${code}`);
        assert.equal(fs.existsSync(outputPath), true);
        assert.deepEqual(fs.readdirSync(outputPath), [], `${stage}/${code} probe was not removed`);
      }
    }
    const network = directoryPicker.prepareManagedOutputDirectory(parent, "network-failure", {
      fs: fsFailureFacade("write_probe", "EHOSTUNREACH"),
    });
    assert.equal(network.errorCode, "EHOSTUNREACH");
    assert.match(network.userMessage, /网络位置/);
  } finally {
    cleanupTestRoot(tempRoot);
  }
});

test("long paths are prepared when the host filesystem supports them", (t) => {
  const tempRoot = newTempRoot();
  try {
    let parent = path.join(tempRoot, "long-path");
    fs.mkdirSync(parent);
    let segment = 0;
    while (parent.length < 280 && segment < 10) {
      parent = path.join(parent, `segment-${String(segment).padStart(2, "0")}-${"x".repeat(27)}`);
      segment += 1;
    }
    try {
      fs.mkdirSync(parent, { recursive: true });
    } catch (error) {
      if (error?.code === "ENAMETOOLONG" || error?.code === "EPERM") {
        t.skip(`host cannot create long temporary paths (${error.code})`);
        return;
      }
      throw error;
    }
    const result = directoryPicker.prepareManagedOutputDirectory(parent, "结果");
    assert.equal(result.ok, true);
    assert.ok(result.outputDirectory.length > 260);
    assert.equal(fs.statSync(result.outputDirectory).isDirectory(), true);
    assert.deepEqual(fs.readdirSync(result.outputDirectory), []);
  } finally {
    cleanupTestRoot(tempRoot);
  }
});

test("Windows short path alias is canonicalized when the filesystem provides one", (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows 8.3 short paths are not available on this host");
    return;
  }
  const tempRoot = newTempRoot();
  try {
    const parent = path.join(tempRoot, "folder with spaces 中文");
    fs.mkdirSync(parent);
    const output = getWindowsShortPath(parent);
    if (!output || output.toLowerCase() === parent.toLowerCase()) {
      t.skip("8.3 names are disabled for the temporary directory volume");
      return;
    }
    const result = directoryPicker.prepareManagedOutputDirectory(output, "结果");
    assert.equal(result.ok, true);
    assert.equal(result.parentPath, fs.realpathSync.native(parent));
    assert.equal(result.outputDirectory, fs.realpathSync.native(path.join(parent, "结果")));
    assert.deepEqual(fs.readdirSync(result.outputDirectory), []);
  } finally {
    cleanupTestRoot(tempRoot);
  }
});

test("Windows picker marker distinguishes cancel; PowerShell failures and timeouts remain failures", async () => {
  let seenScript = "";
  const cancelAdapter = makeWindowsAdapter((_command, args, _options, callback) => {
    seenScript = Buffer.from(args.at(-1), "base64").toString("utf16le");
    callback(null, `${PICKER_MARKER}{"cancelled":true,"paths":[]}`);
  });
  const cancelled = await cancelAdapter.chooseDirectory("选择目录");
  assert.equal(cancelled.cancelled, true);
  assert.match(seenScript, /TIANYUAN_PICKER_RESULT/);
  assert.doesNotMatch(seenScript, /exit 2/);

  const failureAdapter = makeWindowsAdapter((_command, _args, _options, callback) => {
    const error = withCode(1);
    error.stderr = "injected command failure";
    callback(error, "");
  });
  const failed = await failureAdapter.chooseDirectory("选择目录");
  assert.equal(failed.ok, false);
  assert.equal(failed.cancelled, false);
  assert.equal(failed.errorCode, "PROCESS_EXIT_1");
  assert.equal(JSON.stringify(failed).includes("injected command failure"), false);

  const timeoutAdapter = makeWindowsAdapter((_command, _args, _options, callback) => {
    const error = Object.assign(new Error("timed out"), { killed: true, signal: "SIGTERM" });
    callback(error, "");
  });
  const timedOut = await timeoutAdapter.chooseDirectory("选择目录");
  assert.equal(timedOut.cancelled, false);
  assert.equal(timedOut.reason, "FILE_PICKER_TIMEOUT");
  assert.equal(timedOut.errorCode, "ETIMEDOUT");

  const legacyExitTwoAdapter = makeWindowsAdapter((_command, _args, _options, callback) => {
    callback(withCode(2), "");
  });
  assert.equal((await legacyExitTwoAdapter.chooseDirectory("选择目录")).cancelled, true);
});

test("Windows picker requires its JSON marker, accepts BOM output, and rejects an empty path list", async () => {
  const path = "C:\\中文 空格\\输出";
  const bomAdapter = makeWindowsAdapter((_command, _args, _options, callback) => {
    callback(null, `\uFEFF\r\n  ${PICKER_MARKER}${JSON.stringify({ cancelled: false, paths: [path] })}\r\n`);
  });
  const success = await bomAdapter.chooseDirectory("选择目录");
  assert.equal(success.ok, true);
  assert.deepEqual(success.paths, [path]);

  const missingMarkerAdapter = makeWindowsAdapter((_command, _args, _options, callback) => {
    callback(null, `\uFEFF\r\n${path}\r\nPowerShell diagnostic output`);
  });
  const missingMarker = await missingMarkerAdapter.chooseDirectory("选择目录");
  assert.equal(missingMarker.ok, false);
  assert.equal(missingMarker.reason, "FILE_PICKER_RESULT_INVALID");
  assert.equal(missingMarker.errorCode, "RESULT_MARKER_MISSING");
  assert.equal("paths" in missingMarker, false);

  const emptyAdapter = makeWindowsAdapter((_command, _args, _options, callback) => {
    callback(null, `${PICKER_MARKER}${JSON.stringify({ cancelled: false, paths: ["  ", ""] })}`);
  });
  const empty = await emptyAdapter.chooseDirectory("选择目录");
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "FILE_PICKER_EMPTY_RESULT");
  assert.equal(empty.errorCode, "EMPTY_RESULT");

  assert.equal(platformCommon.pickerResult("C:\\legacy-path").paths[0], "C:\\legacy-path");
  assert.equal(platformCommon.pickerResult("\uFEFF  \r\n", { requireMarker: true }).ok, false);
});

test("macOS User canceled and -128 remain quiet, while generic exit 1 is not cancellation", async () => {
  const cancelAdapter = createPlatformAdapter({
    platform: "darwin",
    homeDir: path.join(os.tmpdir(), "tianyuan-picker-macos-test-home"),
    execFile(_command, _args, _options, callback) {
      callback(Object.assign(new Error("User canceled. (-128)"), { code: 1, stderr: "User canceled. (-128)" }), "");
    },
  });
  const cancelled = await cancelAdapter.chooseDirectory("选择目录");
  assert.equal(cancelled.cancelled, true);

  const failureAdapter = createPlatformAdapter({
    platform: "darwin",
    homeDir: path.join(os.tmpdir(), "tianyuan-picker-macos-test-failure-home"),
    execFile(_command, _args, _options, callback) {
      callback(Object.assign(new Error("AppleScript failed"), { code: 1, stderr: "failure detail" }), "");
    },
  });
  const failed = await failureAdapter.chooseDirectory("选择目录");
  assert.equal(failed.cancelled, false);
  assert.equal(failed.errorCode, "PROCESS_EXIT_1");
  assert.equal(JSON.stringify(failed).includes("failure detail"), false);
});
