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

function safeReleaseUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const hosts = new Set([
      "github.com",
      "api.github.com",
      "objects.githubusercontent.com",
      "release-assets.githubusercontent.com",
      "gitee.com",
      "raw.giteeusercontent.com",
    ]);
    return url.protocol === "https:" && hosts.has(url.hostname) ? url.href : "";
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
    "testUpdate",
    "installUpdate",
    "downloadUpdate",
    "openReleasePage",
    "updateProgressPanel",
    "updateProgressBar",
    "updateProgressText",
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
    type: "utility",
    stage: "stable",
    route: "updates",
    displayName: "版本更新",
    messageNamespace: "updates",
    entryElementId: "openUpdatesTop",
    pageElementId: "page-updates",
    storageVersion: 1,
    usesLegacyScope: false,
    scope: { companies: false, subjects: false },
  },

  create() {
    let context;
    let elements;
    let checking = false;
    let testing = false;
    let installing = false;
    let latestResult = null;
    let versionConfig = null;
    let runtimeContract = null;
    let operationStatus = null;

    function sleep(delay) {
      return new Promise((resolve) => window.setTimeout(resolve, delay));
    }

    function updateFailureText(reason) {
      const messages = {
        UPDATE_NOT_REQUIRED: "当前已经是最新完整版本。",
        UPDATE_ASSET_NOT_FOUND: "未找到适用于当前系统的完整安装包。",
        UPDATE_SHA256_MISSING: "官方发布包缺少 SHA-256，已停止安装。",
        UPDATE_SHA256_INVALID: "官方校验文件格式无效，已停止安装。",
        UPDATE_SHA256_MISMATCH: "安装包校验失败，文件可能损坏，已停止安装。",
        UPDATE_INSTALLER_NOT_FOUND: "安装包中缺少安装程序，已停止安装。",
        UPDATE_DOWNLOAD_NETWORK_FAILED: "安装包下载网络连接失败，请检查网络后重试。",
        UPDATE_DOWNLOAD_TIMEOUT: "安装包下载超时，请检查网络稳定性后重试。",
        UPDATE_CHECK_TIMEOUT: "更新源响应超时，当前版本可以继续使用，请稍后重试。",
        NATIVE_HELPER_TIMEOUT: "本地助手响应超时，请重新加载扩展后重试；当前版本未改变。",
        UPDATE_DOWNLOAD_SIZE_MISMATCH: "安装包大小与发布记录不一致，已停止处理。",
        UPDATE_FETCH_UNAVAILABLE: "本机 Node.js 运行时不支持下载，请更新本机运行组件。",
        UPDATE_INSTALLER_NOT_STARTED: "更新程序没有成功启动，请重试并查看诊断日志。",
        UPDATE_RUNNER_NOT_FOUND: "Windows 更新脚本没有成功启动，请重新加载工作台后重试。",
        UPDATE_PARENT_PROCESS_NOT_EXITED: "旧工作台服务没有及时退出，已停止更新以保护当前版本。",
        UPDATE_FILE_LOCKED: "工作台文件仍被占用，当前版本已保留；请关闭相关浏览器窗口后重试。",
        UPDATE_ALREADY_RUNNING: "已有更新正在执行，请等待当前更新结束。",
        UPDATE_COMPLETION_STATUS_MISSING: "安装程序未返回完成状态，当前版本已保留。",
        WORKBENCH_UPDATE_TIMEOUT: "更新等待超时，当前版本已保留；请查看诊断日志后重试。",
        PLATFORM_UPDATE_UNSUPPORTED: "当前系统暂不支持一键更新。",
        UNKNOWN_ACTION: "当前 Native Helper 版本较旧，需要手动安装一次新版。",
      };
      if (String(reason || "").startsWith("UPDATE_DOWNLOAD_NETWORK_")) {
        const code = String(reason).slice("UPDATE_DOWNLOAD_NETWORK_".length);
        return `安装包下载网络连接失败（${code}），请检查网络后重试。`;
      }
      if (String(reason || "").startsWith("UPDATE_DOWNLOAD_HTTP_")) {
        const code = String(reason).slice("UPDATE_DOWNLOAD_HTTP_".length);
        return `GitHub 安装包下载失败（HTTP ${code}），请稍后重试。`;
      }
      if (String(reason || "").startsWith("UPDATE_PACKAGE_FILE_MISSING:")) {
        return "安装包文件不完整，已停止处理。";
      }
      if (String(reason || "").startsWith("UPDATE_INSTALLER_EXIT_")) {
        const code = String(reason).slice("UPDATE_INSTALLER_EXIT_".length);
        return `Windows 安装脚本失败（退出码 ${code}），当前版本已保留。`;
      }
      return messages[reason] || reason || "完整更新失败";
    }

    function progressMessage(status) {
      if (status?.message) return status.message;
      const labels = {
        preparing: "正在准备更新",
        stopping_services: "正在停止工作台服务",
        waiting_for_file_release: "正在等待文件释放",
        installing: "正在安装全部组件",
        verifying_install: "正在验证安装结果",
        restarting_services: "正在重启工作台服务",
        rollback: "正在恢复原版本",
      };
      return labels[status?.phase] || (status?.phase === "failed"
        ? updateFailureText(status.reason)
        : "等待开始");
    }

    function renderProgress(status = operationStatus) {
      operationStatus = status;
      const active = installing || testing || (
        status
        && !["idle", "complete", "test_complete", "failed"].includes(status.phase)
      );
      elements.updateProgressPanel.classList.toggle("hidden", !active && !status);
      elements.updateProgressBar.value = Math.max(0, Math.min(100, Number(status?.percent || 0)));
      elements.updateProgressText.textContent = progressMessage(status);
    }

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

      const assetUrl = safeReleaseUrl(result?.asset?.url);
      const releaseUrl = safeReleaseUrl(result?.releaseUrl);
      const operationBusy = checking || testing || installing;
      elements.downloadUpdate.disabled = operationBusy || !assetUrl;
      elements.downloadUpdate.dataset.url = assetUrl;
      elements.openReleasePage.disabled = operationBusy || !releaseUrl;
      elements.openReleasePage.dataset.url = releaseUrl;
      elements.testUpdate.disabled = operationBusy
        || !assetUrl
        || !result?.ok;
      elements.installUpdate.disabled = operationBusy
        || !assetUrl
        || !result?.ok
        || (!result?.updateAvailable && !result?.repairRequired);

      if (!result) {
        elements.updateHeadline.textContent = `天源浏览器工作台 v${currentVersion}`;
        elements.updateDescription.textContent = "检查不使用 MCP token；安装前会再次确认。";
        elements.updateBadge.textContent = "未检查";
        elements.updateFeedback.textContent = "尚未检查发布源";
        elements.updateFeedback.dataset.kind = "";
        setTopStatus(`v${currentVersion}`, "idle");
        return;
      }
      if (!result.ok) {
        elements.updateHeadline.textContent = "暂时无法检查更新";
        elements.updateDescription.textContent = "当前版本可以继续使用，稍后可重新检查。";
        elements.updateBadge.textContent = "检查失败";
        elements.updateFeedback.textContent = result.reason || "发布源更新检查失败";
        elements.updateFeedback.dataset.kind = "error";
        setTopStatus("检查失败", "warn");
        return;
      }
      if (!result.releasePublished) {
        elements.updateHeadline.textContent = `当前版本 v${currentVersion}`;
        elements.updateDescription.textContent = "发布源尚未发布正式版本，当前安装保持不变。";
        elements.updateBadge.textContent = "尚未发布";
        elements.updateFeedback.textContent = "仓库目前没有可供更新的正式版本";
        elements.updateFeedback.dataset.kind = "";
        setTopStatus(`v${currentVersion}`, "ok");
        return;
      }
      if (result.repairRequired) {
        elements.updateHeadline.textContent = "检测到组件版本不一致";
        elements.updateDescription.textContent = "产品版本相同，但运行指纹不同，需要重新下载安装当前版本。";
        elements.updateBadge.textContent = "需要修复";
        elements.updateFeedback.textContent = assetUrl
          ? "可点击“更新全部组件”自动修复，或手动下载安装包"
          : "请打开发布页重新下载安装";
        elements.updateFeedback.dataset.kind = "error";
        setTopStatus("需修复", "error");
        return;
      }
      if (result.updateAvailable) {
        elements.updateHeadline.textContent = `发现新版本 v${result.latestVersion}`;
        elements.updateDescription.textContent = result.mandatory
          ? "当前版本低于最低支持版本，需要更新后再继续正式操作。"
          : "可一次更新扩展、Helper、Bridge、Connector 和 Agent 插件缓存。";
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
      if (result.latestVersion && String(result.latestVersion) !== String(currentVersion)) {
        elements.updateHeadline.textContent = "本机版本高于公开版本";
        elements.updateDescription.textContent =
          `当前为 v${currentVersion}，GitHub 最新正式版本为 v${result.latestVersion}。`;
        elements.updateBadge.textContent = "本机较新";
        elements.updateFeedback.textContent =
          "可以使用“测试更新模块”验证公开安装包链路；测试不会降级或安装组件";
        elements.updateFeedback.dataset.kind = "ok";
        setTopStatus(`v${currentVersion}`, "ok");
        renderProgress();
        return;
      }
      elements.updateHeadline.textContent = "已是最新版本";
      elements.updateDescription.textContent = `当前版本 v${currentVersion} 与 GitHub 最新正式版本一致。`;
      elements.updateBadge.textContent = "最新";
      elements.updateFeedback.textContent = "无需更新";
      elements.updateFeedback.dataset.kind = "ok";
      setTopStatus(`v${currentVersion}`, "ok");
      renderProgress();
    }

    async function check({ automatic = false } = {}) {
      if (checking || testing || installing) return latestResult;
      checking = true;
      elements.checkForUpdates.disabled = true;
      elements.testUpdate.disabled = true;
      elements.installUpdate.disabled = true;
      elements.downloadUpdate.disabled = true;
      setTopStatus("检查中", "idle");
      elements.updateBadge.textContent = "检查中";
      elements.updateFeedback.textContent = "正在连接发布源...";
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
        // Leave enough room for the Helper's bounded network fallback to
        // return UPDATE_CHECK_TIMEOUT instead of surfacing a transport timeout.
        }, 30000);
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

    async function readInstallStatus() {
      return await context.sendNativeMessage({
        action: "get_workbench_update_status",
      }, 15000);
    }

    async function testUpdateModule() {
      if (testing || installing || checking || !latestResult?.asset?.url) return;
      const confirmed = window.confirm([
        "确认测试更新模块？",
        "",
        "将下载约 100–130 MB 的当前平台完整安装包，并测试：",
        "1. 发布源下载与重试通道",
        "2. SHA-256 校验",
        "3. 解压和安装包文件完整性",
        "",
        "不会安装组件、改变版本或重启；测试文件完成后自动删除。",
      ].join("\n"));
      if (!confirmed) return;

      testing = true;
      elements.testUpdate.textContent = "测试中...";
      setTopStatus("测试中", "idle");
      renderProgress({
        mode: "test",
        phase: "checking",
        percent: 3,
        message: "正在准备更新模块安全自测",
      });
      render(latestResult);
      context.setStatus("正在测试完整更新链路，不会执行安装...", "idle");
      try {
        const { config, contract } = await loadVersionContext();
        let requestFinished = false;
        const request = context.sendNativeMessage({
          action: "test_workbench_update",
          currentVersion: config.productVersion
            || context.extensionManifest.version_name
            || context.extensionManifest.version,
          currentBuildNumber: Number(config.buildNumber || 0),
          currentRuntimeBuildId: String(contract?.runtimeBuildId || ""),
        }, 20 * 60 * 1000).finally(() => {
          requestFinished = true;
        });

        while (!requestFinished) {
          await Promise.race([
            sleep(1000),
            request.then(() => undefined, () => undefined),
          ]);
          if (requestFinished) break;
          try {
            const status = await readInstallStatus();
            if (status?.mode === "test") renderProgress(status);
          } catch {
          }
        }

        const result = await request;
        if (!result?.ok || result?.phase !== "test_complete") {
          throw new Error(result?.reason || "WORKBENCH_UPDATE_TEST_FAILED");
        }
        renderProgress(result);
        elements.updateFeedback.textContent =
          "测试通过：下载、SHA-256 校验、解压和文件完整性均正常；未安装任何组件";
        elements.updateFeedback.dataset.kind = "ok";
        setTopStatus("测试通过", "ok");
        context.setStatus("更新模块测试通过，当前版本和已安装组件均未改变。", "ok");
      } catch (error) {
        const reason = String(error?.message || error);
        const friendly = updateFailureText(reason);
        renderProgress({
          mode: "test",
          phase: "failed",
          percent: 0,
          reason,
          message: friendly,
        });
        elements.updateFeedback.textContent = `更新模块测试失败：${friendly}`;
        elements.updateFeedback.dataset.kind = "error";
        setTopStatus("测试失败", "error");
        context.setStatus(`更新模块测试失败：${friendly}`, "error");
      } finally {
        const finalStatus = operationStatus;
        testing = false;
        elements.testUpdate.textContent = "测试更新模块";
        render(latestResult);
        renderProgress(finalStatus);
        if (finalStatus?.phase === "test_complete") {
          elements.updateFeedback.textContent =
            "测试通过：下载、SHA-256 校验、解压和文件完整性均正常；未安装任何组件";
          elements.updateFeedback.dataset.kind = "ok";
          setTopStatus("测试通过", "ok");
        } else if (finalStatus?.phase === "failed") {
          const friendly = updateFailureText(finalStatus.reason);
          elements.updateFeedback.textContent = `更新模块测试失败：${friendly}`;
          elements.updateFeedback.dataset.kind = "error";
          setTopStatus("测试失败", "error");
        }
      }
    }

    async function waitForInstallComplete() {
      const deadline = Date.now() + 15 * 60 * 1000;
      let lastStatus = null;
      while (Date.now() < deadline) {
        try {
          lastStatus = await readInstallStatus();
        } catch {
          await sleep(1200);
          continue;
        }
        renderProgress(lastStatus);
        if (lastStatus?.phase === "complete") return lastStatus;
        if (lastStatus?.phase === "failed") {
          throw new Error(lastStatus.reason || "WORKBENCH_UPDATE_FAILED");
        }
        await sleep(1200);
      }
      throw new Error(lastStatus?.reason || "WORKBENCH_UPDATE_TIMEOUT");
    }

    async function installCompleteUpdate() {
      if (installing || testing || checking || !latestResult?.asset?.url) return;
      const confirmed = window.confirm([
        `确认将天源浏览器工作台更新到 v${latestResult.latestVersion}？`,
        "",
        "将同步更新：浏览器扩展、Native Helper、Bridge、Connector 和 Agent 插件缓存。",
        "不会保存或输出 MCP token、Cookie、Authorization、密码或验证码。",
        "更新完成后浏览器扩展会自动重新加载；Codex 或 WorkBuddy 可能需要重启。",
      ].join("\n"));
      if (!confirmed) return;

      installing = true;
      render(latestResult);
      elements.installUpdate.textContent = "更新中...";
      setTopStatus("更新中", "idle");
      renderProgress({ phase: "checking", percent: 3, message: "正在准备完整更新" });
      context.setStatus("正在下载并安装全部工作台组件...", "idle");
      try {
        const { config, contract } = await loadVersionContext();
        let requestFinished = false;
        const request = context.sendNativeMessage({
          action: "install_workbench_update",
          currentVersion: config.productVersion
            || context.extensionManifest.version_name
            || context.extensionManifest.version,
          currentBuildNumber: Number(config.buildNumber || 0),
          currentRuntimeBuildId: String(contract?.runtimeBuildId || ""),
        }, 10 * 60 * 1000).finally(() => {
          requestFinished = true;
        });

        while (!requestFinished) {
          await sleep(1000);
          try {
            renderProgress(await readInstallStatus());
          } catch {
          }
        }

        const started = await request;
        if (!started?.ok) {
          if (started?.reason === "UNKNOWN_ACTION") {
            await openUrl(elements.downloadUpdate);
          }
          throw new Error(started?.reason || "WORKBENCH_UPDATE_START_FAILED");
        }
        const completed = await waitForInstallComplete();
        renderProgress(completed);
        elements.updateFeedback.textContent = "全部组件更新完成，正在重新加载扩展";
        elements.updateFeedback.dataset.kind = "ok";
        setTopStatus("已更新", "ok");
        context.setStatus("全部组件更新完成；Codex 或 WorkBuddy 如仍显示旧工具，请重启。", "ok");
        await sleep(1200);
        context.chrome.runtime.reload();
      } catch (error) {
        const reason = String(error?.message || error);
        const friendly = updateFailureText(reason);
        renderProgress({ phase: "failed", percent: 0, reason, message: friendly });
        elements.updateFeedback.textContent = friendly;
        elements.updateFeedback.dataset.kind = "error";
        setTopStatus("更新失败", "error");
        context.setStatus(`完整更新失败：${friendly}`, "error");
      } finally {
        const finalStatus = operationStatus;
        installing = false;
        elements.installUpdate.textContent = "更新全部组件";
        render(latestResult);
        renderProgress(finalStatus);
        if (finalStatus?.phase === "failed") {
          const friendly = updateFailureText(finalStatus.reason);
          elements.updateFeedback.textContent = friendly;
          elements.updateFeedback.dataset.kind = "error";
          setTopStatus("更新失败", "error");
        }
      }
    }

    async function openUrl(element) {
      const url = safeReleaseUrl(element?.dataset?.url);
      if (!url) {
        context.setStatus("没有可打开的更新地址", "warn");
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
        context.scope.on(elements.backFromUpdates, "click", () =>
          context.navigate("home")
        );
        context.scope.on(elements.checkForUpdates, "click", () =>
          check({ automatic: false })
        );
        context.scope.on(elements.testUpdate, "click", testUpdateModule);
        context.scope.on(elements.installUpdate, "click", installCompleteUpdate);
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
