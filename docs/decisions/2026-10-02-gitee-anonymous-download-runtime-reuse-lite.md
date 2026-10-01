# 2026-10-02 Gitee 匿名下载修复：macOS 轻量包复用运行环境（v0.14.32）

## 背景

v0.14.31 的 Gitee 轻量更新主通道中，macOS 包 `tianyuan-workbench-v0.14.31-macos-arm64-lite.zip`（18,342,809 字节）匿名 raw 下载返回 HTTP 403 `large file require login for access`，Windows 包（5,380,935 字节）匿名可完整下载。Gitee raw 匿名访问对大文件有强制登录限制（实测阈值在 5.13 MiB 与 17.49 MiB 之间，8.16 MiB 的 lxml wheel 实测可通过）。普通用户不登录 Gitee，因此 macOS 主通道不成立。

## 备选方案对比

1. **Gitee Release 附件直链**（`releases/download/<tag>/<附件ID>/<文件名>`）：匿名可下载、初始域名在更新器白名单内。但上传附件必须使用 Gitee 网页会话或 API token；本机无法在无人交互的情况下完成网页上传（IAB 自动化不支持文件选择、用户 Chrome 无 CDP、AppleScript 控制等待系统授权），且任务禁止读取/保存任何 token。保留为清单生成器的逃生通道（`TIANYUAN_GITEE_ASSET_URL_MAP`）。
2. **复用已安装运行环境、把包压到 raw 限制以内**（本方案，任务书明确许可）：轻量包本就只服务已安装用户，其托管 venv 通常依赖完整；两个 universal2 lxml wheel（约 17.1 MB）占包体 93%。
3. 分片包：旧更新器无法直接使用，违反约束，排除。
4. 第三方 CDN/OSS：更新器下载白名单只允许 gitee.com / raw.giteeusercontent.com / github.com / api.github.com / objects.githubusercontent.com / release-assets.githubusercontent.com，当前存量更新器无法使用其他域名，排除。

## 决策

采用方案 2，v0.14.32 起生效：

- **包体**：macOS lite 包不再捆绑两个 universal2 lxml wheel（cp39/cp314），只捆绑纯 Python wheel（openpyxl/et_xmlfile/python-docx/typing_extensions，约 0.55 MB）与新增的 `runtime/python-wheels/lxml-wheels.json`（记录每个 wheel 的文件名、大小、SHA-256、Gitee raw 与 GitHub Release 两条下载 URL）。包体从 18,342,873 字节降到约 1.2 MB。
- **安装器（`release/macos-arm64/安装.command`）**：
  - 托管 venv（`~/.tianyuan-workbench/python`）依赖完整（`import docx, et_xmlfile, lxml, openpyxl, typing_extensions` 全部成功）→ 完全离线复用，不产生任何下载（存量用户的主路径）。
  - 环境不完整 → 按 manifest 中的固定 SHA-256 拉取与 venv ABI 匹配的 lxml wheel：Gitee raw 主通道、GitHub Release 备用，`shasum -a 256` 校验通过才接受，并清除 quarantine。
  - 两条通道都失败 → `UPDATE_LXML_WHEEL_UNAVAILABLE` 结构化失败，当前版本不变，提示检查网络或改用完整安装包。
- **ABI 兼容性不缩水**：仍强制支持 CPython 3.9 与 3.14（`MACOS_PYTHON_TARGETS="39 314"`，包内 manifest 两个 ABI 都必须有 pinned 条目，专项测试断言）；安装器仍强制 arm64，因此 universal2 的 x86_64 切片对轻量包本就不可达，无兼容性损失。完整 macOS 包继续捆绑全部 wheel，供全新机器离线安装。
- **发布资产**：两个 lxml wheel（约 8.16 MiB，实测 Gitee raw 匿名 200）作为 v0.14.32 资产同时发布到 GitHub Release 与 Gitee master raw，供补齐路径使用。
- **清单生成器**：新增 `TIANYUAN_GITEE_ASSET_URL_MAP`（文件名 → Gitee Release 附件真实直链），未映射文件保持 base 拼接；本版未使用该映射，作为未来大文件的逃生通道保留并有专项测试。

## 兼容性核对

- 旧更新器（0.14.30/0.14.31）：manifest schema 未变（schemaVersion 1、`downloadCandidates`、Gitee priority 1 + GitHub Release/API 备用），下载域名仍在白名单内；包内 `validatePackage` 必需文件不含 wheel。旧更新器可直接识别并安装新包。
- `tests/macos-lite-release.test.cjs`、`tests/macos-python-runtime.test.cjs` 改为断言“不捆绑 wheel + manifest 存在 + 双 ABI pinned + 安装器复用/补齐逻辑”。`native-helper/platform/macos.js` 预检本就不依赖包内 wheel 文件，无需修改。

## 边界

- 环境不完整且双通道都不可达时，更新会以结构化错误安全失败（版本不变），这是“缺少依赖时安全回退”的落点：不会静默安装残缺环境。
- Gitee raw 对约 8.16 MiB wheel 的匿名放行是 2026-10-02 实测结论，Gitee 若调整阈值，补齐路径仍有 GitHub 备用；包体本身约 1.2 MB，远低于任何已观测阈值。
