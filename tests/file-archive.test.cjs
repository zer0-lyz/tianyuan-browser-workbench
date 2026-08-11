const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  FileArchiveDaemon,
  collectFiles,
  detectApplications,
  waitForStableFile,
} = require("../native-helper/file-archive.js");

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-file-archive-"));
}

test("detects WeChat completed file roots without scanning the whole container", () => {
  const home = tempDirectory();
  const root = path.join(home, "Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/account/msg/file/2026-08");
  fs.mkdirSync(root, { recursive: true });
  const result = detectApplications({ homeDir: home, platform: "darwin" });
  assert.equal(result.ok, true);
  assert.equal(result.applications.wechat.fileRoots.length, 1);
  assert.equal(result.applications.wechat.sourceMatching, "unavailable");
  assert.match(result.limitation, /来源未知/);
});

test("collects supported files and ignores partial downloads", () => {
  const root = tempDirectory();
  fs.writeFileSync(path.join(root, "资料.pdf"), "ok");
  fs.writeFileSync(path.join(root, "下载中.pdf.part"), "partial");
  fs.writeFileSync(path.join(root, "忽略.exe"), "binary");
  assert.deepEqual(collectFiles(root).map((item) => path.basename(item)), ["资料.pdf"]);
});

test("waits for a file to become stable before processing", async () => {
  const root = tempDirectory();
  const filePath = path.join(root, "中文 文件.txt");
  fs.writeFileSync(filePath, "stable");
  const stat = await waitForStableFile(filePath, { stableMs: 20, pollMs: 5 });
  assert.equal(stat.size, 6);
});

test("copies unknown-source files into a review directory and verifies SHA-256", async () => {
  const root = tempDirectory();
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  const runtime = path.join(root, "runtime");
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  const filePath = path.join(source, "合同 (测试).pdf");
  fs.writeFileSync(filePath, "archive-test");
  const daemon = new FileArchiveDaemon({
    runtimeDirectory: runtime,
    platform: "darwin",
    config: {
      sourceApp: "wechat",
      outputDirectory: output,
      directoryMode: "by_app_date",
      stableSeconds: 0.02,
    },
    detector: () => ({
      applications: {
        wechat: { installed: true, fileRoots: [source], sourceMatching: "unavailable" },
      },
      limitation: "unknown source",
    }),
  });
  await daemon.processFile(filePath);
  const exported = collectFiles(output, [], { maxDepth: 6 });
  assert.equal(exported.length, 1);
  assert.equal(fs.readFileSync(exported[0], "utf8"), "archive-test");
  assert.equal(daemon.state.counts.completed, 1);
  assert.equal(daemon.state.counts.unknownSource, 1);
  await daemon.processFile(filePath);
  assert.equal(daemon.state.counts.skipped, 1);
});

test("refuses an export directory inside a monitored source root", async () => {
  const root = tempDirectory();
  const source = path.join(root, "source");
  const output = path.join(source, "out");
  fs.mkdirSync(output, { recursive: true });
  const daemon = new FileArchiveDaemon({
    runtimeDirectory: path.join(root, "runtime"),
    platform: "darwin",
    config: { sourceApp: "wechat", outputDirectory: output },
    detector: () => ({ applications: { wechat: { installed: true, fileRoots: [source], sourceMatching: "unavailable" } } }),
  });
  await assert.rejects(() => daemon.start(), /ARCHIVE_OUTPUT_MUST_NOT_BE_INSIDE_SOURCE/);
});
