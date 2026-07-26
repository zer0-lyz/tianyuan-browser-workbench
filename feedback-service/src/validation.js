const TYPES = new Set([
  "feature",
  "configuration",
  "bug",
  "experience",
  "other",
]);

const TOP_LEVEL_KEYS = new Set([
  "type",
  "title",
  "description",
  "steps",
  "diagnostics",
  "privacyConfirmed",
]);

const DIAGNOSTIC_KEYS = new Set([
  "version",
  "buildNumber",
  "runtimeBuildId",
  "platform",
  "architecture",
  "connectorConnected",
  "connectorProtocol",
  "mcpStatus",
  "cliStatus",
  "moduleRoute",
  "collectedAt",
]);

function boundedString(value, name, maxLength, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new Error(`INVALID_${name.toUpperCase()}`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`MISSING_${name.toUpperCase()}`);
  if (normalized.length > maxLength) throw new Error(`${name.toUpperCase()}_TOO_LONG`);
  return normalized;
}

function assertKnownKeys(value, allowed, errorCode) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${errorCode}:${key}`);
  }
}

function normalizeDiagnostics(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_DIAGNOSTICS");
  }
  assertKnownKeys(value, DIAGNOSTIC_KEYS, "UNKNOWN_DIAGNOSTIC_FIELD");
  return {
    version: boundedString(value.version, "diagnostic_version", 32),
    buildNumber: Number.isSafeInteger(value.buildNumber) ? value.buildNumber : 0,
    runtimeBuildId: boundedString(value.runtimeBuildId, "runtime_build_id", 128),
    platform: boundedString(value.platform, "platform", 32),
    architecture: boundedString(value.architecture, "architecture", 32),
    connectorConnected: value.connectorConnected === true,
    connectorProtocol: boundedString(value.connectorProtocol, "connector_protocol", 80),
    mcpStatus: boundedString(value.mcpStatus, "mcp_status", 32),
    cliStatus: boundedString(value.cliStatus, "cli_status", 32),
    moduleRoute: boundedString(value.moduleRoute, "module_route", 64),
    collectedAt: boundedString(value.collectedAt, "collected_at", 40),
  };
}

export function validateFeedbackPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_PAYLOAD");
  }
  assertKnownKeys(value, TOP_LEVEL_KEYS, "UNKNOWN_FIELD");
  if (!TYPES.has(value.type)) throw new Error("INVALID_TYPE");
  if (value.privacyConfirmed !== true) throw new Error("PRIVACY_CONFIRMATION_REQUIRED");
  return {
    type: value.type,
    title: boundedString(value.title, "title", 120, true),
    description: boundedString(value.description, "description", 4000, true),
    steps: boundedString(value.steps, "steps", 2500),
    diagnostics: normalizeDiagnostics(value.diagnostics),
    privacyConfirmed: true,
  };
}
