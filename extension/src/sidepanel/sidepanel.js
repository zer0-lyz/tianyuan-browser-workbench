const REQUEST_TYPE = "TIANYUAN_WORKBENCH_GET_CONTEXT_V2";
const ACTION_REQUEST_TYPE = "TIANYUAN_WORKBENCH_RUN_ACTION_V2";
const HELPER_BASE_URL = "http://127.0.0.1:8765";
const CONNECTOR_BASE_URL = "http://127.0.0.1:40415";
const NATIVE_HOST_NAME = "com.tianyuan.workbench.helper";
const STORAGE_CONNECTOR_SESSION_KEY = "tianyuanWorkbenchConnectorSessionId";
const STORAGE_LAST_BATCH_RESULT_KEY = "tianyuanWorkbenchLastBatchResult";
const STORAGE_LAST_EXPORT_RESULT_KEY = "tianyuanWorkbenchLastExportResult";
const COMPANY_HIERARCHY_CODE_KEYS = [
  "displayCode",
  "display_code",
  "treeCode",
  "tree_code",
  "hierarchyCode",
  "hierarchy_code",
  "levelCode",
  "level_code",
  "nodeCode",
  "node_code",
  "relationCode",
  "relation_code",
  "sortCode",
  "sort_code",
  "sortNo",
  "sort_no",
  "serialNo",
  "serial_no",
  "serialNumber",
  "serial_number",
  "sequence",
  "seq",
  "seqNo",
  "seq_no",
  "orderNo",
  "order_no",
  "ordinal",
  "index",
  "idx",
  "rowNo",
  "row_no",
  "num",
  "number",
  "codeNo",
  "code_no",
  "编码",
  "公司编号",
  "层级编码",
  "序号",
];

const elements = {
  goHome: document.getElementById("goHome"),
  openConnectionsTopConnector: document.getElementById("openConnectionsTopConnector"),
  openConnectionsTop: document.getElementById("openConnectionsTop"),
  openConnectionsTopMcp: document.getElementById("openConnectionsTopMcp"),
  openConnectionsTopCli: document.getElementById("openConnectionsTopCli"),
  openBatchSave: document.getElementById("openBatchSave"),
  openBatchExit: document.getElementById("openBatchExit"),
  openExportDetail: document.getElementById("openExportDetail"),
  openExportDeclare: document.getElementById("openExportDeclare"),
  openFormatDetail: document.getElementById("openFormatDetail"),
  openFormatDeclaration: document.getElementById("openFormatDeclaration"),
  backFromConnections: document.getElementById("backFromConnections"),
  backFromSave: document.getElementById("backFromSave"),
  backFromExit: document.getElementById("backFromExit"),
  backFromExportDetail: document.getElementById("backFromExportDetail"),
  backFromExportDeclare: document.getElementById("backFromExportDeclare"),
  backFromFormatDetail: document.getElementById("backFromFormatDetail"),
  backFromFormatDeclaration: document.getElementById("backFromFormatDeclaration"),
  pageHome: document.getElementById("page-home"),
  pageConnections: document.getElementById("page-connections"),
  pageBatchSave: document.getElementById("page-batch-save"),
  pageBatchExit: document.getElementById("page-batch-exit"),
  pageExportDetail: document.getElementById("page-export-detail"),
  pageExportDeclare: document.getElementById("page-export-declare"),
  pageFormatDetail: document.getElementById("page-format-detail"),
  pageFormatDeclaration: document.getElementById("page-format-declaration"),
  scopeSection: document.getElementById("scopeSection"),
  supportSection: document.getElementById("supportSection"),
  saveScopeMount: document.getElementById("saveScopeMount"),
  exitScopeMount: document.getElementById("exitScopeMount"),
  detailScopeMount: document.getElementById("detailScopeMount"),
  declareScopeMount: document.getElementById("declareScopeMount"),
  saveSupportMount: document.getElementById("saveSupportMount"),
  exitSupportMount: document.getElementById("exitSupportMount"),
  detailSupportMount: document.getElementById("detailSupportMount"),
  declareSupportMount: document.getElementById("declareSupportMount"),
  detailPrintSupportMount: document.getElementById("detailPrintSupportMount"),
  declarationPrintSupportMount: document.getElementById("declarationPrintSupportMount"),
  subtitle: document.getElementById("subtitle"),
  homePageState: document.getElementById("homePageState"),
  refresh: document.getElementById("refresh"),
  copyJson: document.getElementById("copyJson"),
  runBatchSave: document.getElementById("runBatchSave"),
  runBatchExit: document.getElementById("runBatchExit"),
  runExportDetail: document.getElementById("runExportDetail"),
  runExportDeclare: document.getElementById("runExportDeclare"),
  detailOutputPath: document.getElementById("detailOutputPath"),
  declareOutputPath: document.getElementById("declareOutputPath"),
  chooseDetailOutputPath: document.getElementById("chooseDetailOutputPath"),
  chooseDeclareOutputPath: document.getElementById("chooseDeclareOutputPath"),
  detailProgressBar: document.getElementById("detailProgressBar"),
  declareProgressBar: document.getElementById("declareProgressBar"),
  detailProgressText: document.getElementById("detailProgressText"),
  declareProgressText: document.getElementById("declareProgressText"),
  detailProgressPercent: document.getElementById("detailProgressPercent"),
  declareProgressPercent: document.getElementById("declareProgressPercent"),
  chooseDetailPrintFiles: document.getElementById("chooseDetailPrintFiles"),
  chooseDetailPrintFolder: document.getElementById("chooseDetailPrintFolder"),
  chooseDeclarationPrintFiles: document.getElementById("chooseDeclarationPrintFiles"),
  chooseDeclarationPrintFolder: document.getElementById("chooseDeclarationPrintFolder"),
  detailPrintInputSummary: document.getElementById("detailPrintInputSummary"),
  declarationPrintInputSummary: document.getElementById("declarationPrintInputSummary"),
  detailPrintOutputMode: document.getElementById("detailPrintOutputMode"),
  declarationPrintOutputMode: document.getElementById("declarationPrintOutputMode"),
  detailPrintOutputDirectoryWrap: document.getElementById("detailPrintOutputDirectoryWrap"),
  declarationPrintOutputDirectoryWrap: document.getElementById("declarationPrintOutputDirectoryWrap"),
  detailPrintOutputPath: document.getElementById("detailPrintOutputPath"),
  declarationPrintOutputPath: document.getElementById("declarationPrintOutputPath"),
  chooseDetailPrintOutputPath: document.getElementById("chooseDetailPrintOutputPath"),
  chooseDeclarationPrintOutputPath: document.getElementById("chooseDeclarationPrintOutputPath"),
  detailPrintProgressBar: document.getElementById("detailPrintProgressBar"),
  declarationPrintProgressBar: document.getElementById("declarationPrintProgressBar"),
  detailPrintProgressText: document.getElementById("detailPrintProgressText"),
  declarationPrintProgressText: document.getElementById("declarationPrintProgressText"),
  detailPrintProgressPercent: document.getElementById("detailPrintProgressPercent"),
  declarationPrintProgressPercent: document.getElementById("declarationPrintProgressPercent"),
  runDetailPrintFormat: document.getElementById("runDetailPrintFormat"),
  runDeclarationPrintFormat: document.getElementById("runDeclarationPrintFormat"),
  checkConnections: document.getElementById("checkConnections"),
  startConnector: document.getElementById("startConnector"),
  bindCurrentPage: document.getElementById("bindCurrentPage"),
  configureMcp: document.getElementById("configureMcp"),
  authorizeCli: document.getElementById("authorizeCli"),
  mcpTokenDialog: document.getElementById("mcpTokenDialog"),
  mcpTokenInput: document.getElementById("mcpTokenInput"),
  clearMcpToken: document.getElementById("clearMcpToken"),
  cancelMcpToken: document.getElementById("cancelMcpToken"),
  confirmMcpToken: document.getElementById("confirmMcpToken"),
  status: document.getElementById("status"),
  json: document.getElementById("json"),
  connectorStatus: document.getElementById("connectorStatus"),
  connectorBindingStatus: document.getElementById("connectorBindingStatus"),
  connectorSessionId: document.getElementById("connectorSessionId"),
  connectorProject: document.getElementById("connectorProject"),
  connectorPage: document.getElementById("connectorPage"),
  connectorLastSeen: document.getElementById("connectorLastSeen"),
  connectorCodexBindingStatus: document.getElementById("connectorCodexBindingStatus"),
  connectorBindingId: document.getElementById("connectorBindingId"),
  refreshConnectorCatalog: document.getElementById("refreshConnectorCatalog"),
  connectorProjectSelect: document.getElementById("connectorProjectSelect"),
  connectorProjectPicker: document.getElementById("connectorProjectPicker"),
  connectorProjectPickerButton: document.getElementById("connectorProjectPickerButton"),
  connectorProjectPickerMenu: document.getElementById("connectorProjectPickerMenu"),
  connectorProjectFilter: document.getElementById("connectorProjectFilter"),
  connectorProjectPickerList: document.getElementById("connectorProjectPickerList"),
  connectorBindingScope: document.getElementById("connectorBindingScope"),
  connectorThreadField: document.getElementById("connectorThreadField"),
  connectorThreadSelect: document.getElementById("connectorThreadSelect"),
  connectorThreadPicker: document.getElementById("connectorThreadPicker"),
  connectorThreadPickerButton: document.getElementById("connectorThreadPickerButton"),
  connectorThreadPickerMenu: document.getElementById("connectorThreadPickerMenu"),
  connectorThreadFilter: document.getElementById("connectorThreadFilter"),
  connectorThreadPickerList: document.getElementById("connectorThreadPickerList"),
  saveConnectorBinding: document.getElementById("saveConnectorBinding"),
  bindConnectorCurrentThread: document.getElementById("bindConnectorCurrentThread"),
  clearConnectorBinding: document.getElementById("clearConnectorBinding"),
  connectorBindingFeedback: document.getElementById("connectorBindingFeedback"),
  refreshAgentSources: document.getElementById("refreshAgentSources"),
  agentSourceList: document.getElementById("agentSourceList"),
  agentBindingList: document.getElementById("agentBindingList"),
  manualAgentDisplayName: document.getElementById("manualAgentDisplayName"),
  manualAgentWorkspaceId: document.getElementById("manualAgentWorkspaceId"),
  manualAgentWorkspaceName: document.getElementById("manualAgentWorkspaceName"),
  manualAgentConversationId: document.getElementById("manualAgentConversationId"),
  manualAgentConversationTitle: document.getElementById("manualAgentConversationTitle"),
  manualAgentScope: document.getElementById("manualAgentScope"),
  manualAgentAccess: document.getElementById("manualAgentAccess"),
  addManualAgent: document.getElementById("addManualAgent"),
  manualAgentFeedback: document.getElementById("manualAgentFeedback"),
  connectorCapabilitySummary: document.getElementById("connectorCapabilitySummary"),
  connectorCapabilities: document.getElementById("connectorCapabilities"),
  helperStatus: document.getElementById("helperStatus"),
  mcpStatus: document.getElementById("mcpStatus"),
  cliStatus: document.getElementById("cliStatus"),
  extensionId: document.getElementById("extensionId"),
  connectionMessage: document.getElementById("connectionMessage"),
  subjectList: document.getElementById("subjectList"),
  loadSubjects: document.getElementById("loadSubjects"),
  subjectSelectionActions: document.getElementById("subjectSelectionActions"),
  subjectSelectionStatus: document.getElementById("subjectSelectionStatus"),
  selectAllSubjects: document.getElementById("selectAllSubjects"),
  clearAllSubjects: document.getElementById("clearAllSubjects"),
  confirmSubjects: document.getElementById("confirmSubjects"),
  companyList: document.getElementById("companyList"),
  loadCompanies: document.getElementById("loadCompanies"),
  companySelectionActions: document.getElementById("companySelectionActions"),
  companySelectionStatus: document.getElementById("companySelectionStatus"),
  companySourceStatus: document.getElementById("companySourceStatus"),
  companyScopePanel: document.getElementById("companyScopePanel"),
  subjectScopePanel: document.getElementById("subjectScopePanel"),
  selectAllCompanies: document.getElementById("selectAllCompanies"),
  clearAllCompanies: document.getElementById("clearAllCompanies"),
  confirmCompanies: document.getElementById("confirmCompanies"),
  companyFiltersWrap: document.getElementById("companyFiltersWrap"),
  saveMode: document.getElementById("saveMode"),
  executeConfirm: document.getElementById("executeConfirm"),
  executeConfirmWrap: document.getElementById("executeConfirmWrap"),
  exitMode: document.getElementById("exitMode"),
  exitConfirm: document.getElementById("exitConfirm"),
  exitConfirmWrap: document.getElementById("exitConfirmWrap"),
  taskLog: document.getElementById("taskLog"),
  taskLogCount: document.getElementById("taskLogCount"),
  projectId: document.getElementById("projectId"),
  companyId: document.getElementById("companyId"),
  subjectCode: document.getElementById("subjectCode"),
  isEquityList: document.getElementById("isEquityList"),
  isDraft: document.getElementById("isDraft"),
  spreadFound: document.getElementById("spreadFound"),
  sheetName: document.getElementById("sheetName"),
  activeCell: document.getElementById("activeCell"),
  auditField: document.getElementById("auditField"),
  uploadCell: document.getElementById("uploadCell"),
  saveButton: document.getElementById("saveButton"),
  loginState: document.getElementById("loginState"),
  lockText: document.getElementById("lockText"),
  permissionText: document.getElementById("permissionText"),
};

let latestPayload = null;
let latestContext = null;
let busy = false;
let availableSubjects = [];
let availableCompanies = [];
let runtimeMcpToken = "";
let connectorSessionId = "";
let connectorProtocol = null;
let connectorSession = null;
let connectorCatalog = { projects: [], threads: [], updatedAt: null };
let connectorAgentSources = [];
let connectorBindingFormDirty = false;
let connectorActionBusy = false;
let confirmedSubjectCodes = null;
let mcpSubjectListLoaded = false;
let confirmedCompanyValues = null;
let mcpCompanyListLoaded = false;
let lastBatchLogEntries = [];
let currentRoute = "home";
const moduleScopeStates = {
  "batch-save": null,
  "batch-exit": null,
  "export-detail": null,
  "export-declare": null,
  "format-detail": null,
  "format-declaration": null,
};
const printTaskStates = {
  detail: { inputPaths: [] },
  declaration: { inputPaths: [] },
};

const ROUTE_LABELS = {
  home: "首页",
  connections: "连接配置",
  "batch-save": "批量保存底稿",
  "batch-exit": "批量退出编辑",
  "export-detail": "导出明细表",
  "export-declare": "导出申报表",
  "format-detail": "明细表打印格式",
  "format-declaration": "申报表打印格式",
};

elements.extensionId.textContent = chrome.runtime.id;

function on(element, eventName, handler) {
  if (element) element.addEventListener(eventName, handler);
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (values) => resolve(values?.[key]));
  });
}

function storageRemove(key) {
  return new Promise((resolve) => chrome.storage.local.remove([key], resolve));
}

async function clearLegacyMcpToken() {
  await storageRemove("tianyuanWorkbenchMcpToken");
}

function valueOrDash(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function setStatus(text, kind = "idle") {
  elements.status.className = `status status-${kind}`;
  elements.status.textContent = text;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(tab, message) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, message);
    if (response) return response;
  } catch (error) {
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/content.js"],
  });
  return await chrome.tabs.sendMessage(tab.id, message);
}

function setBusy(nextBusy) {
  busy = nextBusy;
  [
    elements.goHome,
    elements.openConnectionsTopConnector,
    elements.openConnectionsTop,
    elements.openConnectionsTopMcp,
    elements.openConnectionsTopCli,
    elements.openBatchSave,
    elements.openBatchExit,
    elements.openExportDetail,
    elements.openExportDeclare,
    elements.openFormatDetail,
    elements.openFormatDeclaration,
    elements.backFromConnections,
    elements.backFromSave,
    elements.backFromExit,
    elements.backFromExportDetail,
    elements.backFromExportDeclare,
    elements.backFromFormatDetail,
    elements.backFromFormatDeclaration,
    elements.refresh,
    elements.copyJson,
    elements.runBatchSave,
    elements.runBatchExit,
    elements.runExportDetail,
    elements.runExportDeclare,
    elements.chooseDetailOutputPath,
    elements.chooseDeclareOutputPath,
    elements.chooseDetailPrintFiles,
    elements.chooseDetailPrintFolder,
    elements.chooseDeclarationPrintFiles,
    elements.chooseDeclarationPrintFolder,
    elements.chooseDetailPrintOutputPath,
    elements.chooseDeclarationPrintOutputPath,
    elements.runDetailPrintFormat,
    elements.runDeclarationPrintFormat,
    elements.detailPrintOutputMode,
    elements.declarationPrintOutputMode,
    elements.checkConnections,
    elements.startConnector,
    elements.bindCurrentPage,
    elements.refreshConnectorCatalog,
    elements.connectorProjectSelect,
    elements.connectorProjectPickerButton,
    elements.connectorProjectFilter,
    elements.connectorBindingScope,
    elements.connectorThreadSelect,
    elements.connectorThreadPickerButton,
    elements.connectorThreadFilter,
    elements.saveConnectorBinding,
    elements.bindConnectorCurrentThread,
    elements.clearConnectorBinding,
    elements.configureMcp,
    elements.authorizeCli,
    elements.loadSubjects,
    elements.selectAllSubjects,
    elements.clearAllSubjects,
    elements.confirmSubjects,
    elements.loadCompanies,
    elements.selectAllCompanies,
    elements.clearAllCompanies,
    elements.confirmCompanies,
    elements.saveMode,
    elements.executeConfirm,
    elements.exitMode,
    elements.exitConfirm,
  ].forEach((element) => {
    if (element) element.disabled = busy;
  });
}

function appendTaskLog(text) {
  const item = document.createElement("li");
  item.textContent = text;
  elements.taskLog.appendChild(item);
  lastBatchLogEntries.push({
    at: new Date().toISOString(),
    text,
  });
  if (elements.taskLogCount) {
    elements.taskLogCount.textContent = `${lastBatchLogEntries.length} 条`;
    elements.taskLogCount.dataset.kind = lastBatchLogEntries.length ? "ok" : "";
  }
}

function clearTaskLog() {
  elements.taskLog.innerHTML = "";
  lastBatchLogEntries = [];
  if (elements.taskLogCount) {
    elements.taskLogCount.textContent = "0 条";
    elements.taskLogCount.dataset.kind = "";
  }
}

function isModuleRoute(route = currentRoute) {
  return [
    "batch-save",
    "batch-exit",
    "export-detail",
    "export-declare",
    "format-detail",
    "format-declaration",
  ].includes(route);
}

function routeNeedsSubjects(route = currentRoute) {
  return route === "batch-save" || route === "batch-exit";
}

function routeNeedsScope(route = currentRoute) {
  return !["format-detail", "format-declaration"].includes(route);
}

function syncSelectedItems() {
  const subjectValues = new Set(getCheckedValues("subjects"));
  availableSubjects = availableSubjects.map((item) => ({
    ...item,
    selected: subjectValues.has(item.value),
  }));
  const companyValues = new Set(getCheckedValues("companies"));
  availableCompanies = availableCompanies.map((item) => ({
    ...item,
    selected: companyValues.has(item.value),
  }));
}

function resetScopeFromContext(context = latestContext) {
  const route = context?.route || {};
  availableSubjects = normalizeSubjects(context || {});
  availableCompanies = route.companyId
    ? [{
        value: route.companyId,
        id: route.companyId,
        code: "当前",
        name: "当前公司",
        shortName: "当前公司",
        title: companyDisplayTitle("当前", "当前公司"),
        selected: true,
        pathParts: [],
      }]
    : [];
  mcpSubjectListLoaded = false;
  mcpCompanyListLoaded = false;
  confirmedSubjectCodes = null;
  confirmedCompanyValues = null;
  renderChoiceList(elements.subjectList, availableSubjects, "subjects");
  renderCompanyTree(elements.companyList, availableCompanies, route.companyId || "");
  setSubjectSelectionConfirmed(false);
  setCompanySelectionConfirmed(false);
  elements.subjectSelectionActions?.classList.add("hidden");
  elements.companySelectionActions?.classList.add("hidden");
  setCompanySourceStatus("未加载编码");
}

function captureModuleState(route = currentRoute) {
  if (!isModuleRoute(route)) return;
  syncSelectedItems();
  moduleScopeStates[route] = {
    availableSubjects: availableSubjects.map((item) => ({ ...item })),
    availableCompanies: availableCompanies.map((item) => ({ ...item })),
    confirmedSubjectCodes: confirmedSubjectCodes ? [...confirmedSubjectCodes] : null,
    confirmedCompanyValues: confirmedCompanyValues ? [...confirmedCompanyValues] : null,
    mcpSubjectListLoaded,
    mcpCompanyListLoaded,
    subjectPanelOpen: Boolean(elements.subjectScopePanel?.open),
    companyPanelOpen: Boolean(elements.companyScopePanel?.open),
    latestPayload,
    lastBatchLogEntries: lastBatchLogEntries.map((item) => ({ ...item })),
    logOpen: Boolean(elements.taskLog?.closest("details")?.open),
    evidenceOpen: Boolean(elements.json?.closest("details")?.open),
  };
}

function renderStoredScope() {
  renderCompanyTree(
    elements.companyList,
    availableCompanies,
    latestContext?.route?.companyId || "",
  );
  if (availableSubjects.some((item) => item.source === "page-tree")) {
    renderPageSubjectTree(elements.subjectList, availableSubjects);
  } else {
    renderSubjectTree(
      elements.subjectList,
      availableSubjects,
      latestContext?.route?.subjectCode || "",
    );
  }
  elements.companySelectionActions?.classList.toggle("hidden", !mcpCompanyListLoaded || !availableCompanies.length);
  elements.subjectSelectionActions?.classList.toggle("hidden", !mcpSubjectListLoaded || !availableSubjects.length);
  setCompanySelectionConfirmed(false);
  setSubjectSelectionConfirmed(false);
  confirmedCompanyValues = moduleScopeStates[currentRoute]?.confirmedCompanyValues
    ? [...moduleScopeStates[currentRoute].confirmedCompanyValues]
    : null;
  confirmedSubjectCodes = moduleScopeStates[currentRoute]?.confirmedSubjectCodes
    ? [...moduleScopeStates[currentRoute].confirmedSubjectCodes]
    : null;
  if (confirmedCompanyValues) {
    elements.companySelectionStatus.textContent = `已确认 ${confirmedCompanyValues.length} 个`;
  }
  if (confirmedSubjectCodes) {
    elements.subjectSelectionStatus.textContent = `已确认 ${confirmedSubjectCodes.length} 个`;
  }
}

function restoreModuleState(route) {
  const state = moduleScopeStates[route];
  if (!state) {
    resetScopeFromContext(latestContext);
    clearTaskLog();
    elements.json.textContent = latestContext
      ? JSON.stringify(latestContext, null, 2)
      : "暂无数据";
    moduleScopeStates[route] = {
      availableSubjects: availableSubjects.map((item) => ({ ...item })),
      availableCompanies: availableCompanies.map((item) => ({ ...item })),
      confirmedSubjectCodes: null,
      confirmedCompanyValues: null,
      mcpSubjectListLoaded: false,
      mcpCompanyListLoaded: false,
      subjectPanelOpen: false,
      companyPanelOpen: true,
      latestPayload: latestContext,
      lastBatchLogEntries: [],
      logOpen: false,
      evidenceOpen: false,
    };
    if (elements.companyScopePanel) elements.companyScopePanel.open = true;
    if (elements.subjectScopePanel) elements.subjectScopePanel.open = false;
    return;
  }
  availableSubjects = state.availableSubjects.map((item) => ({ ...item }));
  availableCompanies = state.availableCompanies.map((item) => ({ ...item }));
  confirmedSubjectCodes = state.confirmedSubjectCodes ? [...state.confirmedSubjectCodes] : null;
  confirmedCompanyValues = state.confirmedCompanyValues ? [...state.confirmedCompanyValues] : null;
  mcpSubjectListLoaded = Boolean(state.mcpSubjectListLoaded);
  mcpCompanyListLoaded = Boolean(state.mcpCompanyListLoaded);
  latestPayload = state.latestPayload || latestPayload;
  lastBatchLogEntries = state.lastBatchLogEntries.map((item) => ({ ...item }));
  renderStoredScope();
  if (elements.companyScopePanel) elements.companyScopePanel.open = Boolean(state.companyPanelOpen);
  if (elements.subjectScopePanel) elements.subjectScopePanel.open = Boolean(state.subjectPanelOpen);
  elements.taskLog.innerHTML = "";
  for (const entry of lastBatchLogEntries) {
    const item = document.createElement("li");
    item.textContent = entry.text;
    elements.taskLog.appendChild(item);
  }
  elements.taskLogCount.textContent = `${lastBatchLogEntries.length} 条`;
  elements.json.textContent = latestPayload
    ? JSON.stringify(latestPayload, null, 2)
    : "暂无数据";
  const logDetails = elements.taskLog.closest("details");
  const evidenceDetails = elements.json.closest("details");
  if (logDetails) logDetails.open = Boolean(state.logOpen);
  if (evidenceDetails) evidenceDetails.open = Boolean(state.evidenceOpen);
}

function renderRoute(route) {
  const safeRoute = ROUTE_LABELS[route] ? route : "home";
  currentRoute = safeRoute;
  const pages = [
    elements.pageHome,
    elements.pageConnections,
    elements.pageBatchSave,
    elements.pageBatchExit,
    elements.pageExportDetail,
    elements.pageExportDeclare,
    elements.pageFormatDetail,
    elements.pageFormatDeclaration,
  ];
  for (const page of pages) {
    page?.classList.toggle("hidden", page.dataset.route !== safeRoute);
  }

  elements.scopeSection?.classList.add("hidden");
  elements.supportSection?.classList.add("hidden");
  if (isModuleRoute(safeRoute)) {
    const scopeMount = {
      "batch-save": elements.saveScopeMount,
      "batch-exit": elements.exitScopeMount,
      "export-detail": elements.detailScopeMount,
      "export-declare": elements.declareScopeMount,
      "format-detail": null,
      "format-declaration": null,
    }[safeRoute];
    const supportMount = {
      "batch-save": elements.saveSupportMount,
      "batch-exit": elements.exitSupportMount,
      "export-detail": elements.detailSupportMount,
      "export-declare": elements.declareSupportMount,
      "format-detail": elements.detailPrintSupportMount,
      "format-declaration": elements.declarationPrintSupportMount,
    }[safeRoute];
    if (routeNeedsScope(safeRoute)) scopeMount?.appendChild(elements.scopeSection);
    supportMount?.appendChild(elements.supportSection);
    elements.scopeSection?.classList.toggle("hidden", !routeNeedsScope(safeRoute));
    elements.supportSection?.classList.remove("hidden");
    restoreModuleState(safeRoute);
    if (routeNeedsScope(safeRoute)) {
      elements.subjectScopePanel?.classList.toggle("hidden", !routeNeedsSubjects(safeRoute));
    }
  }

  elements.subtitle.textContent = ROUTE_LABELS[safeRoute];
  updateHomePageState();
  if (safeRoute === "home" || safeRoute === "connections") {
    elements.json.textContent = latestPayload ? JSON.stringify(latestPayload, null, 2) : "暂无数据";
  }
  maybeAutoLoadExportCompanies();
  if (safeRoute === "connections") {
    window.setTimeout(() => {
      if (!busy) loadConnectorCatalog();
    }, 0);
  }
}

function updateHomePageState() {
  if (!elements.homePageState) return;
  elements.homePageState.textContent = latestContext?.route?.isAssetDraftRoute
    ? `已识别底稿：${latestContext.route.subjectCode || "当前科目"}`
    : "等待识别天源底稿页面";
}

function maybeAutoLoadExportCompanies() {
  if (!["export-detail", "export-declare"].includes(currentRoute)) return;
  if (!latestContext?.route?.projectId || mcpCompanyListLoaded || busy) return;
  window.setTimeout(() => {
    if (["export-detail", "export-declare"].includes(currentRoute) && !mcpCompanyListLoaded && !busy) {
      loadCompanyList();
    }
  }, 0);
}

function navigateToRoute(route) {
  if (!ROUTE_LABELS[route]) return;
  if (isModuleRoute(currentRoute)) captureModuleState(currentRoute);
  const hash = `#${route}`;
  if (window.location.hash === hash) {
    renderRoute(route);
  } else {
    window.location.hash = hash;
  }
}

function renderChoiceList(container, items, groupName) {
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = groupName === "subjects" ? "未读取到科目" : "未读取到公司";
    container.appendChild(empty);
    return;
  }

  for (const item of items) {
    const label = document.createElement("label");
    label.className = "choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.group = groupName;
    checkbox.value = item.value;
    checkbox.checked = item.selected !== false;

    const textWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title || item.value;
    textWrap.appendChild(title);
    if (item.subtitle) {
      const subtitle = document.createElement("span");
      subtitle.textContent = item.subtitle;
      textWrap.appendChild(subtitle);
    }

    label.appendChild(checkbox);
    label.appendChild(textWrap);
    container.appendChild(label);
  }
}

function companyDisplayTitle(code, shortName, name = "") {
  const cleanCode = String(code || "").trim();
  const cleanShortName = String(shortName || "").trim();
  const cleanName = String(name || "").trim();
  const displayName = cleanShortName || cleanName;
  if (!cleanCode) return displayName;
  if (!displayName || displayName === cleanCode) return cleanCode;
  return `${cleanCode} ${displayName}`;
}

function deriveCompanyShortName(name) {
  return String(name || "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/有限责任公司|股份有限公司|科技发展有限公司|科技有限公司|系统有限公司|有限公司|公司$/g, "")
    .trim();
}

function displayCompanyShortName(shortName, name) {
  const cleanShortName = String(shortName || "").trim();
  const cleanName = String(name || "").trim();
  if (cleanShortName && cleanShortName !== cleanName && cleanShortName.length < cleanName.length) return cleanShortName;
  return deriveCompanyShortName(cleanName) || cleanShortName || cleanName;
}

function pickObjectString(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function companyMatchKey(text) {
  return String(text || "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/有限公司|有限责任公司|科技发展|科技|公司|\s|\.{3}|…/g, "")
    .trim();
}

function cleanSubjectTitle(title, code) {
  const text = String(title || "").trim();
  if (!text) return code;
  return text.startsWith(`${code} `) ? text.slice(code.length + 1).trim() || text : text;
}

function subjectDisplayTitle(code, name) {
  const cleanName = cleanSubjectTitle(name, code);
  return cleanName || code || "";
}

function cleanPathTitle(title) {
  return String(title || "").trim().replace(/^C\d+(?:-\d+)*\s+/, "");
}

function subjectPathNames(item) {
  const path = String(
    item.pagePath ||
    item.path ||
    item.raw?.fullPath ||
    item.raw?.full_path ||
    item.raw?.subjectPath ||
    item.raw?.subject_path ||
    item.raw?.namePath ||
    item.raw?.name_path ||
    "",
  ).trim();
  if (!path) return [];
  return path
    .split(/[>/／/\\|,，]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== item.value && !part.startsWith(`${item.value} `))
    .map(cleanPathTitle)
    .filter(Boolean);
}

function isSubjectCode(value) {
  return /^C\d+(?:-\d+)*$/.test(String(value || "").trim());
}

function isDisplayedSubject(item) {
  if (!item || typeof item !== "object") return false;
  const raw = item?.raw && typeof item.raw === "object" ? item.raw : {};
  const hiddenValue = firstDefined([
    item?.hidden,
    item?.isHidden,
    item?.hide,
    item?.isHide,
    item?.hiddenFlag,
    item?.hidden_flag,
    raw.hidden,
    raw.isHidden,
    raw.is_hidden,
    raw.hide,
    raw.isHide,
    raw.is_hide,
    raw.hiddenFlag,
    raw.hidden_flag,
  ]);
  if (hiddenValue === true || hiddenValue === 1 || hiddenValue === "1" || String(hiddenValue).toLowerCase() === "true") {
    return false;
  }

  const displayValue = firstDefined([
    item?.visible ??
    item?.isShow ??
    item?.is_show ??
    item?.show ??
    item?.isDisplay ??
    item?.is_display ??
    item?.display ??
    item?.displayed ??
    item?.displayFlag ??
    item?.display_flag ??
    item?.displayStatus ??
    item?.display_status ??
    item?.showFlag ??
    item?.show_flag ??
    item?.visibleFlag ??
    item?.visible_flag ??
    item?.checked ??
    item?.isChecked ??
    item?.is_checked ??
    item?.selected ??
    item?.isSelected ??
    item?.is_selected ??
    raw.visible ??
    raw.isShow ??
    raw.is_show ??
    raw.show ??
    raw.isDisplay ??
    raw.is_display ??
    raw.display ??
    raw.displayed ??
    raw.displayFlag ??
    raw.display_flag ??
    raw.displayStatus ??
    raw.display_status ??
    raw.showFlag ??
    raw.show_flag ??
    raw.visibleFlag ??
    raw.visible_flag ??
    raw.checked ??
    raw.isChecked ??
    raw.is_checked ??
    raw.selected ??
    raw.isSelected ??
    raw.is_selected,
  ]);

  if (displayValue === undefined || displayValue === null || displayValue === "") return true;
  if (displayValue === false || displayValue === 0 || displayValue === "0") return false;
  const text = String(displayValue).trim().toLowerCase();
  return !["false", "hidden", "hide", "隐藏", "不显示", "未显示", "否", "no", "n", "disabled"].includes(text);
}

function firstDefined(values) {
  return values.find((value) => value !== undefined && value !== null);
}

function subjectCodeParents(code) {
  const parts = String(code || "").split("-").filter(Boolean);
  const parents = [];
  for (let i = 1; i < parts.length; i += 1) {
    parents.push(parts.slice(0, i).join("-"));
  }
  return parents;
}

function subjectDepth(code) {
  return String(code || "").split("-").filter(Boolean).length;
}

function pathNameForCode(code, pathNames, itemCode = code) {
  const distanceFromItem = Math.max(0, subjectDepth(itemCode) - subjectDepth(code));
  const index = pathNames.length - distanceFromItem - 1;
  return index >= 0 ? pathNames[index] || "" : "";
}

function standardSubjectName(code) {
  const names = {
    C3: "流动资产",
    "C3-1": "货币资金",
    C4: "非流动资产",
    C5: "流动负债",
    C6: "非流动负债",
    C7: "所有者权益",
  };
  return names[code] || "";
}

function enrichSubjectHierarchyNames(subjects, allSubjects = subjects) {
  const nameByCode = new Map();
  for (const item of allSubjects) {
    if (!isSubjectCode(item.code)) continue;
    const name = cleanSubjectTitle(item.name || item.title, item.code);
    if (name && name !== item.code) nameByCode.set(item.code, name);
  }

  return subjects.map((item) => {
    if (!isSubjectCode(item.code)) return item;
    const parentCode = isSubjectCode(item.parentCode) ? item.parentCode : subjectCodeParents(item.code).at(-1) || "";
    const parentName = item.parentName || nameByCode.get(parentCode) || standardSubjectName(parentCode);

    if (item.path) {
      return {
        ...item,
        parentCode,
        parentName,
      };
    }

    const parentNames = subjectCodeParents(item.code)
      .map((code) => nameByCode.get(code) || standardSubjectName(code) || "")
      .filter(Boolean);

    return {
      ...item,
      parentCode,
      parentName,
      path: parentNames.length ? [...parentNames, cleanSubjectTitle(item.name || item.title, item.code)].join("/") : "",
    };
  });
}

function visibleSubjectEntriesFromContext(context) {
  const entries = [];
  for (const item of context?.subjectTree || []) {
    const text = cleanPathTitle(item?.text || item?.name || item?.label || "");
    if (!text || isSubjectCode(text)) continue;
    entries.push({
      name: text,
      code: isSubjectCode(item?.subjectCode || item?.code) ? String(item.subjectCode || item.code) : "",
      depth: Number.isFinite(item?.depth) ? item.depth : null,
      leaf: item?.leaf !== false,
      path: String(item?.path || "").trim(),
    });
  }
  return entries;
}

function attachPageSubjectPaths(subjects, context) {
  const entries = visibleSubjectEntriesFromContext(context).filter((entry) => entry.path);
  if (!entries.length) return subjects;

  return subjects.map((item) => {
    const match = entries.find((entry) => (
      (entry.code && entry.code === item.code)
      || subjectMatchesVisibleEntry(item, entry.name)
    ));
    return match ? { ...item, pagePath: match.path } : item;
  });
}

function normalizePageSubjectTreeSubjects(context) {
  return visibleSubjectEntriesFromContext(context)
    .filter((entry) => isSubjectCode(entry.code))
    .map((entry) => {
      const parentCode = subjectCodeParents(entry.code).at(-1) || "";
      const pathNames = entry.path
        ? [...entry.path.split("/").filter(Boolean), entry.name]
        : [entry.name];
      const parentName = pathNames.length > 1 ? pathNames.at(-2) : "";
      return {
        value: entry.code,
        code: entry.code,
        name: entry.name,
        title: subjectDisplayTitle(entry.code, entry.name),
        parentCode,
        parentName,
        path: pathNames.join("/"),
        pagePath: pathNames.join("/"),
        displayed: true,
        hidden: false,
        selected: true,
        raw: { source: "page-subject-tree" },
      };
    });
}

function normalizePageSubjectChoices(context, mcpSubjects) {
  const entries = visibleSubjectEntriesFromContext(context).filter((entry) => entry.leaf);
  const seen = new Set();

  return entries.map((entry, index) => {
    const directCodeMatch = entry.code
      ? mcpSubjects.find((item) => item.code === entry.code) || null
      : null;
    const visibleName = normalizeSubjectMatchName(entry.name);
    const exactCandidates = mcpSubjects.filter((item) => {
      const itemName = normalizeSubjectMatchName(cleanSubjectTitle(item.name || item.title, item.code));
      const depthMatches = entry.depth === null || entry.depth === undefined
        || subjectDepth(item.code) - 1 === entry.depth;
      return itemName === visibleName && depthMatches;
    });
    const matched = directCodeMatch || (exactCandidates.length === 1 ? exactCandidates[0] : null);
    const reliableCode = entry.code || matched?.code || "";
    const codeSource = entry.code
      ? "page"
      : (matched ? "mcp-exact-unique" : "none");
    const fullPath = [entry.path, entry.name].filter(Boolean).join("/");
    const value = reliableCode || `treepath:${encodeURIComponent(fullPath)}`;
    const key = `${value}|${fullPath}`;
    if (seen.has(key)) return null;
    seen.add(key);

    return {
      value,
      code: reliableCode,
      codeSource,
      name: entry.name,
      title: reliableCode ? subjectDisplayTitle(reliableCode, entry.name) : entry.name,
      pathParts: entry.path ? entry.path.split("/").filter(Boolean) : [],
      pagePath: fullPath,
      selected: true,
      displayed: true,
      hidden: false,
      source: "page-tree",
      orderIndex: index,
      sortCode: String(index + 1),
      raw: matched?.raw || { source: "page-subject-tree" },
    };
  }).filter(Boolean);
}

function normalizeSubjectMatchName(value) {
  return String(value || "")
    .replace(/^C\d+(?:-\d+)*\s+/, "")
    .replace(/\s+/g, "")
    .trim();
}

function subjectMatchNames(item) {
  const raw = item?.raw && typeof item.raw === "object" ? item.raw : {};
  const values = [
    item?.name,
    item?.title,
    item?.parentName,
    item?.path,
    raw.name,
    raw.label,
    raw.title,
    raw.text,
    raw.subjectName,
    raw.subject_name,
    raw.parentName,
    raw.parent_name,
    raw.fullPath,
    raw.full_path,
    raw.subjectPath,
    raw.subject_path,
    raw.namePath,
    raw.name_path,
  ];
  const names = new Set();
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    for (const part of text.split(/[>/／|,，]+/).map((entry) => entry.trim()).filter(Boolean)) {
      const normalized = normalizeSubjectMatchName(part);
      if (normalized) names.add(normalized);
    }
  }
  return [...names];
}

function subjectMatchesVisibleEntry(item, entryName) {
  const visibleName = normalizeSubjectMatchName(entryName);
  if (!visibleName) return false;
  return subjectMatchNames(item).some((candidate) => (
    candidate === visibleName
    || candidate.endsWith(visibleName)
    || visibleName.endsWith(candidate)
  ));
}

function filterSubjectsByVisibleContext(subjects, context) {
  const visibleEntries = visibleSubjectEntriesFromContext(context);
  if (!visibleEntries.length) return subjects;

  const visibleNames = new Set(visibleEntries.map((entry) => normalizeSubjectMatchName(entry.name)));
  const subjectNameCounts = new Map();
  for (const item of subjects) {
    const subjectName = normalizeSubjectMatchName(cleanSubjectTitle(item.name || item.title, item.code));
    subjectNameCounts.set(subjectName, (subjectNameCounts.get(subjectName) || 0) + 1);
  }
  const exactFiltered = subjects.filter((item) => {
    const uiDepth = subjectDepth(item.code) - 1;
    return visibleEntries.some((entry) => (
      (entry.code && entry.code === item.code)
      || (subjectMatchesVisibleEntry(item, entry.name)
        && (entry.depth === null || entry.depth === uiDepth))
    ));
  });
  const looseFiltered = subjects.filter((item) => {
    const subjectNames = subjectMatchNames(item);
    if (!subjectNames.some((name) => visibleNames.has(name) || [...visibleNames].some((visible) => name.endsWith(visible) || visible.endsWith(name)))) {
      return false;
    }
    const uiDepth = subjectDepth(item.code) - 1;
    const depthMatches = visibleEntries.some((entry) => (
      (entry.code && entry.code === item.code)
      || (subjectMatchesVisibleEntry(item, entry.name)
        && entry.depth !== null
        && Math.abs(entry.depth - uiDepth) <= 2)
    ));
    return depthMatches || visibleEntries.some((entry) => (
      (entry.code && entry.code === item.code)
      || subjectMatchesVisibleEntry(item, entry.name)
    ));
  });
  const duplicateNameFiltered = subjects.filter((item) => {
    const subjectName = normalizeSubjectMatchName(cleanSubjectTitle(item.name || item.title, item.code));
    if (!visibleNames.has(subjectName)) return false;
    return (subjectNameCounts.get(subjectName) || 0) > 1;
  });

  const merged = [...exactFiltered, ...looseFiltered, ...duplicateNameFiltered];
  if (!merged.length) return subjects;

  const seen = new Set();
  return merged.filter((item) => {
    const key = `${item.code}|${cleanSubjectTitle(item.name || item.title, item.code)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeSubjectCandidates(primary, additional) {
  const merged = new Map();
  for (const item of [...(primary || []), ...(additional || [])]) {
    const key = String(item?.code || item?.value || "").trim();
    if (!key) continue;
    if (!merged.has(key)) {
      merged.set(key, item);
      continue;
    }
    const existing = merged.get(key);
    merged.set(key, {
      ...existing,
      pagePath: existing.pagePath || item.pagePath || "",
      path: existing.path || item.path || "",
      parentCode: existing.parentCode || item.parentCode || "",
      parentName: existing.parentName || item.parentName || "",
      displayed: existing.displayed ?? item.displayed,
      hidden: existing.hidden ?? item.hidden,
    });
  }
  return [...merged.values()];
}

function isPageSubjectTreeUsable(pageVisibleSubjects, displayedMcpSubjects, subjectContext) {
  const subjectTree = Array.isArray(subjectContext?.subjectTree) ? subjectContext.subjectTree : [];
  if (!subjectTree.length || !pageVisibleSubjects.length) return false;

  const topNames = new Set(
    subjectTree
      .filter((item) => Number(item?.depth) === 0)
      .map((item) => cleanPathTitle(item?.text || item?.name || item?.label || ""))
      .filter(Boolean),
  );
  const hasMultipleTopGroups = topNames.size >= 3;
  const hasEnoughMatches = pageVisibleSubjects.length >= Math.min(displayedMcpSubjects.length, 6);
  const coversMostDisplayed = displayedMcpSubjects.length > 0
    && pageVisibleSubjects.length >= Math.ceil(displayedMcpSubjects.length * 0.6);

  return hasMultipleTopGroups && (hasEnoughMatches || coversMostDisplayed);
}

function buildSubjectTree(items, currentCode) {
  const byCode = new Map();
  const root = { code: "__root__", children: [] };

  function makeNode({ key, code = "", title = "", value = "" }) {
    return {
      key,
      code,
      title: title || code || value,
      value: value || code,
      selectable: false,
      selected: false,
      hidden: false,
      children: [],
      parent: null,
      orderKey: code || title || value,
    };
  }

  function ensureCodeNode(code, title = "") {
    if (byCode.has(code)) {
      const existing = byCode.get(code);
      if (title && (!existing.title || existing.title === existing.code)) existing.title = title;
      return existing;
    }

    const node = makeNode({
      key: `code:${code}`,
      code,
      title: title || code,
      value: code,
    });
    byCode.set(code, node);
    return node;
  }

  function linkNode(parent, node) {
    if (!node || node === parent) return;
    if (node.parent) {
      if (node.parent === parent) return;
      node.parent.children = node.parent.children.filter((child) => child !== node);
    }
    if (!parent.children.includes(node)) {
      parent.children.push(node);
    }
    node.parent = parent;
  }

  const itemByCode = new Map();
  const titleByCode = new Map();
  const directTitleByCode = new Map();
  const pathTitleVotes = new Map();

  function votePathTitle(code, title) {
    const cleanTitle = String(title || "").trim();
    if (!isSubjectCode(code) || !cleanTitle) return;
    if (!pathTitleVotes.has(code)) pathTitleVotes.set(code, new Map());
    const votes = pathTitleVotes.get(code);
    votes.set(cleanTitle, (votes.get(cleanTitle) || 0) + 1);
  }

  function preferredTitle(code) {
    const votes = pathTitleVotes.get(code);
    if (votes?.size) {
      return [...votes.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
        .at(0)?.[0] || "";
    }
    return directTitleByCode.get(code) || standardSubjectName(code) || code;
  }

  for (const item of items) {
    const code = String(item.code || item.value || "").trim();
    if (!isSubjectCode(code)) continue;
    itemByCode.set(code, item);
    directTitleByCode.set(code, cleanSubjectTitle(item.name || item.title, code));
    const pathNames = subjectPathNames(item);
    for (const parentCode of subjectCodeParents(code)) {
      votePathTitle(parentCode, pathNameForCode(parentCode, pathNames, code));
    }
    if (isSubjectCode(item.parentCode) && item.parentName && !pathNames.length) {
      votePathTitle(item.parentCode, item.parentName);
    }
  }

  for (const code of itemByCode.keys()) {
    titleByCode.set(code, subjectDisplayTitle(code, preferredTitle(code)));
  }

  for (const code of [...itemByCode.keys()]) {
    for (const parentCode of subjectCodeParents(code)) {
      ensureCodeNode(parentCode, titleByCode.get(parentCode) || subjectDisplayTitle(parentCode, standardSubjectName(parentCode) || parentCode));
    }
    const item = itemByCode.get(code);
    const node = ensureCodeNode(code, titleByCode.get(code) || subjectDisplayTitle(code, item.name || item.title));
    node.title = titleByCode.get(code) || node.title;
    node.value = item.value;
    node.selectable = true;
    node.hidden = Boolean(item.hidden);
    node.selected = item.selected === true;
  }

  for (const node of byCode.values()) {
    const parentCode = subjectCodeParents(node.code).at(-1) || "";
    const parent = parentCode ? ensureCodeNode(parentCode, titleByCode.get(parentCode) || subjectDisplayTitle(parentCode, standardSubjectName(parentCode) || parentCode)) : root;
    linkNode(parent, node);
  }

  function sortNode(node) {
    node.children.sort((a, b) => a.orderKey.localeCompare(b.orderKey, "zh-CN", { numeric: true }));
    node.children.forEach(sortNode);
  }
  sortNode(root);

  function markOpen(node) {
    const selfCurrent = node.code === currentCode;
    const childCurrent = node.children.some(markOpen);
    node.open = node.code === "__root__" || selfCurrent || childCurrent || node.children.length <= 6;
    return selfCurrent || childCurrent;
  }
  markOpen(root);
  return root.children;
}

function renderSubjectTree(container, items, currentCode) {
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "未读取到科目";
    container.appendChild(empty);
    return;
  }

  const tree = buildSubjectTree(items, currentCode);

  function renderNode(node, depth) {
    if (node.children.length) {
      const details = document.createElement("details");
      details.className = "subject-node";
      details.open = Boolean(node.open);

      const summary = document.createElement("summary");
      summary.className = "subject-summary";
      summary.style.setProperty("--depth", String(depth));
      if (node.selectable) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.group = "subjects";
        checkbox.value = node.value;
        checkbox.checked = node.selected;
        checkbox.addEventListener("click", (event) => event.stopPropagation());
        summary.appendChild(checkbox);
      }
      const title = document.createElement("span");
      title.textContent = node.hidden ? `${node.title}（隐藏）` : node.title;
      if (node.hidden) title.className = "subject-hidden";
      summary.appendChild(title);
      details.appendChild(summary);

      const children = document.createElement("div");
      children.className = "subject-children";
      for (const child of node.children) {
        children.appendChild(renderNode(child, depth + 1));
      }
      details.appendChild(children);
      return details;
    }

    const label = document.createElement("label");
    label.className = "choice subject-leaf";
    label.style.setProperty("--depth", String(depth));
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.group = "subjects";
    checkbox.value = node.value;
    checkbox.checked = node.selected;
    const title = document.createElement("strong");
    title.textContent = node.hidden ? `${node.title}（隐藏）` : node.title;
    if (node.hidden) title.className = "subject-hidden";
    label.appendChild(checkbox);
    label.appendChild(title);
    return label;
  }

  for (const node of tree) {
    container.appendChild(renderNode(node, 0));
  }
}

function buildGenericTree(items, options = {}) {
  const root = { key: "__root__", children: [] };
  const byKey = new Map();

  function ensureNode(key, title) {
    if (byKey.has(key)) {
      const existing = byKey.get(key);
      if (title && (!existing.title || existing.title === existing.key)) existing.title = title;
      return existing;
    }
    const node = {
      key,
      title: title || key,
      value: "",
      selectable: false,
      selected: false,
      children: [],
      parent: null,
      orderKey: title || key,
      orderIndex: 0,
    };
    byKey.set(key, node);
    return node;
  }

  function linkNode(parent, node) {
    if (!node || node === parent) return;
    if (node.parent) {
      if (node.parent === parent) return;
      node.parent.children = node.parent.children.filter((child) => child !== node);
    }
    if (!parent.children.includes(node)) parent.children.push(node);
    node.parent = parent;
  }

  for (const item of items) {
    const pathParts = Array.isArray(item.pathParts) ? item.pathParts.filter(Boolean) : [];
    let parent = root;
    const pathKeys = [];
    for (const part of pathParts) {
      pathKeys.push(part);
      const node = ensureNode(`group:${pathKeys.join("/")}`, part);
      if (options.preserveOrder) {
        node.orderIndex = Math.min(node.orderIndex || Number.MAX_SAFE_INTEGER, item.orderIndex ?? 0);
      }
      linkNode(parent, node);
      parent = node;
    }

    const node = ensureNode(`item:${item.value}`, item.title || item.value);
    node.title = item.title || item.value;
    node.value = item.value;
    node.selectable = true;
    node.selected = item.selected !== false;
    node.orderKey = item.sortCode || item.title || item.value;
    node.orderIndex = item.orderIndex ?? 0;
    node.parentItemValue = item.parentValue || "";
    linkNode(parent, node);
  }

  for (const node of byKey.values()) {
    if (!node.selectable || !node.parentItemValue) continue;
    const parentNode = byKey.get(`item:${node.parentItemValue}`);
    if (parentNode) linkNode(parentNode, node);
  }

  function sortNode(node) {
    node.children.sort((a, b) => {
      if (options.preserveOrder) {
        const byOrder = a.orderIndex - b.orderIndex;
        if (byOrder) return byOrder;
      }
      const byKey = a.orderKey.localeCompare(b.orderKey, "zh-CN", { numeric: true });
      return byKey || a.orderIndex - b.orderIndex;
    });
    node.children.forEach(sortNode);
  }
  sortNode(root);

  function markOpen(node) {
    const selfCurrent = options.currentValue && node.value === options.currentValue;
    const childCurrent = node.children.some(markOpen);
    node.open = node.key === "__root__" || selfCurrent || childCurrent || node.children.length <= 8;
    return selfCurrent || childCurrent;
  }
  markOpen(root);
  return root.children;
}

function renderPageSubjectTree(container, items) {
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "未读取到显示科目";
    container.appendChild(empty);
    return;
  }

  const tree = buildGenericTree(items, { preserveOrder: true });

  function renderNode(node, depth) {
    if (node.children.length) {
      const details = document.createElement("details");
      details.className = "subject-node";
      details.open = Boolean(node.open);

      const summary = document.createElement("summary");
      summary.className = "subject-summary";
      summary.style.setProperty("--depth", String(depth));
      const title = document.createElement("span");
      title.textContent = node.title;
      summary.appendChild(title);
      details.appendChild(summary);

      const children = document.createElement("div");
      children.className = "subject-children";
      for (const child of node.children) children.appendChild(renderNode(child, depth + 1));
      details.appendChild(children);
      return details;
    }

    const label = document.createElement("label");
    label.className = "choice subject-leaf";
    label.style.setProperty("--depth", String(depth));
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.group = "subjects";
    checkbox.value = node.value;
    checkbox.checked = node.selected;
    const title = document.createElement("strong");
    title.textContent = node.title;
    label.appendChild(checkbox);
    label.appendChild(title);
    return label;
  }

  for (const node of tree) container.appendChild(renderNode(node, 0));
}

function renderCompanyTree(container, items, currentCompanyId) {
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "未读取到公司";
    container.appendChild(empty);
    return;
  }

  const tree = buildGenericTree(items, { currentValue: currentCompanyId });

  function renderNode(node, depth) {
    if (node.children.length) {
      const details = document.createElement("details");
      details.className = "subject-node";
      details.open = Boolean(node.open);

      const summary = document.createElement("summary");
      summary.className = "subject-summary";
      summary.style.setProperty("--depth", String(depth));
      if (node.selectable) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.group = "companies";
        checkbox.value = node.value;
        checkbox.checked = node.selected;
        checkbox.addEventListener("click", (event) => event.stopPropagation());
        summary.appendChild(checkbox);
      }
      const title = document.createElement("span");
      title.textContent = node.title;
      summary.appendChild(title);
      details.appendChild(summary);

      const children = document.createElement("div");
      children.className = "subject-children";
      for (const child of node.children) children.appendChild(renderNode(child, depth + 1));
      details.appendChild(children);
      return details;
    }

    const label = document.createElement("label");
    label.className = "choice subject-leaf";
    label.style.setProperty("--depth", String(depth));
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.group = "companies";
    checkbox.value = node.value;
    checkbox.checked = node.selected;
    const title = document.createElement("strong");
    title.textContent = node.title;
    label.appendChild(checkbox);
    label.appendChild(title);
    return label;
  }

  for (const node of tree) container.appendChild(renderNode(node, 0));
}

function normalizeSubjects(context) {
  const route = context?.route || {};
  const spread = context?.spread || {};
  const normalized = [];

  if (route.subjectCode) {
    normalized.push({
      value: route.subjectCode,
      title: subjectDisplayTitle(route.subjectCode, spread.sheetName || route.subjectCode),
      subtitle: spread.sheetName || "当前科目",
      selected: true,
    });
  }

  return normalized;
}

function normalizeSubjectTreeItems(items, context) {
  const route = context?.route || latestContext?.route || {};
  const normalized = [];
  const seen = new Set();

  for (const item of items || []) {
    const label = String(item.text || "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    normalized.push({
      value: route.subjectCode && item.active ? route.subjectCode : `tree:${label}`,
      title: label,
      subtitle: item.active && route.subjectCode ? route.subjectCode : "左侧显示科目",
      selected: Boolean(item.active),
    });
  }
  return normalized;
}

function normalizeMcpSubjects(items, context, options = {}) {
  const currentCode = context?.route?.subjectCode || "";
  const filterDisplayed = options.filterDisplayed !== false;
  return (items || [])
    .filter((item) => item && typeof item === "object")
    .filter((item) => !filterDisplayed || isDisplayedSubject(item))
    .map((item) => {
      const code = String(item.code || item.subjectCode || item.value || "").trim();
      if (!isSubjectCode(code)) return null;
      const raw = item.raw && typeof item.raw === "object" ? item.raw : {};
      const rawName = [
        item.name,
        item.subjectName,
        item.label,
        raw.subjectName,
        raw.subject_name,
        raw.name,
        raw.label,
        raw.title,
        raw.text,
        raw.accountName,
        raw.account_name,
        raw.assetSubjectName,
        raw.asset_subject_name,
      ].map((value) => String(value || "").trim()).find((value) => value && value !== code) || "";
      const name = rawName || code;
      const parentCode = String(item.parentCode || raw.parentSubjectCode || raw.parent_subject_code || raw.parentCode || raw.parent_code || "").trim();
      const parentName = String(item.parentName || raw.parentSubjectName || raw.parent_subject_name || raw.parentName || raw.parent_name || "").trim();
      const path = String(item.path || raw.fullPath || raw.full_path || raw.path || raw.subjectPath || raw.subject_path || raw.namePath || raw.name_path || "").trim();
      return {
        value: code,
        code,
        name,
        title: code && name && name !== code ? `${code} ${name}` : name || code,
        subtitle: "",
        parentCode: isSubjectCode(parentCode) ? parentCode : "",
        parentName,
        path,
        raw,
        displayed: isDisplayedSubject(item),
        hidden: !isDisplayedSubject(item),
        selected: currentCode ? code === currentCode : isDisplayedSubject(item),
      };
    })
    .filter(Boolean);
}

function getSubjectCheckboxes() {
  return [...document.querySelectorAll('input[data-group="subjects"]')];
}

function setSubjectSelectionConfirmed(confirmed) {
  if (confirmed) {
    confirmedSubjectCodes = getCheckedValues("subjects");
    if (elements.subjectSelectionStatus) {
      elements.subjectSelectionStatus.textContent = `已确认 ${confirmedSubjectCodes.length} 个`;
    }
    setStatus(`已确认 ${confirmedSubjectCodes.length} 个科目`, confirmedSubjectCodes.length ? "ok" : "warn");
    if (confirmedSubjectCodes.length && elements.subjectScopePanel) {
      elements.subjectScopePanel.open = false;
    }
    return;
  }
  confirmedSubjectCodes = null;
  if (elements.subjectSelectionStatus) {
    elements.subjectSelectionStatus.textContent = mcpSubjectListLoaded ? "未确认" : "默认当前科目";
  }
}

function getCompanyCheckboxes() {
  return [...document.querySelectorAll('input[data-group="companies"]')];
}

function setCompanySelectionConfirmed(confirmed) {
  if (confirmed) {
    confirmedCompanyValues = getCheckedValues("companies");
    if (elements.companySelectionStatus) {
      elements.companySelectionStatus.textContent = `已确认 ${confirmedCompanyValues.length} 个`;
    }
    setStatus(`已确认 ${confirmedCompanyValues.length} 个公司`, confirmedCompanyValues.length ? "ok" : "warn");
    if (confirmedCompanyValues.length) {
      if (elements.companyScopePanel) elements.companyScopePanel.open = false;
      if (elements.subjectScopePanel) elements.subjectScopePanel.open = true;
    }
    return;
  }
  confirmedCompanyValues = null;
  if (elements.companySelectionStatus) {
    elements.companySelectionStatus.textContent = mcpCompanyListLoaded ? "未确认" : "默认当前公司";
  }
}

function setCompanySourceStatus(text, kind = "") {
  if (!elements.companySourceStatus) return;
  elements.companySourceStatus.textContent = text;
  elements.companySourceStatus.dataset.kind = kind;
}

function normalizeMcpCompanies(items, context) {
  const currentCompanyId = context?.route?.companyId || "";
  return (items || [])
    .map((item, index) => {
      const id = String(item.id || item.companyId || item.value || "").trim();
      const name = String(item.name || item.companyName || item.label || id).trim();
      const raw = item.raw && typeof item.raw === "object" ? item.raw : {};
      const hierarchyCode = pickObjectString(item, COMPANY_HIERARCHY_CODE_KEYS) || pickObjectString(raw, COMPANY_HIERARCHY_CODE_KEYS);
      const code = hierarchyCode || String(
        item.companyCode ||
        item.company_code ||
        item.code ||
        item.companyNo ||
        item.company_no ||
        item.no ||
        raw.companyCode ||
        raw.company_code ||
        raw.enterpriseCode ||
        raw.enterprise_code ||
        raw.code ||
        raw.companyNo ||
        raw.company_no ||
        raw.no ||
        "",
      ).trim();
      const shortName = String(
        item.shortName ||
        item.companyShortName ||
        item.short_name ||
        item.abbrName ||
        item.abbr_name ||
        item.abbreviation ||
        item.companyAbbr ||
        raw.shortName ||
        raw.short_name ||
        raw.companyShortName ||
        raw.company_short_name ||
        raw.abbrName ||
        raw.abbr_name ||
        raw.abbreviation ||
        raw.companyAbbr ||
        raw.company_abbr ||
        "",
      ).trim();
      const path = String(item.path || item.fullPath || raw.path || raw.fullPath || raw.full_path || raw.namePath || raw.name_path || "").trim();
      const parentId = String(item.parentId || item.parentCompanyId || raw.parentId || raw.parent_id || raw.parentCompanyId || raw.parent_company_id || "").trim();
      const parentName = String(item.parentName || raw.parentName || raw.parent_name || raw.parentCompanyName || raw.parent_company_name || "").trim();
      const pathParts = path
        ? path.split(/[>/／/\\|,，]+/).map((part) => part.trim()).filter(Boolean).filter((part) => part !== name && part !== id)
        : (parentName ? [parentName] : []);
      return {
        value: id || name,
        id,
        code,
        name,
        shortName,
        orderIndex: index,
        parentId,
        parentName,
        title: companyDisplayTitle(code, displayCompanyShortName(shortName, name), name),
        subtitle: "",
        pathParts,
        selected: Boolean(currentCompanyId && id === currentCompanyId),
      };
    })
    .filter((item) => item.value);
}

function enrichCompanyHierarchy(companies) {
  const nameById = new Map();
  const idByDisplayName = new Map();
  const codeById = new Map();
  const shortNameById = new Map();
  for (const company of companies) {
    if (company.id && company.name) nameById.set(company.id, company.name);
    for (const name of [company.name, company.shortName].filter(Boolean)) {
      if (!idByDisplayName.has(name)) idByDisplayName.set(name, company.id);
    }
    if (company.id && company.code) codeById.set(company.id, company.code);
    if (company.id && company.shortName) shortNameById.set(company.id, company.shortName);
  }

  const parentIdById = new Map();
  for (const company of companies) {
    let parentId = company.parentId || "";
    if (!parentId && company.parentName) {
      parentId = idByDisplayName.get(company.parentName) || "";
    }
    if (company.id && parentId && parentId !== company.id) {
      parentIdById.set(company.id, parentId);
    }
  }

  const childrenByParent = new Map();
  for (const company of companies) {
    const parentId = parentIdById.get(company.id) || "";
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(company);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }

  const valueByCode = new Map();
  for (const company of companies) {
    if (company.code && company.value) valueByCode.set(company.code, company.value);
  }

  function codeParentValue(code) {
    const parts = String(code || "").split("-").filter(Boolean);
    while (parts.length > 1) {
      parts.pop();
      const parentCode = parts.join("-");
      const value = valueByCode.get(parentCode);
      if (value) return value;
    }
    return "";
  }

  return companies.map((company) => {
    const parentId = parentIdById.get(company.id) || "";
    const parentName = company.parentName || nameById.get(parentId) || "";
    const code = company.code || "";
    const parentCode = codeById.get(parentId) || "";
    const parentValue = company.parentValue || codeParentValue(code);
    const pathParts = company.pathParts?.length
      ? company.pathParts
      : (parentName && !parentValue ? [companyDisplayTitle(parentCode, shortNameById.get(parentId) || parentName, parentName)] : []);

    return {
      ...company,
      code,
      parentId,
      parentName,
      parentValue,
      title: companyDisplayTitle(code, displayCompanyShortName(company.shortName, company.name), company.name),
      pathParts,
      sortCode: code || String((company.orderIndex ?? 0) + 1),
    };
  });
}

function mergeCompanyDisplayRows(companies, pageRows) {
  if (!pageRows?.length) return companies;

  const usedRows = new Set();
  const codedRows = pageRows.filter((row) => row?.code);

  function rowMatchKeys(row) {
    const rawCells = Array.isArray(row?.raw?.cells) ? row.raw.cells.join(" ") : "";
    const codeCells = Array.isArray(row?.raw?.codeCells) ? row.raw.codeCells.join(" ") : "";
    const rawLabel = String(row?.raw?.label || row?.raw?.text || "").trim();
    return [row?.shortName, row?.name, rawCells, codeCells, rawLabel]
      .map(companyMatchKey)
      .filter(Boolean);
  }

  function findMatch(company) {
    const candidates = [company.shortName, company.name].map(companyMatchKey).filter(Boolean);
    return pageRows.find((row, index) => {
      if (usedRows.has(index)) return false;
      const rowKeys = rowMatchKeys(row);
      return candidates.some((candidate) => rowKeys.some((rowKey) => candidate === rowKey || candidate.includes(rowKey) || rowKey.includes(candidate)));
    });
  }

  const merged = companies.map((company, index) => {
    let match = findMatch(company);
    if (match) {
      usedRows.add(pageRows.indexOf(match));
    } else if (codedRows[index]?.code) {
      match = codedRows[index];
      usedRows.add(pageRows.indexOf(match));
    }
    if (!match) {
      return {
        ...company,
        title: companyDisplayTitle(company.code, displayCompanyShortName(company.shortName, company.name), company.name),
      };
    }
    const displayShortName = company.shortName || displayCompanyShortName(match.shortName, match.name || company.name);
    return {
      ...company,
      code: match.code || company.code,
      name: match.name || company.name,
      shortName: displayShortName,
      parentName: match.parentName || company.parentName,
      pathParts: match.parentName ? [match.parentName] : company.pathParts,
      title: companyDisplayTitle(match.code || company.code, displayShortName, match.name || company.name),
      pageRaw: match.raw || null,
    };
  });

  return merged;
}

function extractHierarchyCodeFromPageRow(row) {
  const values = [
    row?.code,
    row?.raw?.label,
    row?.raw?.text,
    ...(Array.isArray(row?.raw?.cells) ? row.raw.cells : []),
    ...(Array.isArray(row?.raw?.codeCells) ? row.raw.codeCells : []),
  ];
  for (const value of values) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    const match = text.match(/(?:^|[^\d])([1-9]\d{0,1}(?:-\d{1,2}){0,6})(?=\s|[^\d]|$)/);
    if (match) return match[1];
  }
  return "";
}

function normalizePageCompanyRows(rows) {
  return (rows || []).map((row) => ({
    ...row,
    code: row?.code || extractHierarchyCodeFromPageRow(row),
  }));
}

async function fetchHelperJson(path) {
  if (runtimeMcpToken) {
    return await fetchNativeHelperJson(path);
  }

  let response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  try {
    response = await fetch(`${HELPER_BASE_URL}${path}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    return await fetchNativeHelperJson(path);
  } finally {
    window.clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.reason || `helper 返回异常：${response.status}`);
  }
  payload.transport = payload.transport || "http";
  return payload;
}

function sendNativeMessage(message, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("NATIVE_HELPER_TIMEOUT"));
    }, timeoutMs);

    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, (response) => {
      window.clearTimeout(timeout);
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || "NATIVE_HOST_UNAVAILABLE"));
        return;
      }
      resolve(response);
    });
  });
}

function streamNativeMessage(message, onProgress) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    let settled = false;

    function finish(callback, value) {
      if (settled) return;
      settled = true;
      callback(value);
      try {
        port.disconnect();
      } catch {
        // The native host may already have closed after sending the final message.
      }
    }

    port.onMessage.addListener((payload) => {
      if (payload?.event === "progress") {
        onProgress?.(payload);
        return;
      }
      if (payload?.event === "complete") {
        finish(resolve, payload);
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      const messageText = chrome.runtime.lastError?.message || "NATIVE_EXPORT_CONNECTION_CLOSED";
      finish(reject, new Error(messageText));
    });

    port.postMessage(message);
  });
}

async function fetchNativeHelperJson(path) {
  const url = new URL(path, "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let message = null;

  if (url.pathname === "/health") {
    message = { action: "health", probe: url.searchParams.get("probe") === "1" };
  } else if (parts.length === 3 && parts[0] === "projects" && parts[2] === "companies") {
    message = { action: "get_project_companies", projectId: parts[1] };
  } else if (
    parts.length === 5 &&
    parts[0] === "projects" &&
    parts[2] === "companies" &&
    parts[4] === "asset-subjects"
  ) {
    message = { action: "get_asset_subjects", projectId: parts[1], companyId: parts[3] };
  }

  if (!message) throw new Error("NATIVE_HELPER_UNSUPPORTED_PATH");
  if (runtimeMcpToken) message.mcpToken = runtimeMcpToken;
  const payload = await sendNativeMessage(message);
  if (!payload?.ok) {
    const error = new Error(payload?.reason || "NATIVE_HELPER_ERROR");
    error.payload = payload || null;
    throw error;
  }
  payload.transport = payload.transport || "native_messaging";
  return payload;
}

function normalizeErrorItems(items) {
  return Array.isArray(items)
    ? items.filter((item) => item && typeof item === "object" && !String(item.name || item.label || item.value || "").startsWith("MCP error"))
    : [];
}

async function authorizeCli() {
  setStatus("正在打开 CLI 授权页面...", "idle");
  elements.connectionMessage.textContent = "正在启动 tycpv login...";
  try {
    const result = await sendNativeMessage({ action: "cli_login" });
    if (!result?.ok) throw new Error(result?.reason || "CLI_LOGIN_FAILED");
    latestPayload = {
      ...result,
      collectedAt: new Date().toISOString(),
    };
    elements.json.textContent = JSON.stringify(latestPayload, null, 2);
    elements.connectionMessage.textContent = "CLI 授权页面已打开";
    setStatus("CLI 授权页面已打开，授权完成后点“启动/检查”", "ok");
  } catch (error) {
    const payload = {
      ok: false,
      action: "cli_login",
      reason: error?.message || String(error),
      collectedAt: new Date().toISOString(),
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    elements.connectionMessage.textContent = payload.reason;
    setStatus(`CLI 授权启动失败：${payload.reason}`, "error");
  }
}

function exportUi(exportType) {
  if (exportType === "asset_detail_table") {
    return {
      route: "export-detail",
      label: "资产基础法明细表",
      outputPath: elements.detailOutputPath,
      progressBar: elements.detailProgressBar,
      progressText: elements.detailProgressText,
      progressPercent: elements.detailProgressPercent,
    };
  }
  return {
    route: "export-declare",
    label: "资产基础法申报表",
    outputPath: elements.declareOutputPath,
    progressBar: elements.declareProgressBar,
    progressText: elements.declareProgressText,
    progressPercent: elements.declareProgressPercent,
  };
}

function setExportProgress(exportType, percent, text) {
  const ui = exportUi(exportType);
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  ui.progressBar.value = safePercent;
  ui.progressPercent.textContent = `${safePercent}%`;
  ui.progressText.textContent = text || (safePercent === 100 ? "导出完成" : "正在导出");
}

async function chooseExportDirectory(exportType) {
  if (busy) return;
  const ui = exportUi(exportType);
  setBusy(true);
  setStatus("正在打开文件夹选择器...", "idle");
  try {
    const result = await sendNativeMessage({ action: "select_export_directory" }, 130000);
    if (!result?.ok) {
      if (result?.cancelled) {
        setStatus("已取消选择目录", "warn");
        return;
      }
      throw new Error(result?.reason || "DIRECTORY_SELECTION_FAILED");
    }
    ui.outputPath.value = result.path || "";
    latestPayload = {
      ...result,
      collectedAt: new Date().toISOString(),
    };
    elements.json.textContent = JSON.stringify(latestPayload, null, 2);
    setStatus(`已选择导出目录：${result.path}`, "ok");
  } catch (error) {
    setStatus(`选择目录失败：${error?.message || String(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

function getExportCompanyIds() {
  if (!mcpCompanyListLoaded || !availableCompanies.length) {
    throw new Error("请先加载公司清单。");
  }
  if (confirmedCompanyValues === null) {
    throw new Error("请先确认公司选择。");
  }
  const ids = confirmedCompanyValues
    .map((value) => availableCompanies.find((item) => item.value === value))
    .filter(Boolean)
    .map((item) => String(item.id || item.value || "").trim())
    .filter((value) => /^\d+$/.test(value));
  if (!ids.length) throw new Error("没有可导出的公司 ID。");
  return [...new Set(ids)];
}

function exportFailureMessage(payload) {
  const guidance = String(payload?.userMessage || "").trim();
  if (guidance) return guidance;
  return `导出失败：${payload?.reason || payload?.message || "未知原因"}`;
}

async function runCliExport(exportType) {
  if (busy) return;
  const ui = exportUi(exportType);
  clearTaskLog();
  setExportProgress(exportType, 0, "正在检查导出条件");
  setBusy(true);
  const startedAt = new Date().toISOString();

  try {
    const health = await checkConnections();
    if (!health?.cli?.ok) throw new Error("CLI 未连接，请先在连接配置页完成授权。");
    const projectId = String(latestContext?.route?.projectId || "").trim();
    if (!/^\d+$/.test(projectId)) throw new Error("当前页面未读取到项目 ID。");
    const companyIds = getExportCompanyIds();
    const outDir = ui.outputPath.value.trim();
    if (!outDir) throw new Error("请先选择存放路径。");

    appendTaskLog(`开始导出${ui.label}：${companyIds.length} 个公司`);
    appendTaskLog(`存放目录：${outDir}`);
    setStatus(`正在导出${ui.label}...`, "idle");

    const result = await streamNativeMessage({
      action: "run_cli_export",
      exportType,
      projectId,
      companyIds,
      outDir,
    }, (progress) => {
      setExportProgress(exportType, progress.percent, progress.message);
      if (progress.message) appendTaskLog(progress.message);
    });

    const payload = {
      ...result,
      action: "cli_table_export",
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    await storageSet({ [STORAGE_LAST_EXPORT_RESULT_KEY]: payload });
    if (!result?.ok) throw Object.assign(new Error(result?.reason || "CLI 导出失败"), { payload });

    setExportProgress(exportType, 100, `导出完成，共生成 ${result.outputFiles?.length || 0} 个文件`);
    appendTaskLog(`导出完成：${result.outputFiles?.length || 0} 个文件`);
    setStatus(`${ui.label}导出完成`, "ok");
  } catch (error) {
    const payload = error?.payload || {
      ok: false,
      action: "cli_table_export",
      exportType,
      reason: error?.message || String(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    await storageSet({ [STORAGE_LAST_EXPORT_RESULT_KEY]: payload });
    const message = exportFailureMessage(payload);
    appendTaskLog(message);
    setExportProgress(exportType, payload.percent || 0, message);
    setStatus(message, "error");
  } finally {
    setBusy(false);
  }
}

function printFormatUi(formatType) {
  if (formatType === "detail") {
    return {
      route: "format-detail",
      label: "明细表打印格式",
      inputSummary: elements.detailPrintInputSummary,
      outputMode: elements.detailPrintOutputMode,
      outputDirectoryWrap: elements.detailPrintOutputDirectoryWrap,
      outputPath: elements.detailPrintOutputPath,
      progressBar: elements.detailPrintProgressBar,
      progressText: elements.detailPrintProgressText,
      progressPercent: elements.detailPrintProgressPercent,
    };
  }
  return {
    route: "format-declaration",
    label: "申报表打印格式",
    inputSummary: elements.declarationPrintInputSummary,
    outputMode: elements.declarationPrintOutputMode,
    outputDirectoryWrap: elements.declarationPrintOutputDirectoryWrap,
    outputPath: elements.declarationPrintOutputPath,
    progressBar: elements.declarationPrintProgressBar,
    progressText: elements.declarationPrintProgressText,
    progressPercent: elements.declarationPrintProgressPercent,
  };
}

function setPrintFormatProgress(formatType, percent, text) {
  const ui = printFormatUi(formatType);
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  ui.progressBar.value = safePercent;
  ui.progressPercent.textContent = `${safePercent}%`;
  ui.progressText.textContent = text || (safePercent === 100 ? "处理完成" : "正在处理");
}

function renderPrintInputSummary(formatType) {
  const ui = printFormatUi(formatType);
  const paths = printTaskStates[formatType].inputPaths;
  if (!paths.length) {
    ui.inputSummary.textContent = "尚未选择文件";
    return;
  }
  if (paths.length === 1) {
    ui.inputSummary.textContent = paths[0];
    return;
  }
  ui.inputSummary.textContent = `已选择 ${paths.length} 个文件`;
}

async function choosePrintInputs(formatType, sourceKind) {
  if (busy) return;
  setBusy(true);
  setStatus(sourceKind === "files" ? "正在选择 Excel 文件..." : "正在选择文件夹...", "idle");
  try {
    const action = sourceKind === "files"
      ? "select_print_workbook_files"
      : "select_print_workbook_directory";
    const result = await sendNativeMessage({ action }, 130000);
    if (!result?.ok) {
      if (result?.cancelled) {
        setStatus("已取消选择", "warn");
        return;
      }
      throw new Error(result?.reason || "PRINT_INPUT_SELECTION_FAILED");
    }
    printTaskStates[formatType].inputPaths = Array.isArray(result.paths) ? result.paths : [];
    renderPrintInputSummary(formatType);
    latestPayload = {
      ...result,
      formatType,
      collectedAt: new Date().toISOString(),
    };
    elements.json.textContent = JSON.stringify(latestPayload, null, 2);
    setStatus(
      sourceKind === "files"
        ? `已选择 ${printTaskStates[formatType].inputPaths.length} 个文件`
        : "已选择批处理文件夹",
      "ok",
    );
  } catch (error) {
    setStatus(`选择失败：${error?.message || String(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

async function choosePrintOutputDirectory(formatType) {
  if (busy) return;
  const ui = printFormatUi(formatType);
  setBusy(true);
  setStatus("正在选择打印版存放位置...", "idle");
  try {
    const result = await sendNativeMessage({ action: "select_print_output_directory" }, 130000);
    if (!result?.ok) {
      if (result?.cancelled) {
        setStatus("已取消选择目录", "warn");
        return;
      }
      throw new Error(result?.reason || "PRINT_OUTPUT_SELECTION_FAILED");
    }
    ui.outputPath.value = result.paths?.[0] || "";
    setStatus(`已选择存放位置：${ui.outputPath.value}`, "ok");
  } catch (error) {
    setStatus(`选择目录失败：${error?.message || String(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

function updatePrintOutputMode(formatType) {
  const ui = printFormatUi(formatType);
  ui.outputDirectoryWrap.classList.toggle("hidden", ui.outputMode.value !== "new_directory");
}

async function runPrintFormat(formatType) {
  if (busy) return;
  const ui = printFormatUi(formatType);
  clearTaskLog();
  setPrintFormatProgress(formatType, 0, "正在检查处理条件");
  setBusy(true);
  const startedAt = new Date().toISOString();

  try {
    const health = await checkConnections();
    if (!health?.ok) throw new Error("Helper 未连接。");
    const inputPaths = [...printTaskStates[formatType].inputPaths];
    if (!inputPaths.length) throw new Error("请先选择文件或文件夹。");
    const outputMode = ui.outputMode.value;
    const outputDir = outputMode === "new_directory" ? ui.outputPath.value.trim() : "";
    if (outputMode === "new_directory" && !outputDir) throw new Error("请先选择新的存放位置。");

    appendTaskLog(`开始执行${ui.label}`);
    appendTaskLog(`输入范围：${inputPaths.length} 项；输出方式=${outputMode}`);
    setStatus(`正在执行${ui.label}...`, "idle");

    const result = await streamNativeMessage({
      action: "run_print_format",
      formatType,
      inputPaths,
      outputMode,
      outputDir,
    }, (progress) => {
      setPrintFormatProgress(formatType, progress.percent, progress.message);
      if (progress.message) appendTaskLog(progress.message);
    });

    const payload = {
      ...result,
      action: "batch_print_format",
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    await storageSet({ [STORAGE_LAST_EXPORT_RESULT_KEY]: payload });
    setPrintFormatProgress(
      formatType,
      100,
      result.ok
        ? `处理完成：${result.successCount}/${result.total} 个文件`
        : `处理完成，失败 ${result.failedCount || 0} 个`,
    );
    appendTaskLog(`处理结束：成功 ${result.successCount || 0}，失败 ${result.failedCount || 0}`);
    setStatus(
      result.ok ? `${ui.label}处理完成` : `${ui.label}存在失败文件`,
      result.ok ? "ok" : "warn",
    );
  } catch (error) {
    const payload = {
      ok: false,
      action: "batch_print_format",
      formatType,
      reason: error?.message || String(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    await storageSet({ [STORAGE_LAST_EXPORT_RESULT_KEY]: payload });
    appendTaskLog(`处理失败：${payload.reason}`);
    setPrintFormatProgress(formatType, 0, `处理失败：${payload.reason}`);
    setStatus(`处理失败：${payload.reason}`, "error");
  } finally {
    setBusy(false);
  }
}

function setConnection(element, text, kind = "idle") {
  element.className = `conn conn-${kind}`;
  element.textContent = text;
}

function connectorLevelLabel(level) {
  return {
    read: "可读取",
    preview: "可预演",
    confirm: "确认后执行",
    local: "本机执行",
    routing: "连接路由",
    unsupported: "不支持",
    deferred: "暂缓",
  }[level] || level || "未知";
}

function renderConnectorCapabilities(capabilities = {}) {
  elements.connectorCapabilities.innerHTML = "";
  const items = Object.values(capabilities).filter((item) => item && typeof item === "object");
  if (!items.length) {
    elements.connectorCapabilities.innerHTML = '<div class="empty-list">尚未读取能力协议</div>';
    elements.connectorCapabilitySummary.textContent = "等待连接";
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "capability-item";
    const label = document.createElement("span");
    label.textContent = item.label || "未命名能力";
    const level = document.createElement("strong");
    level.className = "capability-level";
    level.dataset.level = item.level || "";
    level.textContent = connectorLevelLabel(item.level);
    row.append(label, level);
    elements.connectorCapabilities.appendChild(row);
  }
  const supportedCount = items.filter((item) => item.supported).length;
  elements.connectorCapabilitySummary.textContent = `${supportedCount}/${items.length} 项可用`;
}

function connectorPageLabel(binding = {}, context = {}) {
  if (binding.pageType) return binding.pageType;
  if (context.route?.isAssetDraftRoute) return "资产基础法底稿";
  if (context.route?.isEquityListRoute) return "公司列表";
  if (context.route?.isTianyuanRoute) return "天源页面";
  return "未识别";
}

function agentBindingLabel(binding = {}) {
  const source = binding.displayName || binding.providerId || "未命名来源";
  const target = binding.scope === "workspace"
    ? (binding.workspaceName || binding.workspaceId || "工作区")
    : (binding.conversationTitle || binding.conversationId || "对话");
  return `${source} / ${target}`;
}

function codexControlBinding(session = connectorSession) {
  return (session?.agentBindings || []).find((binding) => binding.providerId === "codex" && binding.accessMode === "control") || null;
}

function renderAgentSources() {
  if (!elements.agentSourceList) return;
  elements.agentSourceList.innerHTML = "";
  if (!connectorAgentSources.length) {
    elements.agentSourceList.innerHTML = '<div class="empty-list">未发现已注册来源</div>';
    return;
  }
  for (const source of connectorAgentSources) {
    const row = document.createElement("div");
    row.className = "agent-row";
    const name = document.createElement("strong");
    name.textContent = source.displayName || source.providerId || "未命名来源";
    const meta = document.createElement("span");
    meta.textContent = `${source.providerId} · ${source.lastSeenAt ? "在线" : "未连接"}${source.manual ? " · 手动" : ""}`;
    row.append(name, meta);
    elements.agentSourceList.appendChild(row);
  }
}

function renderAgentBindings(session) {
  if (!elements.agentBindingList) return;
  elements.agentBindingList.innerHTML = "";
  const bindings = Array.isArray(session?.agentBindings) ? session.agentBindings : [];
  if (!bindings.length) {
    elements.agentBindingList.innerHTML = '<div class="empty-list">当前页面尚未绑定 Agent</div>';
    return;
  }
  for (const binding of bindings) {
    const row = document.createElement("div");
    row.className = "agent-row";
    const text = document.createElement("span");
    text.textContent = `${agentBindingLabel(binding)} · ${binding.accessMode === "control" ? "控制" : "只读"} · ${binding.scope === "workspace" ? "工作区" : "对话"}`;
    const actions = document.createElement("div");
    actions.className = "button-row";
    const mode = document.createElement("button");
    mode.type = "button";
    mode.className = "tiny secondary";
    mode.textContent = binding.accessMode === "control" ? "改为只读" : "设为控制者";
    mode.addEventListener("click", () => updateAgentBindingAccess(binding, binding.accessMode === "control" ? "read" : "control"));
    actions.appendChild(mode);
    row.append(text, actions);
    elements.agentBindingList.appendChild(row);
  }
}

async function loadAgentSources() {
  try {
    const result = await connectorFetch("/api/agent-sources");
    connectorAgentSources = Array.isArray(result.sources) ? result.sources : [];
    renderAgentSources();
    return connectorAgentSources;
  } catch (error) {
    connectorAgentSources = [];
    renderAgentSources();
    setConnectorBindingFeedback(`Agent 来源读取失败：${error.message}`, "warn");
    return [];
  }
}

async function updateAgentBindingAccess(binding, accessMode) {
  if (!connectorSessionId) return;
  let confirmControlTransfer = "";
  if (accessMode === "control" && !window.confirm(`确认将当前页面控制权切换给“${binding.displayName || binding.providerId}”？旧控制者尚未执行的任务会取消。`)) return;
  if (accessMode === "control") confirmControlTransfer = "确认切换控制权";
  try {
    const result = await connectorFetch(
      `/api/sessions/${encodeURIComponent(connectorSessionId)}/agent-bindings/${encodeURIComponent(binding.bindingId)}/access`,
      { method: "POST", body: JSON.stringify({ accessMode, confirmControlTransfer }) },
    );
    renderConnectorSession(result.session);
    setConnectorBindingFeedback(accessMode === "control" ? "控制权已切换，旧控制者队列已取消" : "已改为只读权限", "ok");
  } catch (error) {
    setConnectorBindingFeedback(`权限切换失败：${error.message}`, "error");
  }
}

async function addManualAgent() {
  const workspaceId = elements.manualAgentWorkspaceId.value.trim();
  const scope = elements.manualAgentScope.value;
  const conversationId = elements.manualAgentConversationId.value.trim();
  if (!workspaceId && !conversationId) {
    elements.manualAgentFeedback.textContent = "请填写工作区或对话标识。";
    return;
  }
  if (scope === "conversation" && !conversationId) {
    elements.manualAgentFeedback.textContent = "对话范围需要填写对话标识。";
    return;
  }
  const accessMode = elements.manualAgentAccess.value;
  let confirmControlTransfer = "";
  if (accessMode === "control" && !window.confirm("确认将当前页面控制权交给手动 WorkBuddy 来源？旧控制者尚未执行的任务会取消。")) return;
  if (accessMode === "control") confirmControlTransfer = "确认切换控制权";
  setBusy(true);
  try {
    const session = await ensureCurrentPageConnectorSession();
    const sourceResult = await connectorFetch("/api/agent-sources/manual", {
      method: "POST",
      body: JSON.stringify({ providerId: "workbuddy", displayName: elements.manualAgentDisplayName.value.trim() || "WorkBuddy" }),
    });
    const result = await connectorFetch(`/api/sessions/${encodeURIComponent(session.sessionId)}/agent-bindings`, {
      method: "POST",
      body: JSON.stringify({
        providerId: sourceResult.source.providerId,
        installationId: sourceResult.source.installationId,
        workspaceId,
        workspaceName: elements.manualAgentWorkspaceName.value.trim(),
        conversationId,
        conversationTitle: elements.manualAgentConversationTitle.value.trim(),
        scope,
        accessMode,
        manualBinding: true,
        confirmControlTransfer,
      }),
    });
    renderConnectorSession(result.session);
    await loadAgentSources();
    const configPath = sourceResult.workbuddyConfig?.env?.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH || "";
    elements.manualAgentFeedback.textContent = `已创建手动来源并绑定当前页面。WorkBuddy stdio 配置路径：${configPath}`;
  } catch (error) {
    elements.manualAgentFeedback.textContent = `添加失败：${error.message}`;
  } finally {
    setBusy(false);
  }
}

function renderConnectorSession(session) {
  connectorSession = session || null;
  if (!session) {
    elements.connectorBindingStatus.textContent = "尚未绑定";
    elements.connectorSessionId.textContent = "-";
    elements.connectorProject.textContent = "-";
    elements.connectorPage.textContent = "-";
    elements.connectorLastSeen.textContent = "-";
    elements.connectorCodexBindingStatus.textContent = "未绑定";
    elements.connectorBindingId.textContent = "-";
    renderAgentBindings(null);
    if (!connectorBindingFormDirty) resetConnectorBindingForm();
    return;
  }
  const binding = session.binding || {};
  const context = session.context || {};
  elements.connectorBindingStatus.textContent = session.status === "online" ? "已绑定当前页面" : (session.status || "已注册");
  elements.connectorSessionId.textContent = session.sessionId || "-";
  elements.connectorProject.textContent = [
    binding.projectId ? `项目 ${binding.projectId}` : "",
    binding.companyId ? `公司 ${binding.companyId}` : "",
    binding.subjectCode ? `科目 ${binding.subjectCode}` : "",
  ].filter(Boolean).join(" / ") || "-";
  elements.connectorPage.textContent = connectorPageLabel(binding, context);
  elements.connectorLastSeen.textContent = session.lastSeenAt
    ? new Date(session.lastSeenAt).toLocaleTimeString("zh-CN", { hour12: false })
    : "-";
  const codexBinding = session.codexBinding || null;
  elements.connectorCodexBindingStatus.textContent = codexBinding
    ? (codexBinding.scope === "project" ? "已绑定项目" : "已绑定当前对话")
    : "未绑定";
  elements.connectorBindingId.textContent = codexBinding?.bindingId || "-";
  if (!connectorBindingFormDirty) renderConnectorBindingForm(codexBinding);
  renderAgentBindings(session);
  renderConnectorCapabilities(session.capabilities || connectorProtocol?.capabilities || {});
}

async function connectorFetch(path, options = {}) {
  const response = await fetch(`${CONNECTOR_BASE_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "content-type": "application/json",
      "x-tianyuan-extension-id": chrome.runtime.id,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.reason || `CONNECTOR_HTTP_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function resetConnectorBindingForm() {
  elements.connectorProjectSelect.innerHTML = '<option value="">请选择 Codex 项目</option>';
  elements.connectorThreadSelect.innerHTML = '<option value="">请先选择项目</option>';
  elements.connectorBindingScope.value = "thread";
  elements.connectorThreadField.classList.remove("hidden");
}

function selectedConnectorProject() {
  return connectorCatalog.projects.find((item) => String(item.projectId) === elements.connectorProjectSelect.value) || null;
}

function compactPath(value) {
  const text = String(value || "");
  if (text.length <= 46) return text;
  const parts = text.split(/[\\/]+/).filter(Boolean);
  if (parts.length >= 2) return `.../${parts.slice(-2).join("/")}`;
  return `...${text.slice(-42)}`;
}

function connectorProjectLabel(project) {
  return String(project?.projectName || project?.label || project?.projectId || "未命名项目");
}

function connectorThreadLabel(thread) {
  return String(thread?.title || thread?.threadTitle || thread?.threadId || thread?.id || "未命名对话");
}

function connectorProjectThreads(project = selectedConnectorProject()) {
  const projectId = String(project?.projectId || "");
  const projectPath = String(project?.projectPath || project?.path || "").replace(/[\\/]+$/, "");
  const projectName = String(project?.projectName || project?.label || "");
  return connectorCatalog.threads.filter((thread) => {
    const threadPath = String(thread.projectPath || thread.cwd || "").replace(/[\\/]+$/, "");
    return (
      (projectId && String(thread.projectId || "") === projectId)
      || (projectPath && threadPath === projectPath)
      || (projectName && String(thread.projectName || "") === projectName)
    );
  });
}

function setPickerButton(button, title, meta = "") {
  if (!button) return;
  button.innerHTML = `<span class="picker-title">${escapeHtml(title || "未选择")}${meta ? `<span class="picker-meta">${escapeHtml(meta)}</span>` : ""}</span>`;
}

function openConnectorPicker(kind) {
  const isProject = kind === "project";
  const picker = isProject ? elements.connectorProjectPicker : elements.connectorThreadPicker;
  const menu = isProject ? elements.connectorProjectPickerMenu : elements.connectorThreadPickerMenu;
  const otherPicker = isProject ? elements.connectorThreadPicker : elements.connectorProjectPicker;
  const otherMenu = isProject ? elements.connectorThreadPickerMenu : elements.connectorProjectPickerMenu;
  otherMenu?.classList.add("hidden");
  otherPicker?.classList.remove("open");
  menu?.classList.toggle("hidden");
  picker?.classList.toggle("open", !menu?.classList.contains("hidden"));
  if (!menu?.classList.contains("hidden")) {
    (isProject ? elements.connectorProjectFilter : elements.connectorThreadFilter)?.focus();
  }
}

function closeConnectorPickers() {
  elements.connectorProjectPickerMenu?.classList.add("hidden");
  elements.connectorThreadPickerMenu?.classList.add("hidden");
  elements.connectorProjectPicker?.classList.remove("open");
  elements.connectorThreadPicker?.classList.remove("open");
}

function renderConnectorProjectPicker() {
  const selected = selectedConnectorProject();
  setPickerButton(
    elements.connectorProjectPickerButton,
    selected ? connectorProjectLabel(selected) : (connectorCatalog.projects.length ? "请选择 Codex 项目" : "未发现 Codex 项目"),
    selected ? compactPath(selected.projectPath || selected.path || "") : "",
  );
  if (!elements.connectorProjectPickerList) return;
  const filter = String(elements.connectorProjectFilter?.value || "").trim().toLowerCase();
  const items = connectorCatalog.projects.filter((project) => {
    if (!filter) return true;
    return [connectorProjectLabel(project), project.projectPath, project.path, project.projectId]
      .some((value) => String(value || "").toLowerCase().includes(filter));
  });
  elements.connectorProjectPickerList.innerHTML = "";
  const emptyButton = document.createElement("button");
  emptyButton.type = "button";
  emptyButton.className = `picker-option ${selected ? "" : "selected"}`;
  emptyButton.innerHTML = '<span class="picker-option-title">不绑定项目</span><span class="picker-option-meta">仅保留页面连接</span>';
  emptyButton.addEventListener("click", () => {
    elements.connectorProjectSelect.value = "";
    elements.connectorThreadSelect.value = "";
    connectorBindingFormDirty = true;
    renderConnectorThreadOptions();
    renderConnectorProjectPicker();
    closeConnectorPickers();
  });
  elements.connectorProjectPickerList.appendChild(emptyButton);
  for (const project of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `picker-option ${String(project.projectId || "") === elements.connectorProjectSelect.value ? "selected" : ""}`;
    button.innerHTML = `<span class="picker-option-title">${escapeHtml(connectorProjectLabel(project))}</span><span class="picker-option-meta">${escapeHtml(compactPath(project.projectPath || project.path || ""))}</span>`;
    button.addEventListener("click", () => {
      elements.connectorProjectSelect.value = project.projectId || "";
      elements.connectorThreadSelect.value = "";
      connectorBindingFormDirty = true;
      renderConnectorThreadOptions();
      renderConnectorProjectPicker();
      closeConnectorPickers();
    });
    elements.connectorProjectPickerList.appendChild(button);
  }
}

function renderConnectorThreadPicker() {
  const threads = connectorProjectThreads();
  const selectedThreadId = elements.connectorThreadSelect.value;
  const selected = threads.find((thread) => String(thread.threadId || thread.id || "") === selectedThreadId) || null;
  setPickerButton(
    elements.connectorThreadPickerButton,
    selected ? connectorThreadLabel(selected) : (selectedConnectorProject() ? (threads.length ? "请选择 Codex 对话" : "该项目暂无可识别对话") : "请先选择项目"),
    selected ? compactPath(selected.projectPath || selected.cwd || "") : "",
  );
  if (!elements.connectorThreadPickerList) return;
  const filter = String(elements.connectorThreadFilter?.value || "").trim().toLowerCase();
  const items = threads.filter((thread) => {
    if (!filter) return true;
    return [connectorThreadLabel(thread), thread.projectPath, thread.cwd, thread.threadId, thread.id]
      .some((value) => String(value || "").toLowerCase().includes(filter));
  });
  elements.connectorThreadPickerList.innerHTML = "";
  const emptyButton = document.createElement("button");
  emptyButton.type = "button";
  emptyButton.className = `picker-option ${selected ? "" : "selected"}`;
  emptyButton.innerHTML = '<span class="picker-option-title">不绑定对话</span><span class="picker-option-meta">仅绑定项目或页面</span>';
  emptyButton.addEventListener("click", () => {
    elements.connectorThreadSelect.value = "";
    connectorBindingFormDirty = true;
    renderConnectorThreadPicker();
    closeConnectorPickers();
  });
  elements.connectorThreadPickerList.appendChild(emptyButton);
  for (const thread of items) {
    const threadId = thread.threadId || thread.id || "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `picker-option ${String(threadId) === selectedThreadId ? "selected" : ""}`;
    button.innerHTML = `<span class="picker-option-title">${escapeHtml(connectorThreadLabel(thread))}</span><span class="picker-option-meta">${escapeHtml(compactPath(thread.projectPath || thread.cwd || ""))}</span>`;
    button.addEventListener("click", () => {
      elements.connectorThreadSelect.value = threadId;
      connectorBindingFormDirty = true;
      renderConnectorThreadPicker();
      closeConnectorPickers();
    });
    elements.connectorThreadPickerList.appendChild(button);
  }
}

function renderConnectorThreadOptions() {
  const threads = connectorProjectThreads();
  elements.connectorThreadSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = threads.length ? "请选择 Codex 对话" : "该项目暂无可识别对话";
  elements.connectorThreadSelect.appendChild(placeholder);
  for (const thread of threads) {
    const option = document.createElement("option");
    option.value = thread.threadId || thread.id || "";
    option.textContent = connectorThreadLabel(thread);
    option.title = [thread.title, thread.projectPath || thread.cwd].filter(Boolean).join("\n");
    elements.connectorThreadSelect.appendChild(option);
  }
  renderConnectorThreadPicker();
}

function renderConnectorCatalog() {
  const selectedProjectId = elements.connectorProjectSelect.value;
  elements.connectorProjectSelect.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = connectorCatalog.projects.length ? "请选择 Codex 项目" : "未发现 Codex 项目";
  elements.connectorProjectSelect.appendChild(empty);
  for (const project of connectorCatalog.projects) {
    const option = document.createElement("option");
    option.value = project.projectId || "";
    option.textContent = project.projectName || project.label || project.projectId || "未命名项目";
    option.title = project.projectPath || project.path || "";
    elements.connectorProjectSelect.appendChild(option);
  }
  if (selectedProjectId && connectorCatalog.projects.some((item) => item.projectId === selectedProjectId)) {
    elements.connectorProjectSelect.value = selectedProjectId;
  }
  renderConnectorThreadOptions();
  renderConnectorProjectPicker();
}

function renderConnectorBindingForm(binding) {
  if (!binding) {
    if (!connectorBindingFormDirty) {
      elements.connectorProjectSelect.value = "";
      elements.connectorBindingScope.value = "thread";
      renderConnectorThreadOptions();
      elements.connectorThreadSelect.value = "";
      renderConnectorProjectPicker();
      renderConnectorThreadPicker();
    }
    return;
  }
  if (binding.projectId && connectorCatalog.projects.some((item) => item.projectId === binding.projectId)) {
    elements.connectorProjectSelect.value = binding.projectId;
  }
  elements.connectorBindingScope.value = binding.scope === "project" ? "project" : "thread";
  renderConnectorThreadOptions();
  elements.connectorThreadSelect.value = binding.threadId || "";
  renderConnectorProjectPicker();
  renderConnectorThreadPicker();
}

async function loadConnectorCatalog() {
  try {
    const catalog = await connectorFetch("/api/catalog");
    connectorCatalog = {
      projects: Array.isArray(catalog.projects) ? catalog.projects : [],
      threads: Array.isArray(catalog.threads) ? catalog.threads : [],
      updatedAt: catalog.updatedAt || null,
    };
    renderConnectorCatalog();
    elements.connectorBindingFeedback.textContent = `已加载 ${connectorCatalog.projects.length} 个项目、${connectorCatalog.threads.length} 个对话`;
    return catalog;
  } catch (error) {
    connectorCatalog = { projects: [], threads: [], updatedAt: null };
    renderConnectorCatalog();
    elements.connectorBindingFeedback.textContent = `项目/对话列表暂不可用：${error.message}`;
    return null;
  }
}

function connectorBindingPayload() {
  const project = selectedConnectorProject();
  const threadId = elements.connectorThreadSelect.value;
  const thread = connectorCatalog.threads.find((item) => (item.threadId || item.id) === threadId);
  return {
    projectId: project?.projectId || "",
    projectName: project?.projectName || project?.label || "",
    projectPath: project?.projectPath || project?.path || "",
    threadId: elements.connectorBindingScope.value === "project" ? "" : threadId,
    threadTitle: elements.connectorBindingScope.value === "project" ? "" : (thread?.title || ""),
    scope: elements.connectorBindingScope.value,
  };
}

function setConnectorBindingFeedback(text, kind = "idle") {
  elements.connectorBindingFeedback.textContent = text;
  elements.connectorBindingFeedback.dataset.kind = kind;
}

async function ensureCurrentPageConnectorSession() {
  let connection = await checkConnectorConnection();
  if (!connection.ok) {
    setConnectorBindingFeedback("Connector 未运行，正在自动启动...", "idle");
    const startResult = await sendNativeMessage({ action: "start_connector_bridge" });
    if (!startResult?.ok) throw new Error(startResult?.reason || "CONNECTOR_START_FAILED");
    connection = await checkConnectorConnection();
    if (!connection.ok) throw new Error(connection.reason || "CONNECTOR_HEALTH_FAILED");
  }

  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.startsWith("https://excel.zhrdc.net/ty/")) {
    throw new Error("请先切换到需要绑定的天源页面。");
  }
  if (
    connectorSessionId
    && connectorSession?.sessionId === connectorSessionId
    && connectorSession?.binding?.tabId === tab.id
  ) {
    return connectorSession;
  }

  setConnectorBindingFeedback("正在读取并绑定当前天源页面...", "idle");
  const context = await sendToTab(tab, { type: REQUEST_TYPE });
  render(context);
  if (!context?.ok) throw new Error(context?.reason || context?.message || "当前页面上下文读取失败。");
  await loadConnectorSessionId();
  const result = await connectorFetch("/api/sessions/register", {
    method: "POST",
    body: JSON.stringify({
      sessionId: connectorSessionId || undefined,
      binding: connectorBindingFrom(tab, context),
      client: {
        name: "tianyuan-browser-workbench",
        version: chrome.runtime.getManifest().version,
        extensionId: chrome.runtime.id,
      },
      context,
    }),
  });
  connectorSessionId = result.session.sessionId;
  await storageSet({ [STORAGE_CONNECTOR_SESSION_KEY]: connectorSessionId });
  renderConnectorSession(result.session);
  setConnection(elements.connectorStatus, "已绑定", "ok");
  return result.session;
}

async function saveConnectorCodexBinding() {
  const payload = connectorBindingPayload();
  if (!payload.projectId) {
    setConnectorBindingFeedback("请先选择 Codex 项目。", "warn");
    setStatus("请先选择 Codex 项目", "warn");
    return;
  }
  if (payload.scope === "thread" && !payload.threadId) {
    setConnectorBindingFeedback("请先选择 Codex 对话，或改为整个项目。", "warn");
    setStatus("请先选择 Codex 对话，或改为项目范围", "warn");
    return;
  }
  setBusy(true);
  setConnectorBindingFeedback("正在检查页面连接并保存绑定...", "idle");
  try {
    await ensureCurrentPageConnectorSession();
    let result = await connectorFetch(`/api/sessions/${encodeURIComponent(connectorSessionId)}/binding`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    connectorBindingFormDirty = false;
    renderConnectorSession(result.session);
    setConnectorBindingFeedback(payload.scope === "project"
      ? "已绑定当前 Codex 项目，同项目对话可使用"
      : "已绑定当前 Codex 对话，其他对话不能使用", "ok");
    setStatus("Codex 绑定已保存", "ok");
  } catch (error) {
    if (error.message === "CONTROL_TRANSFER_CONFIRMATION_REQUIRED" && window.confirm("当前页面已有其他 Agent 控制者。确认切换给 Codex？旧控制者尚未执行的任务会取消。")) {
      try {
        const result = await connectorFetch(`/api/sessions/${encodeURIComponent(connectorSessionId)}/binding`, {
          method: "POST",
          body: JSON.stringify({ ...payload, confirmControlTransfer: "确认切换控制权" }),
        });
        connectorBindingFormDirty = false;
        renderConnectorSession(result.session);
        setConnectorBindingFeedback("控制权已切换给 Codex，旧控制者队列已取消", "ok");
        return;
      } catch (retryError) {
        error = retryError;
      }
    }
    setConnectorBindingFeedback(`绑定失败：${error.message}`, "error");
    setStatus(`Codex 绑定失败：${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function bindConnectorCurrentThread() {
  const payload = connectorBindingPayload();
  if (!payload.projectId) {
    setConnectorBindingFeedback("请先选择 Codex 项目。", "warn");
    setStatus("请先选择 Codex 项目", "warn");
    return;
  }
  setBusy(true);
  setConnectorBindingFeedback("正在自动连接页面并查找当前对话...", "idle");
  try {
    await ensureCurrentPageConnectorSession();
    const result = await connectorFetch(`/api/sessions/${encodeURIComponent(connectorSessionId)}/binding/current-thread`, {
      method: "POST",
      body: JSON.stringify({ ...payload, scope: "thread" }),
    });
    connectorBindingFormDirty = false;
    renderConnectorSession(result.session);
    setConnectorBindingFeedback(`已绑定当前对话：${result.thread?.title || result.binding?.threadId || "Codex 对话"}`, "ok");
    setStatus("当前 Codex 对话绑定成功", "ok");
  } catch (error) {
    if (error.message === "CONTROL_TRANSFER_CONFIRMATION_REQUIRED" && window.confirm("当前页面已有其他 Agent 控制者。确认切换给 Codex？旧控制者尚未执行的任务会取消。")) {
      try {
        const result = await connectorFetch(`/api/sessions/${encodeURIComponent(connectorSessionId)}/binding/current-thread`, {
          method: "POST",
          body: JSON.stringify({ ...payload, scope: "thread", confirmControlTransfer: "确认切换控制权" }),
        });
        connectorBindingFormDirty = false;
        renderConnectorSession(result.session);
        setConnectorBindingFeedback("控制权已切换给 Codex，旧控制者队列已取消", "ok");
        return;
      } catch (retryError) {
        error = retryError;
      }
    }
    setConnectorBindingFeedback(`绑定当前对话失败：${error.message}`, "error");
    setStatus(`绑定当前对话失败：${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function clearConnectorCodexBinding() {
  if (!connectorSessionId) {
    setConnectorBindingFeedback("当前页面尚未建立 Connector session。", "warn");
    return;
  }
  setBusy(true);
  setConnectorBindingFeedback("正在解除绑定...", "idle");
  try {
    const result = await connectorFetch(`/api/sessions/${encodeURIComponent(connectorSessionId)}/binding`, { method: "DELETE" });
    connectorBindingFormDirty = false;
    renderConnectorSession(result.session);
    setConnectorBindingFeedback("已解除 Codex 绑定，当前页面不会接受 Codex 操作", "ok");
    setStatus("Codex 绑定已解除", "warn");
  } catch (error) {
    setConnectorBindingFeedback(`解除绑定失败：${error.message}`, "error");
    setStatus(`解除绑定失败：${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function loadConnectorSessionId() {
  if (connectorSessionId) return connectorSessionId;
  connectorSessionId = String(await storageGet(STORAGE_CONNECTOR_SESSION_KEY) || "");
  return connectorSessionId;
}

async function checkConnectorConnection({ silent = false } = {}) {
  if (!silent) setConnection(elements.connectorStatus, "检查中", "idle");
  try {
    const [health, protocol] = await Promise.all([
      connectorFetch("/health"),
      connectorFetch("/api/protocol"),
    ]);
    connectorProtocol = protocol;
    setConnection(elements.connectorStatus, health.sessionCount ? "已绑定" : "已启动", "ok");
    renderConnectorCapabilities(protocol.capabilities || {});
    await loadAgentSources();

    await loadConnectorSessionId();
    if (connectorSessionId) {
      try {
        const sessionResult = await connectorFetch(`/api/sessions/${encodeURIComponent(connectorSessionId)}`);
        renderConnectorSession(sessionResult.session);
      } catch (error) {
        if (error.status === 404) {
          connectorSessionId = "";
          connectorSession = null;
          await storageRemove(STORAGE_CONNECTOR_SESSION_KEY);
          renderConnectorSession(null);
        } else {
          throw error;
        }
      }
    }
    return { ok: true, health, protocol, session: connectorSession };
  } catch (error) {
    setConnection(elements.connectorStatus, "未启动", "warn");
    renderConnectorSession(null);
    if (!connectorProtocol) renderConnectorCapabilities({});
    return { ok: false, reason: error?.message || String(error) };
  }
}

async function startConnector() {
  if (busy) return null;
  setBusy(true);
  setStatus("正在启动 Connector...", "idle");
  try {
    const result = await sendNativeMessage({ action: "start_connector_bridge" });
    if (!result?.ok) throw new Error(result?.reason || "CONNECTOR_START_FAILED");
    const connection = await checkConnectorConnection();
    if (!connection.ok) throw new Error(connection.reason || "CONNECTOR_HEALTH_FAILED");
    setStatus(result.started ? "Connector 已启动，可以绑定当前页面" : "Connector 已在运行，可以绑定当前页面", "ok");
    return connection;
  } catch (error) {
    setConnection(elements.connectorStatus, "启动失败", "error");
    setStatus(`Connector 启动失败：${error?.message || String(error)}`, "error");
    return null;
  } finally {
    setBusy(false);
  }
}

function connectorBindingFrom(tab, context) {
  const route = context?.route || {};
  let pageType = "tianyuan-page";
  if (route.isAssetDraftRoute) pageType = "asset-draft";
  if (route.isEquityListRoute) pageType = "equity-list";
  let safeUrl = "";
  try {
    const url = new URL(tab?.url || "");
    safeUrl = `${url.origin}${url.pathname}`;
  } catch {
  }
  return {
    projectId: route.projectId || "",
    companyId: route.companyId || "",
    subjectCode: route.subjectCode || "",
    subjectPath: "",
    pageType,
    url: safeUrl,
    tabId: Number.isInteger(tab?.id) ? tab.id : null,
    operationScope: "context-read",
  };
}

async function bindCurrentPage() {
  if (busy) return;
  setBusy(true);
  setStatus("正在绑定当前天源页面...", "idle");
  setConnectorBindingFeedback("正在启动 Connector 并绑定当前天源页面...", "idle");
  try {
    await ensureCurrentPageConnectorSession();
    setConnectorBindingFeedback("当前天源页面已绑定，请继续选择 Codex 项目和对话。", "ok");
    setStatus("当前天源页面已绑定，可以开始核对操作能力", "ok");
  } catch (error) {
    setConnectorBindingFeedback(`页面绑定失败：${error?.message || String(error)}`, "error");
    setStatus(`绑定失败：${error?.message || String(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

async function connectorHeartbeat() {
  if (!connectorSessionId || busy || document.visibilityState !== "visible") return;
  try {
    const tab = await getActiveTab();
    const sameBoundTab = Number.isInteger(tab?.id)
      && tab.id === connectorSession?.binding?.tabId
      && tab.url?.startsWith("https://excel.zhrdc.net/ty/");
    let heartbeatContext = latestContext;
    if (sameBoundTab) {
      try {
        const freshContext = await sendToTab(tab, { type: REQUEST_TYPE });
        if (freshContext?.ok) {
          heartbeatContext = freshContext;
          latestContext = freshContext;
        }
      } catch {
        // Keep the last context for this heartbeat; the next heartbeat retries.
      }
    }
    const heartbeatBody = sameBoundTab
      ? {
          binding: connectorBindingFrom(tab, heartbeatContext),
          context: heartbeatContext,
        }
      : {};
    const result = await connectorFetch(`/api/sessions/${encodeURIComponent(connectorSessionId)}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(heartbeatBody),
    });
    renderConnectorSession(result.session);
    setConnection(elements.connectorStatus, "已绑定", "ok");
  } catch (error) {
    if (error.status === 404) {
      connectorSessionId = "";
      connectorSession = null;
      await storageRemove(STORAGE_CONNECTOR_SESSION_KEY);
      renderConnectorSession(null);
      setConnection(elements.connectorStatus, "已启动", "ok");
    } else {
      setConnection(elements.connectorStatus, "连接中断", "warn");
    }
  }
}

async function connectorBoundTab() {
  const tabId = connectorSession?.binding?.tabId;
  if (!Number.isInteger(tabId)) throw new Error("绑定记录缺少天源标签页。");
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    throw new Error("已绑定的天源标签页已关闭，请重新绑定当前页面。");
  }
}

async function navigateConnectorActionTarget(tab, target = {}) {
  const subjectCode = String(target.subjectCode || "").trim();
  if (!subjectCode) return tab;
  const currentUrl = new URL(tab.url || "");
  if (
    currentUrl.pathname.includes("/asset-based-approach/draft")
    && currentUrl.searchParams.get("subjectCode") === subjectCode
  ) {
    return tab;
  }
  const projectId = String(target.projectId || connectorSession?.binding?.projectId || "");
  const companyId = String(target.companyId || connectorSession?.binding?.companyId || "");
  if (!projectId || !companyId) throw new Error("缺少目标项目或公司 ID，不能切换科目。");
  const url = new URL(`https://excel.zhrdc.net/ty/operation/${projectId}/${companyId}/asset-based-approach/draft`);
  url.searchParams.set("subjectCode", subjectCode);
  await chrome.tabs.update(tab.id, { active: true, url: url.toString() });
  await waitForTabComplete(tab.id);
  return await chrome.tabs.get(tab.id);
}

async function reportConnectorActionResult(actionId, result) {
  const binding = codexControlBinding() || {};
  return await connectorFetch(
    `/api/sessions/${encodeURIComponent(connectorSessionId)}/actions/${encodeURIComponent(actionId)}/result`,
    {
      method: "POST",
      body: JSON.stringify({
        bindingId: binding.bindingId || "",
        projectId: binding.projectId || "",
        threadId: binding.threadId || "",
        result,
      }),
    },
  );
}

async function processConnectorActionQueue() {
  if (
    connectorActionBusy
    || busy
    || document.visibilityState !== "visible"
    || !connectorSessionId
    || !codexControlBinding()?.bindingId
  ) return;

  connectorActionBusy = true;
  let claimedAction = null;
  try {
    const binding = codexControlBinding();
    const query = new URLSearchParams({
      bindingId: binding.bindingId,
      projectId: binding.projectId || "",
      threadId: binding.threadId || "",
    });
    const next = await connectorFetch(
      `/api/sessions/${encodeURIComponent(connectorSessionId)}/actions/next?${query.toString()}`,
    );
    claimedAction = next.action;
    if (!claimedAction) return;

    const actionLabels = {
      upload_audit_attachment: "附件上传任务",
      batch_upload_audit_attachments: "附件批量上传任务",
      preview_audit_attachment_upload: "附件上传预演",
      inspect_audit_check_row: "查证核对情况读取",
      set_audit_check_result: "查证核对情况填写",
      scan_audit_index_check_rows: "查证资料索引批量扫描",
      batch_set_audit_check_results: "查证核对情况批量填写",
    };
    setConnectorBindingFeedback(
      `Codex 已下达${actionLabels[claimedAction.type] || "天源页面任务"}，正在通过当前天源页面执行...`,
      "idle",
    );
    setStatus("正在执行 Codex 天源页面任务...", "idle");
    let tab = await connectorBoundTab();
    tab = await navigateConnectorActionTarget(tab, claimedAction.target || {});
    const context = await sendToTab(tab, { type: REQUEST_TYPE });
    if (!context?.ok || !context.route?.isAssetDraftRoute) {
      throw new Error(context?.reason || "目标资产基础法底稿页面未就绪。");
    }
    if (
      claimedAction.target?.subjectCode
      && context.route?.subjectCode !== claimedAction.target.subjectCode
    ) {
      throw new Error(`科目切换失败，当前为 ${context.route?.subjectCode || "未知科目"}。`);
    }
    const result = await runSaveActionForTab(tab, claimedAction.payload || {});
    await reportConnectorActionResult(claimedAction.actionId, result);
    setConnectorBindingFeedback(
      result?.ok
        ? `${actionLabels[claimedAction.type] || "天源页面任务"}完成，结果已回传 Codex`
        : `Codex 页面任务被阻断：${result?.reason || result?.message || "未知原因"}`,
      result?.ok ? "ok" : "warn",
    );
    setStatus(result?.ok ? "Codex 页面任务完成" : "Codex 页面任务被阻断", result?.ok ? "ok" : "warn");
    await checkConnectorConnection({ silent: true });
  } catch (error) {
    const result = {
      ok: false,
      reason: "CONNECTOR_ACTION_EXECUTION_ERROR",
      message: error?.message || String(error),
      collectedAt: new Date().toISOString(),
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };
    if (claimedAction?.actionId) {
      try {
        await reportConnectorActionResult(claimedAction.actionId, result);
      } catch {
        // The visible feedback remains useful if the Bridge disconnected.
      }
    }
    setConnectorBindingFeedback(`Codex 页面任务失败：${result.message}`, "error");
    setStatus(`Codex 页面任务失败：${result.message}`, "error");
  } finally {
    connectorActionBusy = false;
  }
}

async function checkConnections() {
  const connectorCheck = checkConnectorConnection({ silent: true });
  setConnection(elements.connectorStatus, "检查中", "idle");
  setConnection(elements.helperStatus, "检查中", "idle");
  setConnection(elements.mcpStatus, "检查中", "idle");
  setConnection(elements.cliStatus, "检查中", "idle");
  elements.connectionMessage.textContent = "正在连接 helper...";

  try {
    const health = await fetchHelperJson("/health?probe=1");
    setConnection(elements.helperStatus, health.transport === "native_messaging" ? "已启动" : "已连接", "ok");
    elements.connectionMessage.textContent = health.transport === "native_messaging"
      ? "Native Messaging 已拉起"
      : "HTTP helper 已连接";

    if (health.mcp?.connected) {
      setConnection(elements.mcpStatus, "已连接", "ok");
    } else if (health.mcp?.configured) {
      setConnection(elements.mcpStatus, health.mcp.reason || "连接失败", "error");
    } else {
      setConnection(elements.mcpStatus, runtimeMcpToken ? "token 无效" : "未配置 token", "warn");
    }

    if (health.cli?.ok) {
      setConnection(elements.cliStatus, health.cli.version || "可用", "ok");
    } else {
      setConnection(elements.cliStatus, health.cli?.reason || "不可用", "warn");
    }

    await connectorCheck;
    return health;
  } catch (error) {
    const message = error?.message || String(error);
    const payload = {
      ok: false,
      action: "check_connections",
      reason: message,
      extensionId: chrome.runtime.id,
      nativeHostName: NATIVE_HOST_NAME,
      collectedAt: new Date().toISOString(),
      hint: "如果提示 forbidden 或 not found，请移除旧扩展后重新加载固定 ID 版本，并确认 NativeMessagingHosts 注册文件存在。",
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    elements.connectionMessage.textContent = message;
    setConnection(elements.helperStatus, "启动失败", "error");
    setConnection(elements.mcpStatus, "等待启动", "warn");
    setConnection(elements.cliStatus, "等待启动", "warn");
    await connectorCheck;
    setStatus(`helper 启动失败：${message}`, "error");
    return payload;
  }
}

function openMcpTokenDialog() {
  elements.mcpTokenInput.value = runtimeMcpToken;
  elements.mcpTokenDialog.showModal();
  elements.mcpTokenInput.focus();
}

async function confirmMcpToken() {
  const token = elements.mcpTokenInput.value.trim();
  if (!token) {
    setStatus("请输入 MCP token", "warn");
    return;
  }

  runtimeMcpToken = token;
  elements.mcpTokenInput.value = "";
  elements.mcpTokenDialog.close();
  setStatus("正在用本次 token 连接 MCP...", "idle");
  await checkConnections();
}

async function clearMcpToken() {
  runtimeMcpToken = "";
  await clearLegacyMcpToken();
  elements.mcpTokenInput.value = "";
  elements.mcpTokenDialog.close();
  setConnection(elements.mcpStatus, "未配置 token", "warn");
  setStatus("已清除 MCP token", "warn");
}

function getCheckedValues(groupName) {
  const values = [...document.querySelectorAll(`input[data-group="${groupName}"]:checked`)]
    .map((input) => input.value)
    .filter(Boolean);
  return [...new Set(values)];
}

function render(payload, options = {}) {
  latestPayload = payload;
  if (payload?.ok && payload.route) latestContext = payload;
  updateHomePageState();
  elements.json.textContent = JSON.stringify(payload, null, 2);

  if (!payload?.ok) {
    setStatus(payload?.reason || "读取失败", "error");
    return;
  }

  const route = payload.route || {};
  const spread = payload.spread || {};
  const auditField = spread.auditField || {};
  const cellType = auditField.cellType || {};
  const page = payload.page || {};

  elements.projectId.textContent = valueOrDash(route.projectId);
  elements.companyId.textContent = valueOrDash(route.companyId);
  elements.subjectCode.textContent = valueOrDash(route.subjectCode);
  if (!options.preserveBatchSelections && !isModuleRoute()) {
    resetScopeFromContext(payload);
  }
  elements.isEquityList.textContent = valueOrDash(route.isEquityListRoute);
  elements.isDraft.textContent = valueOrDash(route.isAssetDraftRoute);

  elements.spreadFound.textContent = spread.found ? "已找到" : valueOrDash(spread.reason);
  elements.sheetName.textContent = valueOrDash(spread.sheetName);
  elements.activeCell.textContent = spread.activeCell
    ? `${spread.activeCell.address}，row=${spread.activeCell.row}，col=${spread.activeCell.col}`
    : "-";
  elements.auditField.textContent = auditField.found
    ? `${auditField.columnName} 列，目标 ${auditField.targetAddress}`
    : "未找到";
  elements.uploadCell.textContent = cellType.domId
    ? `${cellType.domId}，activateEditor=${valueOrDash(cellType.hasActivateEditor)}，只读=${valueOrDash(cellType.isReadOnly)}`
    : "-";

  elements.saveButton.textContent = page.saveButton?.visible
    ? `可见 ${page.saveButton.count} 个，全部禁用=${valueOrDash(page.saveButton.disabled)}`
    : "未找到";
  elements.loginState.textContent = page.loginLikely ? "疑似需要登录" : "未见登录拦截";
  elements.lockText.textContent = valueOrDash(page.lockText);
  elements.permissionText.textContent = valueOrDash(page.permissionText);

  if (route.isEquityListRoute) {
    setStatus("当前是公司列表页，请点某行“资产基础法”进入底稿", "warn");
  } else if (!route.isAssetDraftRoute) {
    setStatus("当前页不是资产基础法底稿页", "warn");
  } else if (!spread.found) {
    setStatus("已识别页面，SpreadJS 尚未就绪", "warn");
  } else {
    setStatus("只读上下文已读取，未执行写入", "ok");
  }
  if (isModuleRoute() && !options.preserveBatchSelections) {
    captureModuleState(currentRoute);
  }
  maybeAutoLoadExportCompanies();
}

async function refreshContext() {
  if (busy) return null;
  setStatus("正在读取当前页面...", "idle");
  const tab = await getActiveTab();

  if (!tab?.id || !tab.url?.startsWith("https://excel.zhrdc.net/ty/")) {
    render({
      ok: false,
      reason: "请切换到天源页面后刷新",
      tabUrl: tab?.url || null,
      collectedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    const response = await sendToTab(tab, { type: REQUEST_TYPE });
    render(response);
    return response;
  } catch (error) {
    const payload = {
      ok: false,
      reason: "CONTENT_SCRIPT_UNAVAILABLE",
      message: error?.message || String(error),
      hint: "请刷新当前天源页面后再点侧边栏刷新。",
      tabUrl: tab.url,
      collectedAt: new Date().toISOString(),
    };
    render(payload);
    return payload;
  }
}

function getSubjectCodes() {
  const codes = confirmedSubjectCodes || getCheckedValues("subjects");
  if (codes.length) return codes;
  const current = latestContext?.route?.subjectCode;
  return current ? [current] : [];
}

function buildDraftUrl(context, subjectCode) {
  const route = context?.route || {};
  if (!route.projectId || !route.companyId) return null;
  const url = new URL(`https://excel.zhrdc.net/ty/operation/${route.projectId}/${route.companyId}/asset-based-approach/draft`);
  if (subjectCode) url.searchParams.set("subjectCode", subjectCode);
  return url.toString();
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, 12000);

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      window.clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      window.setTimeout(resolve, 1800);
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function navigateToSubject(tab, context, subjectCode) {
  if (subjectCode.startsWith("treepath:")) {
    const path = decodeURIComponent(subjectCode.slice("treepath:".length));
    appendTaskLog(`按页面路径切换科目 ${path}`);
    const result = await runSaveActionForTab(tab, {
      action: "activate_subject_by_path",
      path,
    });
    if (!result.ok) throw new Error(`无法按页面路径切换科目：${path}`);
    return tab;
  }
  if (subjectCode.startsWith("tree:")) {
    const label = subjectCode.slice(5);
    appendTaskLog(`切换科目 ${label}`);
    const result = await runSaveActionForTab(tab, {
      action: "activate_subject_by_label",
      label,
    });
    if (!result.ok) throw new Error(`无法切换科目：${label}`);
    return tab;
  }

  const url = buildDraftUrl(context, subjectCode);
  if (!url) throw new Error("缺少项目 ID 或主体 ID，不能构造底稿地址。");

  const currentUrl = new URL(tab.url);
  const currentSubject = currentUrl.searchParams.get("subjectCode");
  if (currentUrl.pathname.includes("/asset-based-approach/draft") && currentSubject === subjectCode) {
    return tab;
  }

  appendTaskLog(`打开科目 ${subjectCode}`);
  await chrome.tabs.update(tab.id, { url });
  await waitForTabComplete(tab.id);
  const freshTab = await getActiveTab();
  return freshTab || tab;
}

async function readContextForTab(tab, options = {}) {
  const response = await sendToTab(tab, { type: REQUEST_TYPE });
  render(response, options);
  return response;
}

async function readEquityTableCompanies(projectId) {
  if (!projectId) return [];
  const url = `https://excel.zhrdc.net/ty/operation/${encodeURIComponent(projectId)}/equity/list`;
  const originTab = await getActiveTab();
  const tab = await chrome.tabs.create({ url, active: true });
  try {
    await waitForTabComplete(tab.id);
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    const result = await sendToTab(tab, {
      type: ACTION_REQUEST_TYPE,
      payload: { action: "list_equity_table_companies" },
    });
    if (!result?.ok) {
      appendTaskLog(`页面公司表读取失败：${result?.reason || "未知原因"}`);
      return [];
    }
    appendTaskLog(`页面公司表读取完成：${result.companies?.length || 0} 行`);
    return Array.isArray(result.companies) ? result.companies : [];
  } catch (error) {
    appendTaskLog(`页面公司表读取失败：${error?.message || String(error)}`);
    return [];
  } finally {
    chrome.tabs.remove(tab.id).catch?.(() => {});
    if (originTab?.id) {
      try {
        await chrome.tabs.update(originTab.id, { active: true });
      } catch {
        // Best effort: returning focus is helpful but not part of data integrity.
      }
    }
  }
}

async function readCurrentPageCompanySelectorCompanies(tab) {
  try {
    const result = await sendToTab(tab, {
      type: ACTION_REQUEST_TYPE,
      payload: { action: "list_asset_draft_companies" },
    });
    if (!result?.ok) {
      appendTaskLog(`当前页公司弹窗读取失败：${result?.reason || "未知原因"}`);
      return [];
    }
    const rows = (Array.isArray(result.companies) ? result.companies : [])
      .map((item) => ({
        code: item.code || "",
        name: item.label || item.name || "",
        shortName: item.label || item.shortName || "",
        parentName: "",
        raw: item.raw || item,
        source: "current-company-selector",
      }))
      .filter((item) => item.name || item.shortName);
    appendTaskLog(`当前页公司弹窗读取完成：${rows.length} 行，带编码 ${rows.filter((item) => item.code).length} 行`);
    return rows;
  } catch (error) {
    appendTaskLog(`当前页公司弹窗读取失败：${error?.message || String(error)}`);
    return [];
  }
}

async function runSaveActionForTab(tab, payload) {
  return await sendToTab(tab, {
    type: ACTION_REQUEST_TYPE,
    payload,
  });
}

async function loadCompanyList() {
  if (busy) return;
  if (elements.companyScopePanel) elements.companyScopePanel.open = true;
  setBusy(true);
  setStatus("正在通过 MCP 加载公司清单...", "idle");
  try {
    const health = await checkConnections();
    if (!health?.mcp?.connected) throw new Error("MCP 未连接，不能加载公司清单。");
    const context = await refreshContext() || latestContext;
    const projectId = context?.route?.projectId;
    if (!projectId) throw new Error("当前页面未读取到项目 ID，不能加载公司清单。");

    const result = await fetchHelperJson(`/projects/${encodeURIComponent(projectId)}/companies`);
    const exportOnly = ["export-detail", "export-declare"].includes(currentRoute);
    let pageCompanies = [];
    if (!exportOnly) {
      pageCompanies = normalizePageCompanyRows(await readEquityTableCompanies(projectId));
      if (!pageCompanies.some((company) => company.code)) {
        appendTaskLog("公司列表页未读到编码，改从当前底稿页公司弹窗读取");
        const currentTab = await getActiveTab();
        pageCompanies = normalizePageCompanyRows(await readCurrentPageCompanySelectorCompanies(currentTab));
      }
    } else {
      appendTaskLog("导出模块直接使用 MCP 公司 ID，不读取页面公司编码");
    }
    const mcpCompanies = normalizeMcpCompanies(normalizeErrorItems(result.companies), context);
    availableCompanies = enrichCompanyHierarchy(mergeCompanyDisplayRows(mcpCompanies, pageCompanies));
    const codedCount = availableCompanies.filter((company) => company.code).length;
    const pageCodedCount = pageCompanies.filter((company) => company.code).length;
    latestPayload = {
      ...result,
      action: "list_asset_draft_companies_from_helper",
      pageCompanyRows: pageCompanies,
      normalizedCompanies: availableCompanies,
      displaySummary: {
        mcpCompanies: mcpCompanies.length,
        pageCompanyRows: pageCompanies.length,
        pageCompanyRowsWithCode: pageCodedCount,
        companiesWithCode: codedCount,
      },
      collectedAt: new Date().toISOString(),
    };
    elements.json.textContent = JSON.stringify(latestPayload, null, 2);
    renderCompanyTree(elements.companyList, availableCompanies, context.route?.companyId || "");
    mcpCompanyListLoaded = true;
    setCompanySelectionConfirmed(false);
    if (elements.companySelectionActions) {
      elements.companySelectionActions.classList.toggle("hidden", !availableCompanies.length);
    }
    if (exportOnly) {
      setCompanySourceStatus(`公司 ID ${availableCompanies.length} 个`, availableCompanies.length ? "ok" : "warn");
    } else if (codedCount) {
      setCompanySourceStatus(`编码 ${codedCount}/${availableCompanies.length}`, "ok");
    } else if (pageCompanies.length && pageCodedCount) {
      setCompanySourceStatus(`页面带编码 ${pageCodedCount}/${pageCompanies.length}，未合并`, "warn");
    } else if (pageCompanies.length) {
      setCompanySourceStatus(`页面 ${pageCompanies.length} 行，带编码 0 行`, "warn");
    } else {
      setCompanySourceStatus("页面编码 0 行", "warn");
    }
    setStatus(
      exportOnly
        ? `已加载 ${availableCompanies.length} 个公司，请选择后确认`
        : `已加载 ${availableCompanies.length} 个公司；页面 ${pageCompanies.length} 行，带编码 ${pageCodedCount} 行；已合并编码 ${codedCount} 个`,
      exportOnly ? (availableCompanies.length ? "ok" : "warn") : (codedCount ? "ok" : "warn"),
    );
  } catch (error) {
    const payload = {
      ok: false,
      action: "list_asset_draft_companies_from_helper",
      message: error?.message || String(error),
      collectedAt: new Date().toISOString(),
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    setCompanySourceStatus("编码读取失败", "error");
    setStatus(payload.message, "error");
  } finally {
    setBusy(false);
  }
}

async function loadSubjectList() {
  if (busy) return;
  if (elements.subjectScopePanel) elements.subjectScopePanel.open = true;
  appendTaskLog("开始加载科目清单");
  setBusy(true);
  setStatus("正在通过 MCP 加载科目清单...", "idle");
  try {
    const health = await checkConnections();
    if (!health?.mcp?.connected) throw new Error("MCP 未连接，不能加载科目清单。");
    const context = await refreshContext() || latestContext;
    const projectId = context?.route?.projectId;
    const companyId = context?.route?.companyId;
    if (!projectId || !companyId) throw new Error("当前页面未读取到项目 ID 或主体 ID，不能加载科目清单。");
    const tab = await getActiveTab();
    const pageSubjectResult = await runSaveActionForTab(tab, { action: "list_asset_draft_subjects" });
    const subjectContext = pageSubjectResult?.ok
      ? { ...context, subjectTree: pageSubjectResult.subjects || context.subjectTree || [] }
      : context;
    if (pageSubjectResult?.ok) {
      appendTaskLog(`页面显示科目读取完成：${pageSubjectResult.subjects?.length || 0} 个，展开 ${pageSubjectResult.expandedClickCount || 0} 次`);
    } else {
      appendTaskLog(`页面显示科目读取失败：${pageSubjectResult?.reason || "未知原因"}，仅使用 MCP 显示字段`);
    }

    const result = await fetchHelperJson(`/projects/${encodeURIComponent(projectId)}/companies/${encodeURIComponent(companyId)}/asset-subjects`);
    const rawSubjectItems = normalizeErrorItems(result.subjects);
    const mcpSubjectsWithPagePaths = attachPageSubjectPaths(
      normalizeMcpSubjects(rawSubjectItems, subjectContext, { filterDisplayed: false }),
      subjectContext,
    );
    const pageTreeSubjects = normalizePageSubjectTreeSubjects(subjectContext);
    const allMcpSubjects = mergeSubjectCandidates(mcpSubjectsWithPagePaths, pageTreeSubjects);
    const displayedMcpSubjects = normalizeMcpSubjects(rawSubjectItems, subjectContext);
    const pageVisibleSubjects = filterSubjectsByVisibleContext(allMcpSubjects, subjectContext);
    const hasPageSubjectTree = Array.isArray(subjectContext.subjectTree) && subjectContext.subjectTree.length > 0;
    const usePageVisibleSubjects = isPageSubjectTreeUsable(pageVisibleSubjects, displayedMcpSubjects, subjectContext);
    const fallbackSubjects = mergeSubjectCandidates(displayedMcpSubjects, pageVisibleSubjects);
    const pageSubjectChoices = normalizePageSubjectChoices(subjectContext, allMcpSubjects);
    const normalizedSubjects = pageSubjectChoices.length
      ? pageSubjectChoices
      : enrichSubjectHierarchyNames(displayedMcpSubjects, allMcpSubjects);
    availableSubjects = normalizedSubjects;
    const displayedCount = normalizedSubjects.filter((item) => item.displayed).length;
    const hiddenCount = normalizedSubjects.length - displayedCount;
    const pageMirrorCodedCount = pageSubjectChoices.filter((item) => item.code).length;
    const pageMirrorPathOnlyCount = pageSubjectChoices.length - pageMirrorCodedCount;
    appendTaskLog(`已加载显示科目：${normalizedSubjects.length} 个，页面树优先=${usePageVisibleSubjects ? "是" : "否"}`);
    if (pageSubjectChoices.length) {
      appendTaskLog(`页面镜像编号：可靠匹配 ${pageMirrorCodedCount} 个，路径执行 ${pageMirrorPathOnlyCount} 个`);
    }
    latestPayload = {
      ...result,
      action: "list_asset_draft_subjects_from_helper",
      collectedAt: new Date().toISOString(),
      pageSubjectResult: pageSubjectResult?.ok ? {
        ok: true,
        expanded: Boolean(pageSubjectResult.expanded),
        expandedClickCount: pageSubjectResult.expandedClickCount || 0,
        beforeCount: pageSubjectResult.beforeCount || 0,
        subjectCount: pageSubjectResult.subjects?.length || 0,
      } : {
        ok: false,
        reason: pageSubjectResult?.reason || "PAGE_SUBJECT_READ_FAILED",
      },
      subjectContextSummary: {
        hasPageSubjectTree,
        usePageVisibleSubjects,
        allMcpCount: allMcpSubjects.length,
        pageTreeCodeCount: pageTreeSubjects.length,
        displayedMcpCount: displayedMcpSubjects.length,
        pageVisibleCount: pageVisibleSubjects.length,
        fallbackCount: fallbackSubjects.length,
        normalizedCount: normalizedSubjects.length,
        pageMirrorCount: pageSubjectChoices.length,
        pageMirrorCodedCount,
        pageMirrorPathOnlyCount,
        displayedCount,
        hiddenCount,
      },
    };
    elements.json.textContent = JSON.stringify(latestPayload, null, 2);
    if (pageSubjectChoices.length) {
      renderPageSubjectTree(elements.subjectList, availableSubjects);
    } else {
      renderSubjectTree(elements.subjectList, availableSubjects, subjectContext.route?.subjectCode || "");
    }
    mcpSubjectListLoaded = true;
    setSubjectSelectionConfirmed(false);
    if (elements.subjectSelectionActions) {
      elements.subjectSelectionActions.classList.toggle("hidden", !availableSubjects.length);
    }
    appendTaskLog(`科目清单加载完成：${availableSubjects.length} 个`);
    setStatus(
      availableSubjects.length
        ? `已加载 ${availableSubjects.length} 个显示状态科目，请选择后确认`
        : "未读取到显示状态科目",
      availableSubjects.length ? "ok" : "warn",
    );
  } catch (error) {
    const payload = {
      ok: false,
      action: "list_asset_draft_subjects_from_helper",
      message: error?.message || String(error),
      collectedAt: new Date().toISOString(),
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    appendTaskLog(`科目清单加载失败：${payload.message}`);
    setStatus(payload.message, "error");
  } finally {
    setBusy(false);
  }
}

function getBatchScopeConfig() {
  const selectedCompanies = confirmedCompanyValues || getCheckedValues("companies");
  const selectedCompanyItems = selectedCompanies
    .map((value) => availableCompanies.find((item) => item.value === value))
    .filter(Boolean);
  const companyFilters = selectedCompanyItems
    .flatMap((item) => [item.code, item.shortName, item.name, item.id, item.value])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const currentCompanyId = latestContext?.route?.companyId || "";
  const allCompanyValues = availableCompanies.map((item) => item.value);
  let companyScope = "current";
  if (mcpCompanyListLoaded && selectedCompanies.length) {
    companyScope = selectedCompanies.length === allCompanyValues.length ? "all" : "partial";
    if (selectedCompanies.length === 1 && selectedCompanies[0] === currentCompanyId) companyScope = "current";
  }
  const subjectCodes = getSubjectCodes();

  return {
    companyScope,
    companyFilters,
    selectedCompanies: selectedCompanyItems.map((item) => ({
      value: item.value,
      id: item.id,
      code: item.code,
      shortName: item.shortName,
      name: item.name,
      title: item.title,
    })),
    companyValues: selectedCompanies,
    subjectCodes,
  };
}

function getBatchSaveConfig() {
  const mode = elements.saveMode.value;
  const confirmed = elements.executeConfirm.checked;
  return {
    ...getBatchScopeConfig(),
    mode,
    confirmText: mode === "execute" && confirmed ? "确认保存" : "",
  };
}

function getBatchExitConfig() {
  const mode = elements.exitMode.value;
  const confirmed = elements.exitConfirm.checked;
  return {
    ...getBatchScopeConfig(),
    mode,
    confirmText: mode === "execute" && confirmed ? "确认退出编辑" : "",
  };
}

async function runBatchSave() {
  if (busy) return;
  clearTaskLog();
  setBusy(true);

  const startedAt = new Date().toISOString();
  const results = [];
  let tab = await getActiveTab();

  try {
    if (!tab?.id || !tab.url?.startsWith("https://excel.zhrdc.net/ty/")) {
      throw new Error("请先切换到天源资产基础法底稿页。");
    }

    let context = latestContext?.route?.isAssetDraftRoute ? latestContext : await readContextForTab(tab, { preserveBatchSelections: true });
    const baseContext = context;
    const config = getBatchSaveConfig();
    if (!context?.route?.isAssetDraftRoute) throw new Error("当前页不是资产基础法底稿页。");
    if (!config.subjectCodes.length) throw new Error("没有可保存的科目代码。");
    if (mcpSubjectListLoaded && availableSubjects.length && confirmedSubjectCodes === null) {
      throw new Error("请先确认科目选择。");
    }
    if (mcpCompanyListLoaded && availableCompanies.length && confirmedCompanyValues === null) {
      throw new Error("请先确认公司选择。");
    }
    if (config.companyScope === "partial" && !config.companyFilters.length) {
      throw new Error("请选择并确认公司。");
    }
    if (config.mode === "execute" && config.confirmText !== "确认保存") {
      throw new Error("正式执行前请勾选确认。");
    }

    setStatus(config.mode === "execute" ? "正在执行批量保存..." : "正在预演批量保存...", "idle");
    appendTaskLog(`任务开始：${config.subjectCodes.length} 个科目，范围=${config.companyScope}，模式=${config.mode}`);

    for (const subjectCode of config.subjectCodes) {
      try {
        tab = await navigateToSubject(tab, baseContext, subjectCode);
        context = await readContextForTab(tab, { preserveBatchSelections: true });
        if (!context?.ok || !context.route?.isAssetDraftRoute) {
          results.push({ subjectCode, ok: false, reason: "CONTEXT_NOT_READY", context });
          appendTaskLog(`${subjectCode}：页面上下文未就绪，继续下一个`);
          continue;
        }

        const result = await runSaveActionForTab(tab, {
          action: "save_asset_draft_current_subject",
          mode: config.mode,
          companyScope: config.companyScope,
          companyFilters: config.companyFilters,
          selectedCompanies: config.selectedCompanies,
          companyValues: config.companyValues,
          confirmText: config.confirmText,
        });
        results.push({ subjectCode, ...result });
        appendTaskLog(`${subjectCode}：${result.ok ? "完成" : "失败"}${result.saveSuccessTextFound ? "，页面出现保存成功" : ""}`);
      } catch (error) {
        const message = error?.message || String(error);
        results.push({ subjectCode, ok: false, reason: "SUBJECT_RUN_ERROR", message });
        appendTaskLog(`${subjectCode}：失败，${message}，继续下一个`);
      }
    }

    const payload = {
      ok: results.every((item) => item.ok),
      action: "batch_save_asset_draft",
      startedAt,
      finishedAt: new Date().toISOString(),
      config: {
        mode: config.mode,
        companyScope: config.companyScope,
        companyFilters: config.companyFilters,
        selectedCompanies: config.selectedCompanies,
        companyValues: config.companyValues,
        subjectCodes: config.subjectCodes,
      },
      results,
      taskLogEntries: lastBatchLogEntries,
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: config.mode === "execute" && results.some((item) => item.security?.writesPerformed),
      },
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    await storageSet({ [STORAGE_LAST_BATCH_RESULT_KEY]: payload });
    setStatus(payload.ok ? "批量保存任务完成" : "批量保存任务遇到阻断", payload.ok ? "ok" : "warn");
  } catch (error) {
    const payload = {
      ok: false,
      action: "batch_save_asset_draft",
      reason: "BATCH_SAVE_ERROR",
      message: error?.message || String(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    await storageSet({ [STORAGE_LAST_BATCH_RESULT_KEY]: payload });
    appendTaskLog(payload.message);
    setStatus(payload.message, "error");
  } finally {
    setBusy(false);
  }
}

async function runBatchExitEdit() {
  if (busy) return;
  clearTaskLog();
  setBusy(true);

  const startedAt = new Date().toISOString();
  const results = [];
  let tab = await getActiveTab();

  try {
    if (!tab?.id || !tab.url?.startsWith("https://excel.zhrdc.net/ty/")) {
      throw new Error("请先切换到天源资产基础法底稿页。");
    }

    let context = latestContext?.route?.isAssetDraftRoute ? latestContext : await readContextForTab(tab, { preserveBatchSelections: true });
    const baseContext = context;
    const config = getBatchExitConfig();
    if (!context?.route?.isAssetDraftRoute) throw new Error("当前页不是资产基础法底稿页。");
    if (!config.subjectCodes.length) throw new Error("没有可执行的科目代码。");
    if (mcpSubjectListLoaded && availableSubjects.length && confirmedSubjectCodes === null) {
      throw new Error("请先确认科目选择。");
    }
    if (mcpCompanyListLoaded && availableCompanies.length && confirmedCompanyValues === null) {
      throw new Error("请先确认公司选择。");
    }
    if (config.companyScope === "partial" && !config.companyFilters.length) {
      throw new Error("请选择并确认公司。");
    }
    if (config.mode === "execute" && config.confirmText !== "确认退出编辑") {
      throw new Error("正式执行前请勾选确认。");
    }

    setStatus(config.mode === "execute" ? "正在执行批量退出编辑..." : "正在预演退出编辑...", "idle");
    appendTaskLog(`退出编辑任务开始：${config.subjectCodes.length} 个科目，范围=${config.companyScope}，模式=${config.mode}`);

    for (const subjectCode of config.subjectCodes) {
      try {
        tab = await navigateToSubject(tab, baseContext, subjectCode);
        context = await readContextForTab(tab, { preserveBatchSelections: true });
        if (!context?.ok || !context.route?.isAssetDraftRoute) {
          results.push({ subjectCode, ok: false, reason: "CONTEXT_NOT_READY", context });
          appendTaskLog(`${subjectCode}：页面上下文未就绪，继续下一个`);
          continue;
        }

        const result = await runSaveActionForTab(tab, {
          action: "exit_edit_current_subject",
          mode: config.mode,
          companyScope: config.companyScope,
          companyFilters: config.companyFilters,
          selectedCompanies: config.selectedCompanies,
          companyValues: config.companyValues,
          confirmText: config.confirmText,
        });
        results.push({ subjectCode, ...result });
        appendTaskLog(`${subjectCode}：${result.ok ? "完成" : "失败"}${result.exitSuccessTextFound ? "，页面出现退出成功" : ""}`);
      } catch (error) {
        const message = error?.message || String(error);
        results.push({ subjectCode, ok: false, reason: "SUBJECT_RUN_ERROR", message });
        appendTaskLog(`${subjectCode}：失败，${message}，继续下一个`);
      }
    }

    const payload = {
      ok: results.every((item) => item.ok),
      action: "batch_exit_edit",
      startedAt,
      finishedAt: new Date().toISOString(),
      config: {
        mode: config.mode,
        companyScope: config.companyScope,
        companyFilters: config.companyFilters,
        selectedCompanies: config.selectedCompanies,
        companyValues: config.companyValues,
        subjectCodes: config.subjectCodes,
      },
      results,
      taskLogEntries: lastBatchLogEntries,
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: config.mode === "execute" && results.some((item) => item.security?.writesPerformed),
      },
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    await storageSet({ [STORAGE_LAST_BATCH_RESULT_KEY]: payload });
    setStatus(payload.ok ? "批量退出编辑任务完成" : "批量退出编辑遇到阻断", payload.ok ? "ok" : "warn");
  } catch (error) {
    const payload = {
      ok: false,
      action: "batch_exit_edit",
      reason: "BATCH_EXIT_ERROR",
      message: error?.message || String(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    latestPayload = payload;
    elements.json.textContent = JSON.stringify(payload, null, 2);
    await storageSet({ [STORAGE_LAST_BATCH_RESULT_KEY]: payload });
    appendTaskLog(payload.message);
    setStatus(payload.message, "error");
  } finally {
    setBusy(false);
  }
}

async function copyJson(event) {
  event?.stopPropagation?.();
  if (!latestPayload) return;
  await navigator.clipboard.writeText(JSON.stringify(latestPayload, null, 2));
  setStatus("证据 JSON 已复制", "ok");
}

async function refreshAll() {
  await checkConnections();
  return await refreshContext();
}

on(elements.goHome, "click", () => navigateToRoute("home"));
on(elements.openConnectionsTopConnector, "click", () => navigateToRoute("connections"));
on(elements.openConnectionsTop, "click", () => navigateToRoute("connections"));
on(elements.openConnectionsTopMcp, "click", () => navigateToRoute("connections"));
on(elements.openConnectionsTopCli, "click", () => navigateToRoute("connections"));
on(elements.openBatchSave, "click", () => navigateToRoute("batch-save"));
on(elements.openBatchExit, "click", () => navigateToRoute("batch-exit"));
on(elements.openExportDetail, "click", () => navigateToRoute("export-detail"));
on(elements.openExportDeclare, "click", () => navigateToRoute("export-declare"));
on(elements.openFormatDetail, "click", () => navigateToRoute("format-detail"));
on(elements.openFormatDeclaration, "click", () => navigateToRoute("format-declaration"));
on(elements.backFromConnections, "click", () => navigateToRoute("home"));
on(elements.backFromSave, "click", () => navigateToRoute("home"));
on(elements.backFromExit, "click", () => navigateToRoute("home"));
on(elements.backFromExportDetail, "click", () => navigateToRoute("home"));
on(elements.backFromExportDeclare, "click", () => navigateToRoute("home"));
on(elements.backFromFormatDetail, "click", () => navigateToRoute("home"));
on(elements.backFromFormatDeclaration, "click", () => navigateToRoute("home"));
window.addEventListener("hashchange", () => {
  renderRoute(window.location.hash.slice(1) || "home");
});
window.addEventListener("focus", () => {
  if (!busy) checkConnections();
});
window.setInterval(() => {
  if (!busy && document.visibilityState === "visible") checkConnections();
}, 30000);
window.setInterval(connectorHeartbeat, 20000);
window.setInterval(processConnectorActionQueue, 1500);

on(elements.refresh, "click", refreshAll);
on(elements.checkConnections, "click", checkConnections);
on(elements.startConnector, "click", startConnector);
on(elements.bindCurrentPage, "click", bindCurrentPage);
on(elements.refreshConnectorCatalog, "click", loadConnectorCatalog);
on(elements.refreshAgentSources, "click", loadAgentSources);
on(elements.addManualAgent, "click", addManualAgent);
on(elements.connectorProjectPickerButton, "click", () => openConnectorPicker("project"));
on(elements.connectorThreadPickerButton, "click", () => openConnectorPicker("thread"));
on(elements.connectorProjectFilter, "input", renderConnectorProjectPicker);
on(elements.connectorThreadFilter, "input", renderConnectorThreadPicker);
document.addEventListener("click", (event) => {
  if (
    !elements.connectorProjectPicker?.contains(event.target)
    && !elements.connectorThreadPicker?.contains(event.target)
  ) {
    closeConnectorPickers();
  }
});
on(elements.connectorProjectSelect, "change", () => {
  connectorBindingFormDirty = true;
  renderConnectorThreadOptions();
  renderConnectorProjectPicker();
});
on(elements.connectorBindingScope, "change", () => {
  connectorBindingFormDirty = true;
  elements.connectorThreadField.classList.toggle("hidden", elements.connectorBindingScope.value === "project");
});
on(elements.connectorThreadSelect, "change", () => {
  connectorBindingFormDirty = true;
  renderConnectorThreadPicker();
});
on(elements.saveConnectorBinding, "click", saveConnectorCodexBinding);
on(elements.bindConnectorCurrentThread, "click", bindConnectorCurrentThread);
on(elements.clearConnectorBinding, "click", clearConnectorCodexBinding);
on(elements.configureMcp, "click", openMcpTokenDialog);
on(elements.authorizeCli, "click", authorizeCli);
on(elements.confirmMcpToken, "click", confirmMcpToken);
on(elements.clearMcpToken, "click", clearMcpToken);
on(elements.cancelMcpToken, "click", () => elements.mcpTokenDialog.close());
on(elements.copyJson, "click", copyJson);
on(elements.runBatchSave, "click", runBatchSave);
on(elements.runBatchExit, "click", runBatchExitEdit);
on(elements.chooseDetailOutputPath, "click", () => chooseExportDirectory("asset_detail_table"));
on(elements.chooseDeclareOutputPath, "click", () => chooseExportDirectory("asset_declare_table"));
on(elements.runExportDetail, "click", () => runCliExport("asset_detail_table"));
on(elements.runExportDeclare, "click", () => runCliExport("asset_declare_table"));
on(elements.chooseDetailPrintFiles, "click", () => choosePrintInputs("detail", "files"));
on(elements.chooseDetailPrintFolder, "click", () => choosePrintInputs("detail", "directory"));
on(elements.chooseDeclarationPrintFiles, "click", () => choosePrintInputs("declaration", "files"));
on(elements.chooseDeclarationPrintFolder, "click", () => choosePrintInputs("declaration", "directory"));
on(elements.chooseDetailPrintOutputPath, "click", () => choosePrintOutputDirectory("detail"));
on(elements.chooseDeclarationPrintOutputPath, "click", () => choosePrintOutputDirectory("declaration"));
on(elements.runDetailPrintFormat, "click", () => runPrintFormat("detail"));
on(elements.runDeclarationPrintFormat, "click", () => runPrintFormat("declaration"));
on(elements.detailPrintOutputMode, "change", () => updatePrintOutputMode("detail"));
on(elements.declarationPrintOutputMode, "change", () => updatePrintOutputMode("declaration"));
on(elements.loadSubjects, "click", loadSubjectList);
on(elements.loadCompanies, "click", loadCompanyList);
on(elements.selectAllSubjects, "click", () => {
  getSubjectCheckboxes().forEach((box) => {
    box.checked = true;
  });
  setSubjectSelectionConfirmed(false);
});
on(elements.clearAllSubjects, "click", () => {
  getSubjectCheckboxes().forEach((box) => {
    box.checked = false;
  });
  setSubjectSelectionConfirmed(false);
});
on(elements.confirmSubjects, "click", () => setSubjectSelectionConfirmed(true));
on(elements.subjectList, "change", (event) => {
  if (event.target?.dataset?.group === "subjects") setSubjectSelectionConfirmed(false);
});
on(elements.selectAllCompanies, "click", () => {
  getCompanyCheckboxes().forEach((box) => {
    box.checked = true;
  });
  setCompanySelectionConfirmed(false);
});
on(elements.clearAllCompanies, "click", () => {
  getCompanyCheckboxes().forEach((box) => {
    box.checked = false;
  });
  setCompanySelectionConfirmed(false);
});
on(elements.confirmCompanies, "click", () => setCompanySelectionConfirmed(true));
on(elements.companyList, "change", (event) => {
  if (event.target?.dataset?.group === "companies") setCompanySelectionConfirmed(false);
});
on(elements.saveMode, "change", () => {
  elements.executeConfirmWrap.classList.toggle("hidden", elements.saveMode.value !== "execute");
});

on(elements.exitMode, "change", () => {
  elements.exitConfirmWrap.classList.toggle("hidden", elements.exitMode.value !== "execute");
});

renderRoute(window.location.hash.slice(1) || "home");
clearLegacyMcpToken().finally(refreshAll);
