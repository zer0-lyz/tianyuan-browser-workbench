import { feedbackTemplate } from "./template.js";

const TYPE_LABELS = {
  feature: "功能建议",
  configuration: "配置问题",
  bug: "故障反馈",
  experience: "使用体验",
  other: "其他",
};

function elementMap(documentRef) {
  const ids = [
    "openFeedbackTop",
    "backFromFeedback",
    "feedbackDraftStatus",
    "feedbackType",
    "feedbackTitle",
    "feedbackDescription",
    "feedbackSteps",
    "feedbackIncludeDiagnostics",
    "feedbackPrivacyConfirm",
    "feedbackMessage",
    "submitFeedback",
    "copyFeedback",
    "clearFeedback",
    "feedbackDeliveryMode",
    "feedbackChannelStatus",
  ];
  return Object.fromEntries(ids.map((id) => [id, documentRef.getElementById(id)]));
}

function safeGithubRepository(value) {
  const repository = String(value || "").trim();
  return /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository) ? repository : "";
}

function safeFeedbackEndpoint(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.pathname !== "/api/feedback") return "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

const SENSITIVE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bzhmcp_[A-Za-z0-9_-]{12,}/i,
  /\b(?:Cookie|Authorization)\s*:/i,
  /(?:^|[\s"'(])\/Users\/[^\s"'<>]+/i,
  /(?:^|[\s"'(])[A-Z]:\\Users\\[^\s"'<>]+/i,
];

function containsSensitiveContent(draft) {
  const content = [draft.title, draft.description, draft.steps].join("\n");
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(content));
}

export function feedbackMarkdown(draft, diagnostics) {
  const typeLabel = TYPE_LABELS[draft.type] || TYPE_LABELS.other;
  const lines = [
    `# [${typeLabel}] ${draft.title.trim()}`,
    "",
    "## 详细说明",
    "",
    draft.description.trim(),
  ];
  if (draft.steps.trim()) {
    lines.push("", "## 复现步骤或使用场景", "", draft.steps.trim());
  }
  if (diagnostics) {
    lines.push(
      "",
      "## 环境信息",
      "",
      "```json",
      JSON.stringify(diagnostics, null, 2),
      "```",
    );
  }
  lines.push(
    "",
    "> 安全声明：本反馈不应包含客户资料、项目编号、本机文件路径或任何账号凭据。",
  );
  return lines.join("\n");
}

export function issueUrl(config, draft, markdown) {
  if (
    config.deliveryMode !== "github-issues"
    || !config.githubIssuesEnabled
  ) return "";
  const repository = safeGithubRepository(config.githubRepository);
  if (!repository) return "";
  const query = new URLSearchParams({
    title: `[${TYPE_LABELS[draft.type] || TYPE_LABELS.other}] ${draft.title.trim()}`,
    body: markdown.slice(0, 6000),
    labels: "feedback",
  });
  return `https://github.com/${repository}/issues/new?${query.toString()}`;
}

export function validateFeedbackDraft(draft, privacyConfirmed) {
  if (!draft.title.trim()) return "请填写反馈标题";
  if (!draft.description.trim()) return "请填写详细说明";
  if (!privacyConfirmed) return "请先确认反馈内容不包含客户资料或账号凭据";
  if (containsSensitiveContent(draft)) {
    return "检测到疑似 token、鉴权信息或本机文件路径，请删除后再提交";
  }
  return "";
}

export const feedbackModule = {
  manifest: {
    id: "feedback",
    type: "utility",
    stage: "stable",
    route: "feedback",
    displayName: "反馈",
    messageNamespace: "feedback",
    entryElementId: "openFeedbackTop",
    pageElementId: "page-feedback",
    storageVersion: 1,
    usesLegacyScope: false,
    scope: { companies: false, subjects: false },
  },

  create() {
    let context;
    let elements;
    let config = {};
    let draft = {
      type: "feature",
      title: "",
      description: "",
      steps: "",
      includeDiagnostics: true,
    };
    let saveTimer = null;

    function renderDraft() {
      elements.feedbackType.value = draft.type;
      elements.feedbackTitle.value = draft.title;
      elements.feedbackDescription.value = draft.description;
      elements.feedbackSteps.value = draft.steps;
      elements.feedbackIncludeDiagnostics.checked = draft.includeDiagnostics !== false;
    }

    function readDraft() {
      return {
        type: elements.feedbackType.value || "other",
        title: elements.feedbackTitle.value.slice(0, 120),
        description: elements.feedbackDescription.value.slice(0, 4000),
        steps: elements.feedbackSteps.value.slice(0, 2500),
        includeDiagnostics: elements.feedbackIncludeDiagnostics.checked,
      };
    }

    function setMessage(text, kind = "") {
      elements.feedbackMessage.textContent = text;
      elements.feedbackMessage.dataset.kind = kind;
    }

    async function saveDraft() {
      draft = readDraft();
      await context.storage.save(draft);
      elements.feedbackDraftStatus.textContent = "已保存";
      elements.feedbackDraftStatus.dataset.kind = "ok";
    }

    function scheduleSave() {
      elements.feedbackDraftStatus.textContent = "保存中";
      elements.feedbackDraftStatus.dataset.kind = "";
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        saveDraft().catch((error) => {
          elements.feedbackDraftStatus.textContent = "保存失败";
          elements.feedbackDraftStatus.dataset.kind = "error";
          setMessage(error?.message || String(error), "error");
        });
      }, 300);
    }

    function validate() {
      draft = readDraft();
      return validateFeedbackDraft(
        draft,
        elements.feedbackPrivacyConfirm.checked,
      );
    }

    async function compose() {
      const validation = validate();
      if (validation) {
        setMessage(validation, "error");
        return null;
      }
      await saveDraft();
      const diagnostics = draft.includeDiagnostics
        ? await context.getSafeDiagnostics()
        : null;
      return {
        markdown: feedbackMarkdown(draft, diagnostics),
        diagnostics,
      };
    }

    async function copyFeedback() {
      const composed = await compose();
      if (!composed) return;
      await context.copyText(composed.markdown);
      setMessage("反馈内容已复制，可发送给维护人员", "ok");
      context.setStatus("反馈内容已复制", "ok");
    }

    async function submitFeedback() {
      const composed = await compose();
      if (!composed) return;
      const endpoint = safeFeedbackEndpoint(config.endpoint);
      if (config.deliveryMode !== "service" || !endpoint) {
        setMessage("自动提交服务尚未启用，请先使用“复制反馈”", "warn");
        return;
      }
      elements.submitFeedback.disabled = true;
      setMessage("正在安全提交反馈...");
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: draft.type,
            title: draft.title.trim(),
            description: draft.description.trim(),
            steps: draft.steps.trim(),
            diagnostics: composed.diagnostics,
            privacyConfirmed: true,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          throw new Error(result.message || `反馈服务返回 ${response.status}`);
        }
        setMessage(`反馈已提交，编号 ${result.feedbackId}`, "ok");
        context.setStatus(`反馈 ${result.feedbackId} 已提交`, "ok");
      } catch (error) {
        setMessage(`提交失败：${error?.message || String(error)}`, "error");
      } finally {
        renderDelivery();
      }
    }

    async function clearFeedback() {
      draft = {
        type: "feature",
        title: "",
        description: "",
        steps: "",
        includeDiagnostics: true,
      };
      await context.storage.clear();
      renderDraft();
      elements.feedbackPrivacyConfirm.checked = false;
      elements.feedbackDraftStatus.textContent = "未保存";
      elements.feedbackDraftStatus.dataset.kind = "";
      setMessage("反馈草稿已清空");
    }

    function renderDelivery() {
      const endpoint = safeFeedbackEndpoint(config.endpoint);
      const serviceReady = config.deliveryMode === "service" && endpoint;
      elements.submitFeedback.disabled = !serviceReady;
      elements.submitFeedback.textContent = serviceReady
        ? "提交反馈"
        : "自动提交待配置";
      elements.feedbackDeliveryMode.textContent = serviceReady
        ? "安全反馈服务"
        : "本机草稿与复制";
      elements.feedbackChannelStatus.textContent = serviceReady
        ? "私有 GitHub 反馈仓库"
        : "尚未启用自动提交";
    }

    return {
      async initialize(nextContext) {
        context = nextContext;
        const pageRoot = context.document.getElementById(
          context.manifest.pageElementId,
        );
        pageRoot.innerHTML = feedbackTemplate;
        const stylesheet = context.document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = context.chrome.runtime.getURL(
          "src/modules/feedback/styles.css",
        );
        context.document.head.appendChild(stylesheet);
        context.scope.add(() => stylesheet.remove());
        context.scope.add(() => {
          if (saveTimer) window.clearTimeout(saveTimer);
        });
        elements = elementMap(context.document);
        config = await fetch(
          context.chrome.runtime.getURL("feedback.json"),
          { cache: "no-store" },
        )
          .then((response) => response.ok ? response.json() : {})
          .catch(() => ({}));
        draft = {
          ...draft,
          ...(await context.storage.load({})),
        };
        renderDraft();
        renderDelivery();

        context.scope.on(elements.openFeedbackTop, "click", () =>
          context.navigate("feedback")
        );
        context.scope.on(elements.backFromFeedback, "click", () =>
          context.navigate("home")
        );
        for (const element of [
          elements.feedbackType,
          elements.feedbackTitle,
          elements.feedbackDescription,
          elements.feedbackSteps,
          elements.feedbackIncludeDiagnostics,
        ]) {
          context.scope.on(element, "input", scheduleSave);
          context.scope.on(element, "change", scheduleSave);
        }
        context.scope.on(elements.copyFeedback, "click", copyFeedback);
        context.scope.on(elements.submitFeedback, "click", submitFeedback);
        context.scope.on(elements.clearFeedback, "click", clearFeedback);
      },

      activate() {
        renderDraft();
        renderDelivery();
      },

      deactivate() {
        if (saveTimer) {
          window.clearTimeout(saveTimer);
          saveTimer = null;
          void saveDraft();
        }
      },

      dispose() {},
    };
  },
};
