const LEGACY_STORAGE_KEY = "tianyuanWorkbenchUpdateResult";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const AUTO_CHECK_TIMER_MS = 30 * 60 * 1000;

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("zh-CN", { hour12: false });
}

function safeGithubUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname === "github.com" ? url.href : "";
  } catch {
    return "";
  }
}

function cacheMatchesRuntime(result, config, contract) {
  if (!result) return true;
  const currentVersion = config.productVersion
    || config.versionName
    || config.chromeVersion
    || "";
  return String(result.currentVersion || "") === String(currentVersion)
    && Number(result.currentBuildNumber || 0) === Number(config.buildNumber || 0)
    && String(result.currentRuntimeBuildId || "") === String(contract?.runtimeBuildId || "");
}

function elementMap(documentRef) {
  const ids = [
    "openUpdatesTop",
    "updateTopStatus",
    "openUpdates",
    "backFromUpdates",
    "updateHeadline",
    "updateDescription",
    "updateBadge",
    "updateCurrentVersion",
    "updateLatestVersion",
    "updateChannel",
    "updateBuildNumber",
    "updatePlatform",
    "updateCheckedAt",
    "updateFeedback",
    "checkForUpdates",
    "downloadUpdate",
    "openReleasePage",
    "updateNotes",
    "updateAssetName",
    "updateAssetSize",
    "updateAssetSha",
  ];
  return Object.fromEntries(ids.map((id) => [id, documentRef.getElementById(id)]));
}

export const updatesModule = {
  manifest: {
    id: "updates",
    type: "feature",
    stage: "stable",
    route: "updates",
    displayName: "版本更新",
    messageNamespace: "updates",
    entryElementId: "openUpdates",
    pageElementId: "page-updates",
    controlElementIds: ["openUpdatesTop"],
    storageVersion: 1,
    usesLegacyScope: false,
    scope: { companies: false, subjects: false },
  },

  create() {
    let context;
    let elements;
    let checking = false;
    let latestResult = null;
    let versionConfig = null;
    let runtimeContract = null;

    function setTopStatus(text, kind = "idle") {
      context.setConnection(elements.updateTopStatus, text, kind);
    }

    async function loadVersionContext() {
      if (!versionConfig) {
        versionConfig = await fetch(context.chrome.runtime.getURL("version.json"), {
          cache: "no-store",
        })
          .then((response) => response.ok ? response.json() : null)
          .catch(() => null) || {
          productVersion: context.extensionManifest.version_name
            || context.extensionManifest.version,
          chromeVersion: context.extensionManifest.version,
          channel: "stable",
          buildNumber: 0,
          bridgeProtocol: context.connectorProtocolVersion,
        };
      }
      if (!runtimeContract) {
        runtimeContract = await fetch(
          context.chrome.runtime.getURL("runtime-compat.json"),
          { cache: "no-store" },
        )
          .then((response) => response.ok ? response.json() : null)
          .catch(() => null);
      }
      return { config: versionConfig, contract: runtimeContract };
    }

    function renderNotes(notes) {
      elements.updateNotes.innerHTML = "";
      const values = Array.isArray(notes) && notes.length
        ? notes
        : ["暂无更新说明"];
      for (const value of values) {
        const item = context.document.createElement("li");
        item.textContent = String(value);
        elements.updateNotes.appendChild(item);
      }
    }

    function render(result = latestResult) {
      const config = versionConfig || {};
      const currentVersion = config.productVersion
        || context.extensionManifest.version_name
        || context.extensionManifest.version;
      const buildNumber = Number(config.buildNumber || 0);
      elements.updateCurrentVersion.textContent = `v${currentVersion}`;
      elements.updateBuildNumber.textContent = buildNumber ? String(buildNumber) : "-";
      elements.updateChannel.textContent = String(result?.channel || config.channel || "stable");
      elements.updateLatestVersion.textContent = result?.latestVersion
        ? `v${result.latestVersion}`
        : "-";
      elements.updatePlatform.textContent = result?.platform || "-";
      elements.updateCheckedAt.textContent = formatTime(result?.checkedAt);
      elements.updateAssetName.textContent = result?.asset?.name || "-";
      elements.updateAssetSize.textContent = formatBytes(result?.asset?.size);
      elements.updateAssetSha.textContent = result?.asset?.sha256 || (
        result?.checksumAsset?.url ? "请使用同名 .sha256 文件校验" : "-"
      );
      renderNotes(result?.notes);

      const assetUrl = safeGithubUrl(result?.asset?.url);
      const releaseUrl = safeGithubUrl(result?.releaseUrl);
      elements.downloadUpdate.disabled = !assetUrl;
      elements.downloadUpdate.dataset.url = assetUrl;
      elements.openReleasePage.disabled = !releaseUrl;
      elements.openReleasePage.dataset.url = releaseUrl;

      if (!result) {
        elements.updateHeadline.textContent = `天源浏览器工作台 v${currentVersion}`;
        elements.updateDescription.textContent = "更新检查不使用 MCP token，也不会修改当前安装。";
        elements.updateBadge.textContent = "未检查";
        elements.updateFeedback.textContent = "尚未检查 GitHub Release";
        elements.updateFeedback.dataset.kind = "";
        setTopStatus(`v${currentVersion}`, "idle");
        return;
      }
      if (!result.ok) {
        elements.updateHeadline.textContent = "暂时无法检查更新";
        elements.updateDescription.textContent = "当前版本可以继续使用，稍后可重新检查。";
        elements.updateBadge.textContent = "检查失败";
        elements.updateFeedback.textContent = result.reason || "GitHub 更新检查失败";
        elements.updateFeedback.dataset.kind = "error";
        setTopStatus("检查失败", "warn");
        return;
      }
      if (!result.releasePublished) {
        elements.updateHeadline.textContent = `当前版本 v${currentVersion}`;
        elements.updateDescription.textContent = "GitHub 尚未发布正式 Release，当前安装保持不变。";
        elements.updateBadge.textContent = "尚未发布";
        elements.updateFeedback.textContent = "仓库目前没有可供更新的正式 GitHub Release";
        elements.updateFeedback.dataset.kind = "";
        setTopStatus(`v${currentVersion}`, "ok");
        return;
      }
      if (result.repairRequired) {
        elements.updateHeadline.textContent = "检测到组件版本不一致";
        elements.updateDescription.textContent = "产品版本相同，但运行指纹不同，需要重新下载安装当前版本。";
        elements.updateBadge.textContent = "需要修复";
        elements.updateFeedback.textContent = assetUrl
          ? "请下载并重新安装当前正式版本"
          : "请打开发布页重新下载安装";
        elements.updateFeedback.dataset.kind = "error";
        setTopStatus("需修复", "error");
        return;
      }
      if (result.updateAvailable) {
        elements.updateHeadline.textContent = `发现新版本 v${result.latestVersion}`;
        elements.updateDescription.textContent = result.mandatory
          ? "当前版本低于最低支持版本，需要更新后再继续正式操作。"
          : "可下载安装包更新；当前版本不会被静默覆盖。";
        elements.updateBadge.textContent = result.mandatory ? "必须更新" : "有新版本";
        elements.updateFeedback.textContent = assetUrl
          ? `已找到适用于 ${result.platform} 的安装包`
          : "未找到当前平台安装包，请查看 GitHub 发布页";
        elements.updateFeedback.dataset.kind = result.mandatory ? "error" : "ok";
        setTopStatus(
          result.mandatory ? "必须更新" : "有更新",
          result.mandatory ? "error" : "warn",
        );
        return;
      }
      elements.updateHeadline.textContent = "已是最新版本";
      elements.updateDescription.textContent = `当前版本 v${currentVersion} 与 GitHub 最新正式版本一致。`;
      elements.updateBadge.textContent = "最新";
      elements.updateFeedback.textContent = "无需更新";
      elements.updateFeedback.dataset.kind = "ok";
      setTopStatus(`v${currentVersion}`, "ok");
    }

    async function check({ automatic = false } = {}) {
      if (checking) return latestResult;
      checking = true;
      elements.checkForUpdates.disabled = true;
      elements.downloadUpdate.disabled = true;
      setTopStatus("检查中", "idle");
      elements.updateBadge.textContent = "检查中";
      elements.updateFeedback.textContent = "正在连接 GitHub Releases...";
      elements.updateFeedback.dataset.kind = "";
      try {
        const { config, contract } = await loadVersionContext();
        const result = await context.sendNativeMessage({
          action: "check_github_update",
          currentVersion: config.productVersion
            || context.extensionManifest.version_name
            || context.extensionManifest.version,
          currentBuildNumber: Number(config.buildNumber || 0),
          currentRuntimeBuildId: String(contract?.runtimeBuildId || ""),
        }, 20000);
        if (!result?.ok) throw new Error(result?.reason || "GITHUB_UPDATE_CHECK_FAILED");
        latestResult = result;
        await context.storage.save(result);
        render(result);
        if (!automatic) {
          context.setStatus(
            result.updateAvailable ? "发现 GitHub 新版本" : "版本检查完成",
            result.mandatory
              ? "error"
              : (result.updateAvailable ? "warn" : "ok"),
          );
        }
        return result;
      } catch (error) {
        latestResult = {
          ok: false,
          action: "check_github_update",
          reason: error?.message || String(error),
          checkedAt: new Date().toISOString(),
        };
        render(latestResult);
        if (!automatic) {
          context.setStatus(`更新检查失败：${latestResult.reason}`, "warn");
        }
        return latestResult;
      } finally {
        checking = false;
        elements.checkForUpdates.disabled = false;
        render(latestResult);
      }
    }

    async function maybeAutoCheck() {
      if (
        checking
        || context.isBusy()
        || context.document.visibilityState !== "visible"
      ) return;
      const checkedAt = new Date(latestResult?.checkedAt || 0).getTime();
      if (checkedAt && Date.now() - checkedAt < CHECK_INTERVAL_MS) return;
      await check({ automatic: true });
    }

    async function openUrl(element) {
      const url = safeGithubUrl(element?.dataset?.url);
      if (!url) {
        context.setStatus("没有可打开的 GitHub 更新地址", "warn");
        return;
      }
      await context.chrome.tabs.create({ url });
    }

    return {
      async initialize(nextContext) {
        context = nextContext;
        const pageRoot = context.document.getElementById(
          context.manifest.pageElementId,
        );
        pageRoot.innerHTML = updatesTemplate;
        const stylesheet = context.document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = context.chrome.runtime.getURL(
          "src/modules/updates/styles.css",
        );
        context.document.head.appendChild(stylesheet);
        context.scope.add(() => stylesheet.remove());
        elements = elementMap(context.document);
        latestResult = await context.storage.migrateLegacy(
          LEGACY_STORAGE_KEY,
          null,
        );
        const { config, contract } = await loadVersionContext();
        if (!cacheMatchesRuntime(latestResult, config, contract)) {
          latestResult = null;
        }
        render(latestResult);

        context.scope.on(elements.openUpdatesTop, "click", () =>
          context.navigate("updates")
        );
        context.scope.on(elements.openUpdates, "click", () =>
          context.navigate("updates")
        );
        context.scope.on(elements.backFromUpdates, "click", () =>
          context.navigate("home")
        );
        context.scope.on(elements.checkForUpdates, "click", () =>
          check({ automatic: false })
        );
        context.scope.on(elements.downloadUpdate, "click", () =>
          openUrl(elements.downloadUpdate)
        );
        context.scope.on(elements.openReleasePage, "click", () =>
          openUrl(elements.openReleasePage)
        );
        context.scope.on(window, "focus", maybeAutoCheck);
        context.scope.interval(maybeAutoCheck, AUTO_CHECK_TIMER_MS);
        context.scope.timeout(maybeAutoCheck, 0);
      },

      async activate() {
        render(latestResult);
        context.scope.timeout(maybeAutoCheck, 0);
      },

      deactivate() {},
      dispose() {},
    };
  },
};
import { updatesTemplate } from "./template.js";
