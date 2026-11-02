# Windows Codex 打包发布交接 — v0.14.35

**状态：源码候选代码回归门禁通过；legacy 无证据只读续验自动回归已通过；实机验收部分通过；`0.14.35` 平台资产未发布。** 本文区分代码门禁与真实报告页验收，不代表报告写作功能全通过。

## 版本与源码身份

- 产品 / Chrome 扩展版本：`0.14.35`；构建号：`2026110101`。
- 最终全量 Node 回归：`403 tests / 395 pass / 0 fail / 8 conditional skip`；结构 / adapter / pipeline 专项 `163/163`，Windows handoff 专项 `1/1`。条件 skip 不计为 pass。
- 当前候选 `runtimeBuildId` / fingerprint：`b2c3e0fe814d7cb0ae6ecbe92822201bdc8affd295b05d4d684c5a92bf6df50b`。最终源码 commit SHA 以 `v0.14.35` tag 实际指向的 commit 为准；不在 tag 创建前推测或预填 SHA。Windows 包必须基于 tag 指向的最终 commit 构建。
- 继承并保留 `.34` 的 CLI 可选依赖与 Windows 更新/解压修复。不得拿 `.34` 包改名充当 `.35`。

## 运行环境与包要求

- Windows 真机：Windows 10/11 x64；分别验收 Chrome 与 Edge。完整包目标名：`tianyuan-workbench-v0.14.35-windows-x64.zip`；轻量包目标名：`tianyuan-workbench-v0.14.35-windows-x64-lite.zip`，各自附 `.sha256`。
- 当前 Windows 构建参考固定 Node.js `24.14.0`、嵌入式 Python `3.14.6`；Python 依赖为 `openpyxl==3.1.5`、`et_xmlfile==2.0.0`、`python-docx==1.2.0`、`typing_extensions==4.16.0`、`lxml==6.1.0`、`requests==2.34.2`、`urllib3==2.8.0`、`certifi==2026.7.22`、`charset-normalizer==3.5.1`、`idna==3.20`。安装器会探测这些模块；须用包内 Python 实际导入回读。
- 完整包须含 `TianyuanWorkbench` 根、完整 `native-helper/`、扩展、skills、plugins、安装脚本、Native Messaging/Connector Bridge、Node/Python 运行时及 wheels、`native_host.exe`、运行指纹和包内 `SHA256SUMS`。轻量包只用于已有运行时升级，不得冒充首次安装包。
- 天源 CLI 是用户可选外部依赖；不捆绑 CLI 或安装器，缺失不得阻断核心安装。
- 若报告 patch 新增 `native-helper/report-structure-pending.js`，合入后必须同时核查 `scripts/install-local-runtime.mjs` 的 Native Helper 备份、必需文件及定点复制列表，并加入安装器测试；仅 Windows ZIP 复制完整目录不代表 root runtime 已纳入。
- ZIP 内层根目录为 `TianyuanWorkbench`；使用短暂存目录，最长解压目标路径不超过 240 字符。禁止关闭 Defender、SmartScreen、校验或路径安全检查。

## 验收边界

- Mac 仅按既有 macOS 完整/轻量流程制作、验证 Mac 包；Mac 不制作 Windows 包。完整包当前参考 Node.js `22.23.4`、Python `3.14.6`，并打包 pinned `openpyxl==3.1.5`、`et_xmlfile==2.0.0`、`python-docx==1.2.0`、`typing_extensions==4.16.0` 与 `lxml==6.1.0` 的适用 wheel。完整/轻量包均固定并携带 `requests==2.32.5`、`urllib3==2.6.3`、`certifi==2026.10.23`、`charset-normalizer==3.5.2`、`idna==3.20` 五个 `py3-none-any` wheel；构建按 Python 3.9 通用 wheel 标签下载，缓存 wheel 已通过 Python 3.9 离线导入检查。轻量包仍复用已安装运行环境并沿用 pinned lxml 获取流程。定点测试不代替最终包的干净机安装验收，`.35` Mac 包尚未制作；Windows 包仍由 Windows Codex 处理。
- Windows Codex 在固定最终 SHA 上制作完整/轻量包，验证首次安装、`.34` 到 `.35` 升级、Native Host/Messaging、Connector Bridge、Codex 插件缓存、Python 依赖、Chrome/Edge 重载与只读状态；CLI 单独报告，不作为核心安装成功的前置条件。
- `scripts/generate-update-manifest.mjs` 只按输出目录中的包文件生成资产，不验证真机验收。若未提供 `.35` Windows ZIP，清单应不含 `assets.windows-x64`；隔离输出目录只放已验 Mac `.35` 包，避免误拾取其他候选。绝不使用 `.34` 文件标成 `.35`。源码版本变化本身不代表自动更新可发现。
- 当前代码证据为全量 `403 tests / 395 pass / 0 fail / 8 conditional skip`、结构 / adapter / pipeline 专项 `163/163` 及 Windows handoff 专项 `1/1`。这些结果不替代 Windows 包验收或完整实机报告页验收。
- 已通过的实机边界：设置编号“否”→“是”及刷新持久化、冷启动设置打开、自动重载后的绑定恢复。
- 当前结构实机状态：新增空子节点已持久化但标题未写；旧 journal 缺少 `partialReadbackEvidence`。新 helper 的精确 legacy 只读兼容入口已验证可读，自动回归通过；真实 journal 未修改，仍须 fresh 完整 scope 与空只读模型证据后才能 partial 归档。保留 `titlePending`，不得清理 journal 或重提保存。
- 结构标题激活、同级新增、删除及四种格式的完整真实执行—保存—刷新—回读仍待验收。不得宣称报告写作实机全通过；15 条接受检查与 9 条枚举不等于 24 条已支持。

## 执行与上传（源码门禁与资产门禁分离）

1. macOS 主线负责开发并推送源码；主 Codex 按已通过的代码回归门禁完成 GitHub 合并与升版，锁定最终 commit 后填写最终 SHA 与 `runtimeBuildId`。源码门禁通过不代表完整实机验收通过。
2. Windows Codex 仅基于最终 commit 在 Windows x64 机制作完整 / 轻量包；核对包清单、内层根、最终源码身份，并通过完整包内的 `install-agent.cmd` 自动安装验收入口实际验证首次安装与 `.34` 到 `.35` 升级。
3. Windows Codex 分别验收 Chrome 与 Edge 的 Native Host/Messaging、Connector Bridge、插件缓存、Python 依赖及重载状态；记录失败、条件跳过与未测试项，不能以 macOS 测试替代。
4. Windows 专机验收通过后，由 Windows Codex 使用 `gh release upload` 上传包、校验清单及交接材料（本次不执行）。当前不发布 `.35` 平台资产，不声称自动更新已可发现；更新清单只可列出已存在且已验收的资产。

回传最终提交 SHA、`runtimeBuildId`、包名与校验结果、Chrome/Edge 安装与升级证据、依赖导入结果及公开清单回读。最终 commit SHA 从 `v0.14.35` tag 的目标 commit 实际读取；当前锁定候选 fingerprint 为 `b2c3e0fe814d7cb0ae6ecbe92822201bdc8affd295b05d4d684c5a92bf6df50b`。不记录真实报告、节点标识、正文、私有 hash 或机器私有路径。
