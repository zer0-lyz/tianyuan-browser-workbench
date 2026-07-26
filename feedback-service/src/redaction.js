const REPLACEMENTS = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "[REDACTED_BEARER]"],
  [/\bzhmcp_[A-Za-z0-9_-]{8,}/gi, "[REDACTED_TOKEN]"],
  [/\b(Cookie|Authorization)\s*:\s*[^\r\n]+/gi, "$1: [REDACTED]"],
  [/(^|[\s"'(])\/Users\/[^\s"'<>]+/gim, "$1[REDACTED_LOCAL_PATH]"],
  [/(^|[\s"'(])[A-Z]:\\Users\\[^\s"'<>]+/gim, "$1[REDACTED_LOCAL_PATH]"],
  [/(^|[\s"'(])\/home\/[^\s"'<>]+/gim, "$1[REDACTED_LOCAL_PATH]"],
];

export function redactText(value) {
  let result = String(value || "");
  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function redactFeedback(feedback) {
  return {
    ...feedback,
    title: redactText(feedback.title),
    description: redactText(feedback.description),
    steps: redactText(feedback.steps),
  };
}
