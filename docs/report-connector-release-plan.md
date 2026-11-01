# Report Connector v0.14.35 发布准备计划

**状态：源码候选代码回归门禁通过；legacy 无证据只读续验自动回归通过；实机验收部分通过；`0.14.35` 平台资产未发布。** 源码回归通过不代表报告写作实机全验收通过。

## 版本与源码身份

- 版本：`0.14.35`；build：`2026110101`；扩展清单和版本元数据须一致。
- 回归证据：最终全量 `403/395/0/8`；结构 / adapter / pipeline 专项 `163/163`，Windows handoff 专项 `1/1`。条件 skip 不计为 pass。
- 当前候选 fingerprint：`b2c3e0fe814d7cb0ae6ecbe92822201bdc8affd295b05d4d684c5a92bf6df50b`。最终源码 commit SHA 以 `v0.14.35` tag 实际指向的 commit 为准；不记录推测值。
- 保留 `.34` 的 CLI 可选依赖与 Windows 更新/解压修复；不得把旧包改名作为 `.35` 包。

## 后续门禁

1. 最终全量 Node 回归 `403/395/0/8` 通过。按授权提交、推送 feature 并创建 PR；CI 通过后合并。最终源码 SHA 从 `v0.14.35` tag 实际读取。源码门禁不代表报告写作实机全通过。
2. 匿名化文档不得包含真实报告、公司或节点标识、报告正文、哈希值或本机私有路径。
3. 冻结候选 pending 测试只使用稳定合成 fixture；不向公开文档或 Git 历史写入真实标识或运行态数据。
4. 安装器测试覆盖 pending/snapshot 相关文件的备份、必需文件与 root runtime 复制。legacy 无 `partialReadbackEvidence` 形态的严格只读兼容与 fresh-evidence partial 归档自动回归已通过；真实 journal 只读兼容入口可读且未被修改。不得清理、重写或重提保存。
5. 最终全量 `403/395/0/8`、结构 / adapter / pipeline 专项 `163/163` 通过；条件 skip 不计为通过。已通过设置编号“否”→“是”及刷新持久化、冷启动设置打开、自动重载后的绑定恢复。当前实机新增空子节点已持久化但标题未写；保留 `titlePending`，须 fresh 完整 scope 与空只读模型证据后才能 partial 归档。标题激活、同级新增、删除及四种格式完整真实闭环仍待验收。
6. Mac 与 Windows 平台包分别由对应平台完成构建和验收；不得在 Mac 制作 Windows 包。
7. `generate-update-manifest.mjs` 仅按输出目录中现存文件列资产，不验证验收结论。清单只可引用已存在且已验收资产；当前不发布 `.35` 平台资产，不声称自动更新可发现。
8. Windows Codex 在最终 commit 上制作、验收并交付 Windows 包。源码门禁与平台资产门禁分开记录。

## 当前集成范围与后续 allowlist

- 已叠加 Singer 冻结的 18 个 payload 文件：`extension/src/content/content.js`、`extension/src/injected/page_adapter.js`、`extension/src/injected/report_adapter.js`、`extension/src/sidepanel/sidepanel.js`、`extension/src/sidepanel/report-result.mjs`、`native-helper/connector_bridge.js`、`native-helper/report-pending.js`、`native-helper/report-snapshot.js`、`plugins/tianyuan-browser-connector/runtime/apps/shared/client.mjs`、`tests/helpers/report-page-fixture.cjs`、`tests/report-authoring-adapter-v2.test.cjs`、`tests/report-authoring-bridge.test.cjs`、`tests/report-authoring-extension.test.cjs`、`tests/report-authoring-pending.test.cjs`、`tests/report-authoring-pipeline.test.cjs`、`tests/report-authoring-result.test.mjs`、`tests/report-authoring-runtime.test.mjs`、`tests/report-authoring-sidepanel-extension.test.cjs`。
- 稳定增补：`extension/src/core/connector-session-recovery.mjs`、`extension/src/core/runtime-reload.mjs`、`tests/runtime-reload.test.mjs`、Euclid 修复后的 `tests/report-authoring-inspect.test.cjs`（`7/7` 通过），以及 `tests/static-extension-contract.test.cjs` 的 session-recovery 断言；`extension/manifest.json` 仅加入 `report_adapter.js` 到 `web_accessible_resources`，保留 `.35` 版本。
- 安装器清单包含 pending/snapshot 相关模块的备份、必需文件与 root runtime 定点复制，并有隔离安装测试。文档中的测试状态不授权清理或改写运行态 journal。
- 排除 source 原始私有文档正文、`tests/land-publicity-strict.test.cjs`、凭据/机器配置/真实报告与节点标识/正文/私有 hash/生成态快照。集成树 `docs/report-authoring-connector.md` 仅为匿名新文档，不复制源文历史段落。

## Mac 运行时依赖核对

`install-local-runtime.mjs` 的 Python 探测需要 `requests`、`urllib3`、`certifi`、`charset_normalizer`、`idna`、`docx`、`et_xmlfile`、`lxml`、`openpyxl>=3.1.5`、`typing_extensions`。Mac 完整/轻量构建脚本现均固定并打包五个 HTTP 依赖：`requests==2.32.5`、`urllib3==2.6.3`、`certifi==2026.10.23`、`charset-normalizer==3.5.2`、`idna==3.20`；下载参数强制 `--platform any --implementation py --abi none --python-version 39 --no-deps`，缓存文件标签均为 `py3-none-any`，wheel 元数据允许 Python 3.9。另保留 `openpyxl==3.1.5`、`et_xmlfile==2.0.0`、`python-docx==1.2.0`、`typing_extensions==4.16.0`；完整包还携带匹配平台的 `lxml==6.1.0` wheel，轻量包沿用既有运行环境复用及 pinned lxml 获取流程。

已完成缓存 wheel 的 Python 3.9 离线导入检查（不安装到用户环境）；当前 macOS runtime contract、lite package、安装报告和 launcher 定点测试为 `4/4` 通过。该结果不替代最终完整/轻量发布包安装验收；尚未制作 `.35` 发布包。

## 当前真实验收状态

- 设置编号变更与刷新持久化：`PASSED`；冷启动设置打开：`PASSED`；自动重载绑定恢复：`PASSED`。
- 空子节点已持久化但标题未写；旧 journal 缺少 `partialReadbackEvidence`。严格 legacy 只读兼容自动回归通过，真实 journal 已确认只读可读且未更改；后续 partial 归档须 fresh 完整 scope 与空只读模型证据，`titlePending` 保持不动。
- 标题激活、同级新增、删除、四种格式完整真实闭环：`PENDING`。
- 当前候选 fingerprint：`b2c3e0fe814d7cb0ae6ecbe92822201bdc8affd295b05d4d684c5a92bf6df50b`；最终 commit SHA 以 `v0.14.35` tag 实际目标为准。`.35` 平台资产尚未发布，自动更新发现：`NOT CLAIMED`。
- 不将 15 条接受检查与 9 条命令枚举表述为 24 条实机支持；不宣称报告写作实机全通过。
