const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createFileArchiveConversationService,
  discoverWechatMetadata,
  discoverWecomMetadata,
} = require("../native-helper/file-archive-conversations.js");

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-file-archive-conversations-"));
}

function writeEncryptedFixture(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from("not-a-sqlite-database"));
}

test("detects encrypted WeChat metadata without reading database contents", () => {
  const home = tempDirectory();
  const account = path.join(home, "Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/account");
  for (const relative of [
    "db_storage/contact/contact.db",
    "db_storage/session/session.db",
    "db_storage/message/message_0.db",
  ]) writeEncryptedFixture(path.join(account, relative));
  const result = discoverWechatMetadata(home);
  assert.equal(result.databaseCount, 3);
  assert.equal(result.encryptedCount, 3);
  assert.equal(result.sqliteCount, 0);
});

test("detects encrypted WeCom metadata as unavailable rather than guessing conversations", () => {
  const home = tempDirectory();
  const profile = path.join(home, "Library/Containers/com.tencent.WeWorkMac/Data/Documents/Profiles/profile");
  for (const relative of ["Contact/Contact.db", "Messages1/Session.db", "Messages1/Info.db"]) {
    writeEncryptedFixture(path.join(profile, relative));
  }
  const result = discoverWecomMetadata(home);
  assert.equal(result.profileCount, 1);
  assert.equal(result.databaseCount, 3);
  assert.equal(result.encryptedCount, 3);
});

test("loads a safe local catalog and persists per-conversation directory bindings", () => {
  const home = tempDirectory();
  const runtime = path.join(home, "runtime");
  const output = path.join(home, "exports");
  fs.mkdirSync(output, { recursive: true });
  fs.mkdirSync(runtime, { recursive: true });
  fs.writeFileSync(path.join(runtime, "file-archive-conversations-catalog.json"), JSON.stringify({
    wechat: [{ id: "group-id-1", name: "测试群", type: "group" }],
  }));
  const service = createFileArchiveConversationService({ runtimeDirectory: runtime, homeDir: home, platform: "darwin" });
  const listed = service.list("wechat");
  assert.equal(listed.available, true);
  assert.equal(listed.conversations[0].id, "group-id-1");
  const saved = service.saveBindings({ appType: "wechat", bindings: [{ conversationId: "group-id-1", outputDirectory: output }] });
  assert.equal(saved.bindings.length, 1);
  assert.equal(service.getBindings("wechat").bindings[0].outputDirectory, output);
});

test("only an exact indexed file path with a binding is high-confidence", () => {
  const home = tempDirectory();
  const runtime = path.join(home, "runtime");
  const output = path.join(home, "exports");
  const source = path.join(home, "Downloads", "资料.pdf");
  fs.mkdirSync(output, { recursive: true });
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(runtime, { recursive: true });
  fs.writeFileSync(path.join(runtime, "file-archive-conversations-catalog.json"), JSON.stringify({
    wechat: [{ id: "contact-id-1", name: "测试联系人", type: "direct" }],
  }));
  fs.writeFileSync(path.join(runtime, "file-archive-source-index.json"), JSON.stringify([{
    filePath: source,
    conversationId: "contact-id-1",
    conversationName: "测试联系人",
  }]));
  const service = createFileArchiveConversationService({ runtimeDirectory: runtime, homeDir: home, platform: "darwin" });
  assert.equal(service.resolveDownloadedFile({ appType: "wechat", filePath: source }).confidence, "low");
  service.saveBindings({ appType: "wechat", bindings: [{ conversationId: "contact-id-1", outputDirectory: output }] });
  const resolved = service.resolveDownloadedFile({ appType: "wechat", filePath: source });
  assert.equal(resolved.confidence, "high");
  assert.equal(resolved.outputDirectory, output);
  assert.equal(service.resolveDownloadedFile({ appType: "wechat", filePath: `${source}.renamed` }), null);
});
