# 安居客数据模块继续开发方案

日期：2026-10-01

## 当前基线

- 权威开发工作区：`/Users/zer0y/Projects/tianyuan-browser-workbench-audit-20260930`
- 基线提交：`61cbbec0a08c5ce684575c90b251a0f9e65fc2fb`（与 `origin/main` 一致）
- 产品版本：`0.14.31` / build `2026100101`
- 基线验证：安居客专项 `6/6`、全量质量检查 `128/128` 通过。
- 当前模块已具备：侧栏入口、当前标签页列表发现、逐详情页读取、验证码等待、A-W Excel、CSV/JSON、HTML 证据目录、简易结果页和地图。

## 已确认缺口

1. 当前页面结构只有“抓取设置—输出位置—结果”，没有按阿里司法拍卖模块拆分“参数确认—网络抓取—结果”，也没有暂停、终止和清晰的候选/成功/跳过/验证阻断状态。
2. 当前标签页详情读取只传回正文文本，没有传回真实 `documentElement.outerHTML`；因此所谓原始 HTML 在该路径下实际是合成快照。
3. skill 要求每个候选案例保留 `detail_url`、`case_type`、`capture_status`；当前 CSV/JSON 仅保存成功案例，并使用 `source_url`，验证码/非案例/解析失败没有逐条证据记录。
4. A-W Excel 的公式和格式已实现，但 CSV/JSON 的 22 字段契约、出售/租赁扩展字段、字段来源和缺失值验证还不完整；区域位置、租赁字段和页面标签解析仍偏弱。
5. 当前地图依赖远程 Leaflet 与 OpenStreetMap，未复用阿里司法拍卖已验证的本地地图资产、底图切换、未定位清单和结果页交互。
6. 当前抓取循环在侧栏进程中导航当前标签页，但没有暂停/终止控制，也没有在恢复列表页后等待完成并回读。

## 本轮实施范围

### 1. 界面与流程对齐阿里司法拍卖

- 保持安居客业务参数，但页面分为：检索参数、输出位置、网络抓取、抓取结果。
- 增加“确认并应用参数”门禁；参数修改后必须重新确认，未确认不得开始。
- 网络抓取区提供“打开安居客”“导入当前网址”“开始网络抓取”。
- 结果区提供结果页、Excel、CSV、地图、原始证据目录、暂停、继续、终止、清空。
- 进度展示候选、有效、跳过、验证阻断四类计数；窄侧栏布局、按钮层级和提示语参考阿里司法拍卖。

### 2. 按 skill 固化数据与证据契约

- 每个候选都生成机器可读记录，至少包含 `detail_url`、`case_type`、`capture_status` 和安全错误码。
- 成功案例完整输出 A-W 对应字段；页面未提供的字段显式为 `null`，不省略键。
- 出售案例保留 `total_price_text`、`sale_unit_price_text`；租赁案例保留 `rent_total_text`、`rent_unit_price_text`、`rent_pricing_basis`、`payment_terms_text`。
- Excel 继续强制 H 列公式、L 列文本格式和 R 列 HYPERLINK；CSV/JSON 增加字段契约测试。
- 当前标签页路径保存真实详情页 HTML；证据索引记录成功、非案例、验证阻断、读取失败，不用合成 HTML 冒充原始页面。

### 3. 抓取稳定性与可控性

- 维持同一已登录标签页，不新建第二个用户浏览器会话。
- 候选链接规范化、去重、过滤推荐链接；逐详情页限速。
- 支持暂停/继续/终止；终止后保留已完成证据和部分结果，不假报完整成功。
- 验证码等待超时后记录 `blocked_verification`，允许继续处理后续候选；最终明确完整、部分完成或失败。
- 无论成功、失败或终止，都尝试恢复原列表页并等待加载完成；恢复失败单独报告。

### 4. 结果页与地图复用成熟能力

- 结果页提供可筛选案例表、来源链接、状态和证据链接，出售/租赁字段按类型显示。
- 地图复用阿里拍卖本地 Leaflet 资产和稳定底图配置；不得继续依赖远程 Leaflet CDN。
- 明确区分已定位和未定位案例；本轮只使用页面明确坐标，不自动猜测坐标。
- 生成地图失败不能抹掉已抓取的 CSV/JSON/Excel/HTML 证据，但结果必须标注降级状态。

### 5. 验证与交付门禁

- 扩充安居客专项测试：字段契约、原始 HTML、验证码阻断、部分完成、暂停/终止、列表页恢复、路径安全、本地地图资产与 UI 参数门禁。
- 运行安居客专项测试、全量 `scripts/quality-check.sh`、JS/Python 语法检查和 `git diff --check`。
- 用离线夹具完成侧栏窄宽视觉检查；没有真实登录页面证据时，不宣称真实安居客站点验收完成。
- 本轮不发布、不推送、不覆盖本机运行副本；主会话验收通过后再决定部署。

## 非本轮范围

- 不绕过验证码，不保存 Cookie、Authorization、密码、验证码或 token。
- 不向天源系统或任何外部系统写入案例数据。
- 不自动地理编码缺失坐标，不把推测位置冒充页面证据。
- 不发布版本、GitHub Release 或 Gitee 更新包。

## 实施记录（2026-10-01 本轮完成）

### 改动清单

- `extension/src/modules/anjuke-property/template.js`：页面拆分为检索参数（含"确认并应用参数"门禁与关键词参数）、输出位置、网络抓取（打开安居客/导入当前网址/开始网络抓取）、抓取结果（暂停/继续/终止与四类计数）四段。
- `extension/src/modules/anjuke-property/module.js`：新增 `appliedConfig` 参数应用门禁（参数改动后必须重新应用）；`runControl` 暂停/继续/终止控制；详情读取改为 `readDetailOutcome` 逐候选返回 `ok / blocked_verification / not_case / read_failed`，验证阻断超时后不再中断而是继续后续候选；`readAnjukeDetailTab` 传回真实 `documentElement.outerHTML`；每次抓取结束（含终止与异常路径）恢复列表页并回读 `restoreStatus`；进度显示候选/有效/跳过/验证阻断四类计数。
- `extension/src/modules/anjuke-property/styles.css`：新增网络抓取段、关键词字段与窄屏样式。
- `native-helper/anjuke-property.js`：规范化 `candidateOutcomes`（状态白名单、非法网址剔除、凭据脱敏与长度上限）、`runStatus/restoreStatus` 白名单，新增 `mapAssetsDir()` 解析本地地图资产目录。
- `native-helper/native_host.js`：`run_anjuke_property` 启动 Python 前注入 `mapAssetsDir`（仅本地模块注入，不来自扩展消息）。
- `skills/anjuke-property-case-fetcher/scripts/fetch_anjuke_property_cases.py`：`run_captured_request` 重写为候选证据契约——每个候选写入 `evidence.json`（`detail_url`、`case_type`、`capture_status`、`error_code`、证据文件），原始 HTML 按状态归档到 `html/`，删除合成 HTML 快照伪装；成功案例重编连续序号后写 CSV/JSON/Excel（H 列公式、L 列文本格式、R 列 HYPERLINK 保持）；结果页增加运行状态横幅、候选证据索引表与地图状态说明；地图改为复制本地 `native-helper/map-assets` 资产并内嵌 ArcGIS→高德→OSM 底图回退链，资产缺失时显式降级（不生成地图、标注降级、其余输出保留）；结果负载新增 `status/candidateCount/blockedVerificationCount/skippedInvalidCount/readFailureCount/restoreStatus/evidencePath/mapGeneration`；旧 `capturedPages` 入参兼容转换。
- `tests/anjuke-property-module.test.cjs`：契约更新为四段式 UI、参数门禁、暂停/终止、候选状态、elementMap 与模板/侧栏 id 交叉校验、Python 证据函数与"无 unpkg 依赖"断言。
- `tests/anjuke-property-capture-contract.test.cjs`（新增）：离线夹具驱动 `run_captured_request`，覆盖混合候选部分完成、全部成功 complete 与 Excel 公式契约、全部非案例保留证据、stopped 状态、本地地图资产与降级、Helper 规范化六类场景。

### 验证与门禁

- 安居客专项：`node --test tests/anjuke-property-module.test.cjs tests/anjuke-property-capture-contract.test.cjs` 12/12 通过。
- 全量质量门禁：`bash scripts/quality-check.sh` 134/134 通过（含 JS 语法全检、`git diff --check`、凭据扫描；基线 128 项 + 本轮新增 6 项）。运行时工作树内另含并行会话对折旧摊销模块的未提交改动，全量门禁是在合并工作树上通过的。
- 离线视觉夹具：以侧栏样式渲染模块模板，380px 与 700px 全页截图见 `docs/test-evidence/2026-10-01-anjuke-continuation/`；四段布局、徽标、按钮层级、进度四计数渲染正常。
- Python 语法：`python3 -m py_compile` 通过。

### 边界（如实保留）

- 未做真实安居客站点端到端验收；当前标签页采集、验证码人工等待与恢复列表页逻辑需用户在真实登录会话中确认。
- 本轮未部署到本机运行副本（`~/.tianyuan-workbench/projects/天源评估系统/`），未发布、未推送；主会话验收通过后再决定部署与版本号。
- 地图瓦片仍来自公共底图服务（ArcGIS/高德/OSM），Leaflet 库本身已完全本地化。
