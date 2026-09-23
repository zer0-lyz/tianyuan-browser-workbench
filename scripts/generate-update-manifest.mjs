#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeRuntimeBuildId } from "./runtime-fingerprint.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workbenchRoot = process.env.TIANYUAN_WORKBENCH_ROOT
  || path.join(os.homedir(), ".tianyuan-workbench");
const distRoot = process.env.TIANYUAN_RELEASE_OUTPUT_DIR
  || path.join(workbenchRoot, "releases");
const releaseBaseUrl = String(process.env.TIANYUAN_RELEASE_BASE_URL || "").trim().replace(/\/+$/, "");
const versionConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, "extension", "version.json"), "utf8"));

function sha256(targetPath) {
  return createHash("sha256").update(fs.readFileSync(targetPath)).digest("hex");
}

function releasePageUrl(baseUrl) {
  // Release assets live under /releases/download/<tag>/, but the release page
  // that the extension opens lives at /releases/tag/<tag>. Keep asset URLs on
  // the download path and point releaseUrl at the browsable page.
  return String(baseUrl).replace("/releases/download/", "/releases/tag/");
}

function runtimeBuildId() {
  return computeRuntimeBuildId(repoRoot);
}

function sourceCommit() {
  return String(execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })).trim();
}

function findPackage(patterns, targetFileName, { includeLite = null } = {}) {
  if (!fs.existsSync(distRoot)) return null;
  const allCandidates = fs.readdirSync(distRoot)
    .filter((name) => {
      const lowerName = name.toLowerCase();
      if (!name.endsWith(".zip")) return false;
      if (!name.includes(`v${versionConfig.productVersion}`)) return false;
      if (!patterns.some((pattern) => lowerName.includes(pattern))) return false;
      if (includeLite === true && !lowerName.includes("-lite")) return false;
      if (includeLite === false && lowerName.includes("-lite")) return false;
      return true;
    });
  const sourceCandidates = allCandidates.filter((name) => name !== targetFileName);
  const candidates = (sourceCandidates.length ? sourceCandidates : allCandidates)
    .sort((left, right) => {
      const leftMtime = fs.statSync(path.join(distRoot, left)).mtimeMs;
      const rightMtime = fs.statSync(path.join(distRoot, right)).mtimeMs;
      if (leftMtime !== rightMtime) return rightMtime - leftMtime;
      return right.localeCompare(left);
    });
  if (!candidates.length) return null;
  const fileName = candidates[0];
  const targetPath = path.join(distRoot, fileName);
  return {
    fileName,
    sha256: sha256(targetPath),
    size: fs.statSync(targetPath).size,
  };
}

function releaseAsset(patterns, key, options = {}) {
  // In lite mode the canonical copy holds lite content; name it with the -lite
  // suffix so the release page never offers lite bytes under a full-package name.
  const liteSuffix = options.includeLite === true ? "-lite" : "";
  const fileName = `tianyuan-workbench-v${versionConfig.productVersion}-${key}${liteSuffix}.zip`;
  const source = findPackage(patterns, fileName, options);
  if (!source) return null;
  const targetPath = path.join(distRoot, fileName);
  const sourcePath = path.join(distRoot, source.fileName);
  if (path.resolve(sourcePath) !== path.resolve(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }
  const digest = sha256(targetPath);
  fs.writeFileSync(path.join(distRoot, `${fileName}.sha256`), `${digest}  ${fileName}\n`);
  return {
    fileName,
    ...(releaseBaseUrl ? { url: `${releaseBaseUrl}/${encodeURIComponent(fileName)}` } : {}),
    sha256: digest,
    size: fs.statSync(targetPath).size,
  };
}

const assets = {};
const windowsHandoffFileName = "WINDOWS_CODEX_HANDOFF.md";
const commit = sourceCommit();
const windowsPackageMode = String(process.env.TIANYUAN_WINDOWS_PACKAGE_MODE || "full").trim().toLowerCase();
const windows = releaseAsset(["windows-x64"], "windows-x64", {
  includeLite: windowsPackageMode === "lite" ? true : false,
});
const macosPackageMode = String(process.env.TIANYUAN_MACOS_PACKAGE_MODE || "full").trim().toLowerCase();
const macos = releaseAsset(["macos-arm64", "macos-apple"], "macos-arm64", {
  includeLite: macosPackageMode === "lite" ? true : false,
});
if (windows) assets["windows-x64"] = windows;
if (macos) assets["macos-arm64"] = macos;

const payload = {
  schemaVersion: 1,
  repository: versionConfig.repository,
  ...(releaseBaseUrl ? { source: "static-manifest", releaseUrl: releasePageUrl(releaseBaseUrl) } : {}),
  productVersion: versionConfig.productVersion,
  chromeVersion: versionConfig.chromeVersion,
  channel: versionConfig.channel,
  buildNumber: versionConfig.buildNumber,
  publishedAt: new Date().toISOString(),
  minimumSupportedVersion: versionConfig.minimumSupportedVersion,
  bridgeProtocol: versionConfig.bridgeProtocol,
  runtimeBuildId: runtimeBuildId(),
  runtimeBuildKind: "release",
  mandatory: Boolean(versionConfig.mandatory),
  releaseNotes: Array.isArray(versionConfig.releaseNotes) ? versionConfig.releaseNotes : [],
  assets,
  handoff: {
    windowsCodex: {
      fileName: windowsHandoffFileName,
      ...(releaseBaseUrl ? { url: `${releaseBaseUrl}/${windowsHandoffFileName}` } : {}),
      sourceRepository: "zer0-lyz/tianyuan-browser-workbench",
      sourceCommit: commit,
    },
  },
};

fs.mkdirSync(distRoot, { recursive: true });
const outputPath = path.join(distRoot, "update-manifest.json");
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
const windowsAsset = assets["windows-x64"] || null;
const releaseUrl = releaseBaseUrl
  ? releasePageUrl(releaseBaseUrl)
  : `https://github.com/${versionConfig.repository}/releases`;
const windowsHandoffPath = path.join(distRoot, windowsHandoffFileName);
const windowsFullName = `tianyuan-workbench-v${versionConfig.productVersion}-windows-x64.zip`;
const windowsLiteName = `tianyuan-workbench-v${versionConfig.productVersion}-windows-x64-lite.zip`;
const windowsHandoff = `# Windows Codex 打包发布交接 — v${versionConfig.productVersion}

本文件由发布脚本自动生成。macOS 主线只交付源码和交接要求；Windows 专机上的 Codex 负责配置 Windows 安装包、真实安装/更新验收、生成发布清单并上传 GitHub Release。

## 固定源码基线

- 产品版本：\`${versionConfig.productVersion}\`
- 构建编号：\`${versionConfig.buildNumber}\`
- 发布通道：\`${versionConfig.channel}\`
- 源码仓库：\`https://github.com/zer0-lyz/tianyuan-browser-workbench.git\`
- 源码提交：\`${commit}\`
- 源码提交页：\`https://github.com/zer0-lyz/tianyuan-browser-workbench/commit/${commit}\`
- 发布页：\`${releaseUrl}\`
- 运行指纹：\`${payload.runtimeBuildId}\`
- 完整包目标名：\`${windowsFullName}\`
- 轻量包目标名：\`${windowsLiteName}\`

## 交给 Windows Codex 的任务

请在专用 Windows 10/11 x64 电脑上实际执行，不要只给说明。不得改用其他分支、旧源码或缓存文件；不得关闭 Defender、SmartScreen、SHA-256 校验或其他安全门禁。

### 1. 固定并检查源码

1. 克隆或更新上述仓库，切换到 \`main\`，确认 \`HEAD=${commit}\`。
2. 先检查工作树；如有未提交修改，停止并报告，不得使用 \`reset --hard\`、\`git clean\` 或整树覆盖。
3. 读取 \`extension/version.json\`，确认版本、build 和本交接一致。
4. 当前 \`release/build_windows_x64*.sh\` 是 macOS 交叉打包参考脚本；Windows 上不要直接硬跑。按其文件清单配置 Windows 原生暂存和压缩流程，必要时只补 Windows 发布脚本，不改业务模块。

### 2. 配置完整安装包

1. ZIP 内层根目录固定为 \`TianyuanWorkbench\`，使用短暂存目录，例如 \`%TEMP%\TW-build\`。
2. 完整包必须包含 Extension、完整 Native Helper、skills、plugins、安装脚本、运行指纹脚本、Node.js、便携 Python、离线 Python wheels、\`native_host.exe\` 和天源 CLI 安装器。
3. Python 环境必须实际导入：\`openpyxl>=3.1.5\`、\`et_xmlfile\`、\`lxml\`、\`python-docx\`、\`typing_extensions\`。
4. \`VERSION.txt\` 必须写入产品版本、build、\`git_commit=${commit}\`、\`source_dirty=false\` 和本交接中的 \`runtime_build_id\`。
5. 完整包和轻量包都必须生成包内 \`SHA256SUMS\`；轻量包不得伪装成首次安装包。
6. 最长解压目标路径不得超过 240 个字符；发现超长条目应修复包结构，不得要求用户修改系统策略绕过。

### 3. Windows 真机验收

1. 用完整包执行 \`install-agent.cmd\`，确认不是只复制扩展，而是同步 Node.js、Python 依赖、Native Host、Native Messaging、Connector Bridge、Connector 插件、Codex 插件缓存和 CLI。
2. 读取 \`%LOCALAPPDATA%\TianyuanWorkbench\安装检查结果.json\`；Extension、Native Helper、Native Messaging、Connector、Python 依赖必须为 \`ok\`。
3. 桌面必须出现“天源工作台-浏览器扩展”入口，并能定位真实扩展目录；不要让用户进入隐藏目录查找。
4. 先测试首次安装，再从上一 build 测试“测试更新模块”和“更新全部组件”；检查下载、SHA、解压、安装、重启和版本回读。
5. Chrome/Edge 重新加载扩展后执行只读状态检查。MCP token、Cookie、Authorization、密码和验证码只能由用户本人输入，不得读取、记录或回显。

### 4. 生成发布文件

将通过验收的完整包和轻量包放到同一输出目录，文件名必须为：

- \`${windowsFullName}\`
- \`${windowsFullName}.sha256\`
- \`${windowsLiteName}\`
- \`${windowsLiteName}.sha256\`

然后在源码根目录生成最终清单和本交接文件：

\`$env:TIANYUAN_RELEASE_OUTPUT_DIR='<输出目录>'\`
\`$env:TIANYUAN_RELEASE_BASE_URL='https://github.com/${versionConfig.repository}/releases/download/v${versionConfig.productVersion}'\`
\`node scripts/generate-update-manifest.mjs\`

核对 \`update-manifest.json\` 中 build、源码 commit、运行指纹、Windows 包文件名、大小和 SHA-256 与真实文件一致。

### 5. 上传 GitHub Release

1. 确认 \`gh auth status\` 已通过；不得把 GitHub token 写入仓库、日志或交接文件。
2. 如 \`v${versionConfig.productVersion}\` 已存在，使用 \`gh release upload v${versionConfig.productVersion} ... --clobber\` 更新 Windows 资产；不存在时先创建同名 Release。
3. 必须上传完整包、轻量包、两个 SHA 文件、\`update-manifest.json\` 和 \`WINDOWS_CODEX_HANDOFF.md\`。
4. 上传后使用 \`gh release view v${versionConfig.productVersion} --json url,assets\` 回读资产，并重新下载公开的 \`update-manifest.json\`，确认 build 为 \`${versionConfig.buildNumber}\`。

## 必须回传

- Windows 和浏览器实际版本；
- 源码 commit、工作树状态、包名、文件大小和 SHA-256；
- 首次安装与旧版升级的逐项结果；
- Node.js、Python 依赖、Native Host、Connector、Codex 缓存、MCP、CLI 状态；
- 更新模块下载、解压、安装、重启和版本回读结果；
- GitHub Release URL、六个上传资产及公开回读结果；
- 失败阶段、准确错误码、脱敏日志路径和最小修复提交；
- 明确说明未读取或输出任何凭据。
`;
fs.writeFileSync(windowsHandoffPath, windowsHandoff, "utf8");
console.log(outputPath);
console.log(windowsHandoffPath);
