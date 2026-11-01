const PAGE_KEYS = ["projectId", "companyId", "subjectCode", "pageType", "url", "operationScope"];

export function connectorRecoveryPageMatches(expected, actual) {
  if (!expected || !actual || !Number.isInteger(expected.tabId) || expected.tabId !== actual.tabId) return false;
  return PAGE_KEYS.every((key) => String(expected[key] || "") === String(actual[key] || ""));
}

export function connectorRecoveryBindingMatches(expected, actual) {
  if (!expected || !actual) return false;
  return ["bindingId", "projectId", "scope", "accessMode"]
    .every((key) => String(expected[key] || "") === String(actual[key] || ""))
    && String(expected.conversationId || "") === String(actual.conversationId || actual.threadId || "");
}

export function connectorRecoverySessionId(storedSessionId, recovery) {
  const stored = String(storedSessionId || "").trim();
  if (stored) return stored;
  const recovered = String(recovery?.sessionId || "").trim();
  return recovered || "";
}

export function createConnectorRecoveryDescriptor(session) {
  const page = session?.binding || {};
  const binding = session?.codexBinding || {};
  const conversationId = String(binding.conversationId || binding.threadId || "");
  if (!session?.sessionId || !Number.isInteger(page.tabId) || !binding.bindingId || !binding.projectId || !conversationId) return null;
  return {
    sessionId: String(session.sessionId),
    page: Object.fromEntries(["tabId", ...PAGE_KEYS].map((key) => [key, key === "tabId" ? page[key] : String(page[key] || "")])),
    codexBinding: {
      bindingId: String(binding.bindingId),
      projectId: String(binding.projectId),
      conversationId,
      scope: String(binding.scope || ""),
      accessMode: String(binding.accessMode || ""),
    },
  };
}
