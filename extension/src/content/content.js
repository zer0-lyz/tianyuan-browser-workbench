(() => {
var ADAPTER_VERSION = "2026-08-12-page-tree-visible-only-v32";
var CONTENT_STATE_KEY = "__tianyuanWorkbenchContentScriptState";
var INJECTED_SCRIPT_ID = `tianyuan-workbench-page-adapter-${ADAPTER_VERSION}`;
var EXT_REQUEST_TYPE = "TIANYUAN_WORKBENCH_GET_CONTEXT_V2";
var EXT_ACTION_REQUEST_TYPE = "TIANYUAN_WORKBENCH_RUN_ACTION_V2";
var PAGE_REQUEST_TYPE = `TIANYUAN_WORKBENCH_GET_CONTEXT:${ADAPTER_VERSION}`;
var PAGE_RESPONSE_TYPE = `TIANYUAN_WORKBENCH_CONTEXT_RESULT:${ADAPTER_VERSION}`;
var PAGE_ACTION_REQUEST_TYPE = `TIANYUAN_WORKBENCH_RUN_ACTION:${ADAPTER_VERSION}`;
var PAGE_ACTION_RESPONSE_TYPE = `TIANYUAN_WORKBENCH_ACTION_RESULT:${ADAPTER_VERSION}`;

var existingContentState = globalThis[CONTENT_STATE_KEY];
if (existingContentState?.listener) {
  try {
    chrome.runtime.onMessage.removeListener(existingContentState.listener);
  } catch {
    // A listener from an invalidated extension context can be left for Chrome to discard.
  }
}

var adapterInjectionPromise = null;

function injectPageAdapter() {
  adapterInjectionPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(INJECTED_SCRIPT_ID);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = INJECTED_SCRIPT_ID;
    script.src = `${chrome.runtime.getURL("src/injected/page_adapter.js")}?v=${encodeURIComponent(ADAPTER_VERSION)}`;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      adapterInjectionPromise = null;
      script.remove();
      reject(new Error("PAGE_ADAPTER_INJECT_FAILED"));
    };
    (document.documentElement || document.head).appendChild(script);
  });

  return adapterInjectionPromise;
}

async function requestPageAdapter(type, responseType, payload = {}, timeoutMs = 8000) {
  await injectPageAdapter();
  const requestId = `tywb-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      adapterInjectionPromise = null;
      window.removeEventListener("message", onMessage);
      resolve({
        ok: false,
        reason: `${type}_TIMEOUT`,
        collectedAt: new Date().toISOString(),
        url: location.href,
      });
    }, timeoutMs);

    function onMessage(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.type !== responseType || data.requestId !== requestId) return;
      if (data.payload?.adapterVersion !== ADAPTER_VERSION) return;

      window.clearTimeout(timeout);
      adapterInjectionPromise = Promise.resolve();
      window.removeEventListener("message", onMessage);
      resolve(data.payload);
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ type, requestId, payload: { ...payload, minAdapterVersion: ADAPTER_VERSION } }, "*");
  });
}

var contentMessageListener = (message, _sender, sendResponse) => {
  if (message?.type !== EXT_REQUEST_TYPE && message?.type !== EXT_ACTION_REQUEST_TYPE) return false;

  const actionTimeout = ["upload_audit_attachment", "batch_upload_audit_attachments", "set_audit_check_result", "batch_set_audit_check_results"].includes(message.payload?.action)
    ? 120000
    : 45000;
  const adapterRequest = message.type === EXT_ACTION_REQUEST_TYPE
    ? requestPageAdapter(PAGE_ACTION_REQUEST_TYPE, PAGE_ACTION_RESPONSE_TYPE, message.payload || {}, actionTimeout)
    : requestPageAdapter(PAGE_REQUEST_TYPE, PAGE_RESPONSE_TYPE);

  adapterRequest
    .then((payload) => sendResponse(payload))
    .catch((error) => {
      sendResponse({
        ok: false,
        reason: message.type === EXT_ACTION_REQUEST_TYPE ? "CONTENT_ACTION_ERROR" : "CONTENT_CONTEXT_ERROR",
        message: error?.message || String(error),
        collectedAt: new Date().toISOString(),
        url: location.href,
      });
    });

  return true;
};

chrome.runtime.onMessage.addListener(contentMessageListener);
globalThis[CONTENT_STATE_KEY] = {
  adapterVersion: ADAPTER_VERSION,
  listener: contentMessageListener,
};
})();
