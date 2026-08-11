"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CONVERSATION_BINDINGS_FILE = "file-archive-conversation-bindings.json";
const CONVERSATION_CATALOG_FILE = "file-archive-conversations-catalog.json";
const SOURCE_INDEX_FILE = "file-archive-source-index.json";
const MAX_CONVERSATIONS = 10000;

function nowIso() {
  return new Date().toISOString();
}

function security() {
  return {
    credentialsReturned: false,
    messageContentsReturned: false,
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function directoryChildren(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

function readableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isSameOrInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function probeDatabase(filePath) {
  if (!readableFile(filePath)) return { exists: false, format: "missing" };
  let descriptor = null;
  try {
    const header = Buffer.alloc(16);
    descriptor = fs.openSync(filePath, "r");
    fs.readSync(descriptor, header, 0, header.length, 0);
    if (header.toString("ascii") === "SQLite format 3\u0000") return { exists: true, format: "sqlite" };
    return { exists: true, format: "encrypted_or_proprietary" };
  } catch {
    return { exists: true, format: "unreadable" };
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch { /* The probe is read-only. */ }
    }
  }
}

function normalizeConversation(value, appType) {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || value.conversationId || "").trim();
  const name = String(value.name || value.conversationName || "").trim();
  if (!id || !name) return null;
  const type = value.type === "group" ? "group" : "direct";
  return {
    id: id.slice(0, 500),
    name: name.slice(0, 300),
    type,
    appType,
    avatarKey: String(value.avatarKey || "").slice(0, 300),
    updatedAt: value.updatedAt || null,
  };
}

function normalizeSourceIndex(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const filePath = String(item.filePath || "").trim();
    const conversationId = String(item.conversationId || "").trim();
    if (!filePath || !conversationId || !path.isAbsolute(filePath)) return null;
    return {
      filePath: path.resolve(filePath),
      conversationId: conversationId.slice(0, 500),
      conversationName: String(item.conversationName || "").slice(0, 300),
      senderName: String(item.senderName || "").slice(0, 200),
      messageTime: item.messageTime || null,
    };
  }).filter(Boolean).slice(0, MAX_CONVERSATIONS);
}

function discoverWechatMetadata(homeDir) {
  const base = path.join(homeDir, "Library", "Containers", "com.tencent.xinWeChat", "Data", "Documents", "xwechat_files");
  const accounts = directoryChildren(base).filter((item) => path.basename(item) !== "all_users");
  const probes = [];
  for (const account of accounts) {
    for (const relative of [
      "db_storage/contact/contact.db",
      "db_storage/session/session.db",
      "db_storage/message/message_0.db",
      "db_storage/message/message_resource.db",
    ]) {
      const filePath = path.join(account, relative);
      const result = probeDatabase(filePath);
      if (result.exists) probes.push({ relative, ...result });
    }
  }
  return {
    accountCount: accounts.length,
    databaseCount: probes.length,
    encryptedCount: probes.filter((item) => item.format === "encrypted_or_proprietary").length,
    sqliteCount: probes.filter((item) => item.format === "sqlite").length,
  };
}

function discoverWecomMetadata(homeDir) {
  const base = path.join(homeDir, "Library", "Containers", "com.tencent.WeWorkMac", "Data", "Documents", "Profiles");
  const profiles = directoryChildren(base);
  const probes = [];
  for (const profile of profiles) {
    for (const relative of [
      "Contact/Contact.db",
      "Messages1/Session.db",
      "Messages1/Info.db",
      "roster.db",
    ]) {
      const filePath = path.join(profile, relative);
      const result = probeDatabase(filePath);
      if (result.exists) probes.push({ relative, ...result });
    }
  }
  return {
    profileCount: profiles.length,
    databaseCount: probes.length,
    encryptedCount: probes.filter((item) => item.format === "encrypted_or_proprietary").length,
    sqliteCount: probes.filter((item) => item.format === "sqlite").length,
  };
}

function metadataMessage(appType, metadata) {
  const name = appType === "wecom" ? "企业微信" : "微信";
  if (!metadata.databaseCount) return `${name}未发现可用的会话元数据文件。`;
  if (metadata.encryptedCount && !metadata.sqliteCount) {
    return `${name}会话数据库已加密，当前版本不会尝试解密或读取聊天正文；暂时无法可靠加载联系人和群聊。`;
  }
  return `${name}发现会话元数据，但当前未接入稳定的官方读取接口；暂时不会自动生成会话清单。`;
}

function createFileArchiveConversationService({ runtimeDirectory, homeDir = os.homedir(), platform = process.platform } = {}) {
  const root = runtimeDirectory || path.join(homeDir, ".tianyuan-workbench", "native-helper");
  const bindingsPath = path.join(root, CONVERSATION_BINDINGS_FILE);
  const catalogPath = path.join(root, CONVERSATION_CATALOG_FILE);
  const sourceIndexPath = path.join(root, SOURCE_INDEX_FILE);

  function appMetadata(appType) {
    return appType === "wecom" ? discoverWecomMetadata(homeDir) : discoverWechatMetadata(homeDir);
  }

  function list(appType = "wechat") {
    if (platform !== "darwin") {
      return {
        ok: false,
        action: "file_archive_conversations",
        appType,
        available: false,
        conversations: [],
        reason: "FILE_ARCHIVE_CONVERSATIONS_UNSUPPORTED_PLATFORM",
        security: security(),
      };
    }
    const metadata = appMetadata(appType);
    const catalog = readJson(catalogPath, {});
    const conversations = (Array.isArray(catalog?.[appType]) ? catalog[appType] : [])
      .map((item) => normalizeConversation(item, appType))
      .filter(Boolean)
      .slice(0, MAX_CONVERSATIONS);
    const hasCatalog = conversations.length > 0;
    return {
      ok: true,
      action: "file_archive_conversations",
      appType,
      available: hasCatalog,
      source: hasCatalog ? "local_catalog" : "no_reliable_source",
      conversations,
      metadata: {
        databaseCount: metadata.databaseCount,
        encryptedCount: metadata.encryptedCount,
        sqliteCount: metadata.sqliteCount,
      },
      message: hasCatalog ? "已加载本地会话清单。" : metadataMessage(appType, metadata),
      refreshedAt: nowIso(),
      security: security(),
    };
  }

  function getBindings(appType = "wechat") {
    const stored = readJson(bindingsPath, {});
    const bindings = Array.isArray(stored?.[appType]) ? stored[appType] : [];
    return {
      ok: true,
      action: "file_archive_conversation_bindings",
      appType,
      bindings: bindings.filter((item) => item && typeof item === "object" && item.conversationId && path.isAbsolute(String(item.outputDirectory || "")))
        .map((item) => ({
          conversationId: String(item.conversationId).slice(0, 500),
          conversationName: String(item.conversationName || "").slice(0, 300),
          type: item.type === "group" ? "group" : "direct",
          outputDirectory: path.resolve(String(item.outputDirectory)),
          updatedAt: item.updatedAt || null,
        })),
      security: security(),
    };
  }

  function saveBindings({ appType = "wechat", bindings = [] } = {}) {
    const catalog = list(appType);
    const known = new Map(catalog.conversations.map((item) => [item.id, item]));
    const current = readJson(bindingsPath, {});
    const normalized = Array.isArray(bindings) ? bindings.map((item) => {
      const id = String(item?.conversationId || "").trim();
      const directory = String(item?.outputDirectory || "").trim();
      if (!id || !path.isAbsolute(directory) || !fs.existsSync(directory)) return null;
      const conversation = known.get(id);
      if (!conversation) return null;
      return {
        conversationId: id.slice(0, 500),
        conversationName: conversation.name,
        type: conversation.type,
        outputDirectory: path.resolve(directory),
        updatedAt: nowIso(),
      };
    }).filter(Boolean).slice(0, MAX_CONVERSATIONS) : [];
    writeJson(bindingsPath, { ...current, [appType]: normalized, updatedAt: nowIso() });
    return { ok: true, action: "file_archive_conversation_bindings_saved", appType, bindings: normalized, security: security() };
  }

  function resolveDownloadedFile({ appType = "wechat", filePath } = {}) {
    const resolved = path.resolve(String(filePath || ""));
    if (!resolved || !path.isAbsolute(resolved)) return null;
    const index = normalizeSourceIndex(readJson(sourceIndexPath, []));
    const entry = index.find((item) => item.filePath === resolved);
    if (!entry) return null;
    const binding = getBindings(appType).bindings.find((item) => item.conversationId === entry.conversationId);
    if (!binding) return { ...entry, confidence: "low", reason: "CONVERSATION_NOT_BOUND" };
    return { ...entry, confidence: "high", outputDirectory: binding.outputDirectory, conversationName: binding.conversationName };
  }

  return { list, getBindings, saveBindings, resolveDownloadedFile, paths: { bindingsPath, catalogPath, sourceIndexPath } };
}

module.exports = {
  CONVERSATION_BINDINGS_FILE,
  CONVERSATION_CATALOG_FILE,
  SOURCE_INDEX_FILE,
  createFileArchiveConversationService,
  discoverWechatMetadata,
  discoverWecomMetadata,
  normalizeConversation,
};
