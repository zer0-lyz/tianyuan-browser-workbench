import { fileArchiveTemplate } from "./template.js";

function elementMap(documentRef) {
  const ids = [
    "openFileArchive", "backFromFileArchive", "fileArchiveSourceWechat", "fileArchiveSourceWecom",
    "fileArchiveAppStatus", "fileArchiveWechatStatus", "fileArchiveWecomStatus", "fileArchiveLimitation",
    "fileArchiveLoadConversations", "fileArchiveConversationSearch", "fileArchiveSelectAllConversations",
    "fileArchiveClearConversations", "fileArchiveBindConversations", "fileArchiveConversationList",
    "fileArchiveConversationCount", "fileArchiveConversationMessage", "fileArchiveInspectCurrentConversation",
    "fileArchiveCurrentConversation",
    "fileArchiveOutputPath", "chooseFileArchiveOutput", "fileArchiveDirectoryMode", "fileArchiveDuplicateMode",
    "fileArchiveStableSeconds", "startFileArchive", "pauseFileArchive", "scanFileArchive", "stopFileArchive", "refreshFileArchive",
    "fileArchiveCurrentStatus", "fileArchiveRunBadge", "fileArchiveWatchRoots", "fileArchiveWaiting",
    "fileArchiveCompleted", "fileArchiveSkipped", "fileArchiveFailed", "fileArchiveUnknown", "fileArchiveLastSuccess",
    "fileArchiveLastError", "fileArchiveMessage", "fileArchiveRecentCount", "fileArchiveRecentList",
  ];
  return Object.fromEntries(ids.map((id) => [id, documentRef.getElementById(id)]));
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

function sourceLabel(sourceApp) {
  return sourceApp === "wecom" ? "企业微信" : "微信";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export const fileArchiveModule = {
  manifest: {
    id: "file-archive",
    type: "feature",
    stage: "stable",
    route: "file-archive",
    displayName: "微信文件归档",
    messageNamespace: "file-archive",
    entryElementId: "openFileArchive",
    pageElementId: "page-file-archive",
    storageVersion: 1,
    usesLegacyScope: false,
    scope: { companies: false, subjects: false },
  },

  create() {
    let context;
    let elements;
    let detection = null;
    let config = {
      sourceApp: "wechat",
      outputDirectory: "",
      directoryMode: "by_app_date",
      duplicateMode: "rename",
      stableSeconds: 3,
    };
    let statusTimer = null;
    let conversationResult = null;
    let conversationBindings = new Map();
    let selectedConversationIds = new Set();

    function setMessage(text, kind = "") {
      elements.fileArchiveMessage.textContent = text;
      elements.fileArchiveMessage.dataset.kind = kind;
    }

    function selectedSource() {
      return elements.fileArchiveSourceWecom.checked ? "wecom" : "wechat";
    }

    function readConfig() {
      return {
        ...config,
        sourceApp: selectedSource(),
        outputDirectory: elements.fileArchiveOutputPath.value.trim(),
        directoryMode: elements.fileArchiveDirectoryMode.value,
        duplicateMode: elements.fileArchiveDuplicateMode.value,
        stableSeconds: Number(elements.fileArchiveStableSeconds.value || 3),
      };
    }

    function renderDetection() {
      const applications = detection?.applications || {};
      const renderApp = (key, element, statusElement) => {
        const app = applications[key];
        if (!app) return;
        statusElement.textContent = app.installed
          ? (app.fileRootCount ? `可用，发现 ${app.fileRootCount} 个下载目录` : "已检测到应用，未发现下载目录")
          : "未检测到应用或目录";
        statusElement.dataset.kind = app.fileRootCount ? "ok" : app.installed ? "warn" : "";
        element.disabled = !app.fileRootCount;
      };
      renderApp("wechat", elements.fileArchiveSourceWechat, elements.fileArchiveWechatStatus);
      renderApp("wecom", elements.fileArchiveSourceWecom, elements.fileArchiveWecomStatus);
      const selected = applications[selectedSource()];
      elements.fileArchiveAppStatus.textContent = selected?.fileRootCount ? "可用" : "待配置";
      elements.fileArchiveAppStatus.dataset.kind = selected?.fileRootCount ? "ok" : "warn";
      elements.fileArchiveLimitation.textContent = detection?.limitation || "尚未检测本机应用";
    }

    function pathTail(value) {
      const text = String(value || "");
      return text.split(/[\\/]/).filter(Boolean).pop() || text;
    }

    function visibleConversations() {
      const query = elements.fileArchiveConversationSearch.value.trim().toLocaleLowerCase();
      const conversations = Array.isArray(conversationResult?.conversations) ? conversationResult.conversations : [];
      return query
        ? conversations.filter((item) => `${item.name} ${item.type}`.toLocaleLowerCase().includes(query))
        : conversations;
    }

    function renderConversations() {
      const conversations = visibleConversations();
      const total = Array.isArray(conversationResult?.conversations) ? conversationResult.conversations.length : 0;
      elements.fileArchiveConversationCount.textContent = `${selectedConversationIds.size}/${total}`;
      if (!total) {
        elements.fileArchiveConversationList.innerHTML = `<div class="empty-list">${escapeHtml(conversationResult?.message || "点击“加载会话”读取本机清单")}</div>`;
        return;
      }
      elements.fileArchiveConversationList.innerHTML = conversations.map((item) => {
        const binding = conversationBindings.get(item.id);
        const checked = selectedConversationIds.has(item.id) ? " checked" : "";
        const typeLabel = item.type === "group" ? "群聊" : "联系人";
        return `<label class="file-archive-conversation-item">
          <input type="checkbox" data-conversation-id="${escapeHtml(item.id)}"${checked}>
          <span class="file-archive-conversation-main">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${typeLabel}${binding ? ` · 已绑定：${escapeHtml(pathTail(binding.outputDirectory))}` : " · 未绑定"}</small>
          </span>
        </label>`;
      }).join("");
      elements.fileArchiveConversationList.querySelectorAll("input[data-conversation-id]").forEach((input) => {
        context.scope.on(input, "change", () => {
          const id = input.dataset.conversationId;
          if (input.checked) selectedConversationIds.add(id);
          else selectedConversationIds.delete(id);
          renderConversations();
        });
      });
    }

    async function loadConversations() {
      const appType = selectedSource();
      elements.fileArchiveLoadConversations.disabled = true;
      elements.fileArchiveConversationMessage.textContent = "正在读取会话元数据...";
      try {
        conversationResult = await context.sendNativeMessage({ action: "list_file_archive_conversations", appType }, 15000);
        const bindings = await context.sendNativeMessage({ action: "get_file_archive_conversation_bindings", appType }, 10000);
        conversationBindings = new Map((bindings?.bindings || []).map((item) => [item.conversationId, item]));
        selectedConversationIds = new Set(conversationBindings.keys());
        elements.fileArchiveConversationMessage.textContent = conversationResult?.message || "会话清单已刷新";
        elements.fileArchiveConversationMessage.dataset.kind = conversationResult?.available ? "ok" : "warn";
        renderConversations();
      } catch (error) {
        conversationResult = { conversations: [], message: `读取会话清单失败：${error?.message || String(error)}` };
        elements.fileArchiveConversationMessage.textContent = conversationResult.message;
        elements.fileArchiveConversationMessage.dataset.kind = "error";
        renderConversations();
      } finally {
        elements.fileArchiveLoadConversations.disabled = false;
      }
    }

    async function bindSelectedConversations() {
      if (!selectedConversationIds.size) {
        elements.fileArchiveConversationMessage.textContent = "请先选择至少一个联系人或群聊";
        elements.fileArchiveConversationMessage.dataset.kind = "warn";
        return;
      }
      const result = await context.sendNativeMessage({
        action: "select_file_archive_conversation_directory",
        appType: selectedSource(),
        conversationIds: [...selectedConversationIds],
      }, 130000);
      if (!result?.ok) {
        elements.fileArchiveConversationMessage.textContent = result?.reason || "会话目录绑定失败";
        elements.fileArchiveConversationMessage.dataset.kind = result?.cancelled ? "warn" : "error";
        return;
      }
      elements.fileArchiveConversationMessage.textContent = `已为 ${result.bindings?.length || 0} 个会话绑定导出目录`;
      elements.fileArchiveConversationMessage.dataset.kind = "ok";
      await loadConversations();
    }

    async function inspectCurrentConversation() {
      elements.fileArchiveInspectCurrentConversation.disabled = true;
      elements.fileArchiveCurrentConversation.textContent = "当前会话：正在读取辅助功能界面...";
      try {
        const result = await context.sendNativeMessage({ action: "inspect_file_archive_active_conversation" }, 12000);
        if (!result?.ok || !result.available) {
          elements.fileArchiveCurrentConversation.textContent = `当前会话：${result?.message || result?.reason || "未读取到前台会话"}`;
          elements.fileArchiveCurrentConversation.dataset.kind = "warn";
          return;
        }
        const appName = sourceLabel(result.appType);
        elements.fileArchiveCurrentConversation.textContent = `${appName}当前可见会话：${result.conversationName}（置信度低，需人工确认后绑定）`;
        elements.fileArchiveCurrentConversation.dataset.kind = "warn";
      } catch (error) {
        elements.fileArchiveCurrentConversation.textContent = `当前会话读取失败：${error?.message || String(error)}`;
        elements.fileArchiveCurrentConversation.dataset.kind = "error";
      } finally {
        elements.fileArchiveInspectCurrentConversation.disabled = false;
      }
    }

    function renderStatus(status = {}) {
      const counts = status.counts || {};
      const running = status.state === "running" || status.state === "starting";
      const paused = status.state === "paused";
      elements.fileArchiveCurrentStatus.textContent = running
        ? `正在监听 ${sourceLabel(status.sourceApp || config.sourceApp)} 下载目录`
        : status.state === "failed" ? `启动失败：${status.lastError || "未知错误"}` : "尚未启动监听";
      elements.fileArchiveRunBadge.textContent = running ? "监听中" : paused ? "已暂停" : status.state === "failed" ? "失败" : "已停止";
      elements.fileArchiveRunBadge.dataset.kind = running || paused ? "ok" : status.state === "failed" ? "error" : "";
      elements.pauseFileArchive.textContent = paused ? "继续" : "暂停";
      elements.pauseFileArchive.disabled = !(running || paused);
      elements.fileArchiveWatchRoots.textContent = Array.isArray(status.sourceRoots) && status.sourceRoots.length
        ? status.sourceRoots.join("、")
        : "-";
      elements.fileArchiveWaiting.textContent = String(counts.waiting || 0);
      elements.fileArchiveCompleted.textContent = String(counts.completed || 0);
      elements.fileArchiveSkipped.textContent = String(counts.skipped || 0);
      elements.fileArchiveFailed.textContent = String(counts.failed || 0);
      elements.fileArchiveUnknown.textContent = String(counts.unknownSource || 0);
      elements.fileArchiveLastSuccess.textContent = formatTime(status.lastSuccessAt);
      elements.fileArchiveLastError.textContent = status.lastError || "-";
      const recent = Array.isArray(status.recentFiles) ? status.recentFiles : [];
      elements.fileArchiveRecentCount.textContent = `${recent.length} 条`;
      elements.fileArchiveRecentList.innerHTML = recent.length ? recent.map((item) => `
        <div class="file-archive-recent-item">
          <strong>${escapeHtml(item.fileName || "未命名文件")}</strong>
          <span class="inline-status">${escapeHtml(item.status || "-")}</span>
          <small>${escapeHtml(item.message || "")}</small>
        </div>`).join("") : '<div class="empty-list">暂无处理记录</div>';
    }

    async function refreshStatus() {
      try {
        renderStatus(await context.sendNativeMessage({ action: "get_file_archive_status" }, 5000));
      } catch (error) {
        setMessage(`读取归档状态失败：${error?.message || String(error)}`, "error");
      }
    }

    async function detect() {
      try {
        detection = await context.sendNativeMessage({ action: "detect_file_archive_apps" }, 10000);
        renderDetection();
      } catch (error) {
        setMessage(`应用检测失败：${error?.message || String(error)}`, "error");
      }
    }

    async function chooseOutput() {
      const result = await context.sendNativeMessage({ action: "select_file_archive_output_directory" }, 130000);
      if (!result?.ok || !result.path) {
        if (!result?.cancelled) setMessage(result?.reason || "未选择导出目录", "warn");
        return;
      }
      config.outputDirectory = result.path;
      elements.fileArchiveOutputPath.value = result.path;
      setMessage("导出目录已选择，请检查规则后开始监听", "ok");
      await context.storage.save(config);
    }

    async function start() {
      config = readConfig();
      const selected = detection?.applications?.[config.sourceApp];
      if (!selected?.fileRootCount) {
        setMessage("当前来源应用没有可监听的下载目录，请先刷新检测", "error");
        return;
      }
      if (!config.outputDirectory) {
        setMessage("请先选择导出目录", "warn");
        return;
      }
      const result = await context.sendNativeMessage({ action: "start_file_archive", config }, 15000);
      if (!result?.ok) {
        setMessage(result?.reason || "监听启动失败", "error");
        return;
      }
      await context.storage.save(config);
      setMessage("监听已启动；来源未知文件会进入待确认目录", "ok");
      await refreshStatus();
    }

    async function stop() {
      const result = await context.sendNativeMessage({ action: "stop_file_archive" }, 10000);
      setMessage(result?.ok ? "监听停止请求已发送" : result?.reason || "停止监听失败", result?.ok ? "ok" : "error");
      await refreshStatus();
    }

    async function togglePause() {
      const status = await context.sendNativeMessage({ action: "get_file_archive_status" }, 5000);
      const paused = status?.state === "paused";
      const result = await context.sendNativeMessage({ action: "pause_file_archive", paused: !paused }, 5000);
      setMessage(result?.ok ? (paused ? "监听已恢复" : "监听已暂停") : result?.reason || "暂停操作失败", result?.ok ? "ok" : "error");
      await refreshStatus();
    }

    async function scan() {
      setMessage("正在刷新本机来源检测...", "idle");
      const result = await context.sendNativeMessage({ action: "scan_file_archive" }, 5000);
      if (!result?.ok && result?.reason !== "FILE_ARCHIVE_NOT_RUNNING") {
        setMessage(result?.reason || "立即扫描失败", "error");
        return;
      }
      await detect();
      await refreshStatus();
      setMessage("扫描状态已刷新；下载中的文件会等待稳定后处理", "ok");
    }

    return {
      async initialize(nextContext) {
        context = nextContext;
        const pageRoot = context.document.getElementById(context.manifest.pageElementId);
        if (!pageRoot) {
          console.warn("File archive page is missing; reload the unpacked extension from the current runtime path.");
          return;
        }
        pageRoot.dataset.moduleId = context.manifest.id;
        pageRoot.innerHTML = fileArchiveTemplate;
        const stylesheet = context.document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = context.chrome.runtime.getURL("src/modules/file-archive/styles.css");
        context.document.head.appendChild(stylesheet);
        context.scope.add(() => stylesheet.remove());
        elements = elementMap(context.document);
        config = { ...config, ...(await context.storage.load({})) };
        elements.fileArchiveSourceWechat.checked = config.sourceApp !== "wecom";
        elements.fileArchiveSourceWecom.checked = config.sourceApp === "wecom";
        elements.fileArchiveOutputPath.value = config.outputDirectory || "";
        elements.fileArchiveDirectoryMode.value = config.directoryMode || "by_app_date";
        elements.fileArchiveDuplicateMode.value = config.duplicateMode || "rename";
        elements.fileArchiveStableSeconds.value = String(config.stableSeconds || 3);
        context.scope.on(elements.openFileArchive, "click", () => context.navigate("file-archive"));
        context.scope.on(elements.backFromFileArchive, "click", () => context.navigate("home"));
        context.scope.on(elements.chooseFileArchiveOutput, "click", chooseOutput);
        context.scope.on(elements.fileArchiveLoadConversations, "click", loadConversations);
        context.scope.on(elements.fileArchiveInspectCurrentConversation, "click", inspectCurrentConversation);
        context.scope.on(elements.fileArchiveConversationSearch, "input", renderConversations);
        context.scope.on(elements.fileArchiveSelectAllConversations, "click", () => {
          visibleConversations().forEach((item) => selectedConversationIds.add(item.id));
          renderConversations();
        });
        context.scope.on(elements.fileArchiveClearConversations, "click", () => {
          selectedConversationIds.clear();
          renderConversations();
        });
        context.scope.on(elements.fileArchiveBindConversations, "click", bindSelectedConversations);
        context.scope.on(elements.startFileArchive, "click", start);
        context.scope.on(elements.pauseFileArchive, "click", togglePause);
        context.scope.on(elements.stopFileArchive, "click", stop);
        context.scope.on(elements.scanFileArchive, "click", scan);
        context.scope.on(elements.refreshFileArchive, "click", refreshStatus);
        context.scope.on(elements.fileArchiveSourceWechat, "change", () => { renderDetection(); void loadConversations(); });
        context.scope.on(elements.fileArchiveSourceWecom, "change", () => { renderDetection(); void loadConversations(); });
        context.scope.interval(() => { if (document.visibilityState === "visible") void refreshStatus(); }, 2000);
        // Render the workbench first; Native Messaging availability must not blank the whole side panel.
        void detect();
        void loadConversations();
        void refreshStatus();
      },
      activate() {
        renderDetection();
        renderConversations();
        void refreshStatus();
      },
      deactivate() {},
      dispose() { if (statusTimer) window.clearInterval(statusTimer); },
    };
  },
};
