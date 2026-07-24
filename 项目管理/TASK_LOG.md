# 天源浏览器工作台任务日志

## 2026-07-24 01:25 CST

### 任务目标

按 WPS Connector / Codex 风格优化天源浏览器工作台侧栏界面结构和视觉样式。

### 执行动作

- 重写 `extension/src/sidepanel/styles.css`。
- 保留现有多页面功能结构、元素 ID、按钮绑定和执行逻辑。
- 首页功能入口调整为更轻量的模块卡片。
- 顶部连接状态调整为轻量状态卡。
- 工作范围、保存设置、执行日志、证据 JSON 保持清晰分层。
- 收窄功能页返回按钮，避免窄侧栏下被拉伸。

### 验证结果

- `sidepanel.js`、`content.js`、`service_worker.js`、`page_adapter.js` 语法检查通过。
- `node scripts/install-local-runtime.mjs` 执行成功，已同步本机运行目录。
- 首页 420px 离线渲染横向溢出数量为 0。
- 批量保存页 420px 离线渲染横向溢出数量为 0。
- 截图证据：
  - `docs/test-evidence/2026-07-24-sidepanel-codex-style-home.png`
  - `docs/test-evidence/2026-07-24-sidepanel-codex-style-batch-save.png`

### 后续

- 在 Chrome 扩展页重新加载本机扩展目录后，查看真实侧栏效果。
- 若真实天源页面数据填充后出现长文本拥挤，再针对公司/科目树和日志区域做局部收紧。

## 2026-07-24 01:38 CST

### 任务目标

按用户反馈，将首页功能模块从大块列表卡片改成应用图标样式，适配后续更多功能模块。

### 执行动作

- 将首页 `.module-grid` 改为应用图标宫格。
- 为 6 个功能入口分别添加本地内联 SVG 线性图标。
- 功能文字改为小号居中标签。
- 隐藏首页模块长说明，避免截断后显得杂乱；功能说明保留在进入功能页后的页面标题和设置区。
- 保持所有按钮 ID 和现有 JS 事件绑定不变。

### 验证结果

- JS 语法检查通过。
- 420px 宽首页离线渲染横向溢出数量为 0。
- 6 个模块以两行展示，模块区高度约 185px。
- 已执行 `node scripts/install-local-runtime.mjs`，同步到本机扩展运行目录。
- 截图证据：`docs/test-evidence/2026-07-24-sidepanel-app-icons-home.png`。

### 后续

- 在 Chrome 扩展管理页重新加载扩展，查看真实侧栏效果。
- 后续新增功能模块时，按同一图标宫格样式追加入口。

## 2026-07-24 01:48 CST

### 任务目标

继续优化首页图标，使其更接近 Apple / Codex 的高级小应用图标风格。

### 调研结论

- Phosphor Icons：MIT，细线、多字重，最适合参考轻量线性语言。
- Tabler Icons：MIT，图标丰富，但默认 2px 线宽更偏工程化。
- Heroicons：MIT，干净但可选语义少一些。
- Lucide：开源、简洁，但风格更偏开发工具。
- Apple SF Symbols 不作为扩展内联素材来源，避免授权边界不清。

### 执行动作

- 保留本地内联 SVG，不在运行时加载外部网络资源。
- 将图标从文字底板升级为彩色渐变圆角图标。
- 将图形调整为白色细线，增加轻微内高光和阴影。
- 保持首页模块小号文字和两行宫格布局。

### 验证结果

- JS 语法检查通过。
- 420px 宽首页离线渲染横向溢出数量为 0。
- 模块区高度约 185px。
- 已执行 `node scripts/install-local-runtime.mjs`，同步到本机扩展运行目录。
- 截图证据：`docs/test-evidence/2026-07-24-sidepanel-premium-icons-home.png`。

### 后续

- 在 Chrome 扩展管理页重新加载扩展，查看真实侧栏中的颜色和尺寸。

## 2026-07-24 01:56 CST

### 任务目标

按用户反馈，修正彩色渐变图标“色调不高级”的问题。

### 执行动作

- 去掉首页模块图标的大面积彩色渐变底板。
- 改为灰白中性玻璃感底板。
- 图标保留细线 SVG，颜色改为深灰。
- 每个模块只保留一个小号彩色状态点作为区分。
- 保持应用图标宫格布局，不恢复大列表卡片。

### 验证结果

- JS 语法检查通过。
- 420px 宽首页离线渲染横向溢出数量为 0。
- 模块区高度约 187px。
- 已执行 `node scripts/install-local-runtime.mjs`，同步到本机扩展运行目录。
- 截图证据：`docs/test-evidence/2026-07-24-sidepanel-neutral-icons-home.png`。

### 后续

- 在 Chrome 扩展页重新加载扩展，并关闭后重新打开侧栏，避免继续显示旧实例。

## 2026-07-24 02:05 CST

### 任务目标

用户反馈“图标不是还是原来的吗”，继续将图标图形本身重做，而不是只调整颜色和底板。

### 执行动作

- 将 6 个首页模块的 SVG 图形从原线性老图标改为填充式现代符号。
- 保存：改为“完成校验”符号。
- 退出编辑：改为“退出编辑/门箭头”符号。
- 导出明细表：改为“表格导出”符号。
- 导出申报表：改为“文档导出”符号。
- 两个打印格式：改为“打印任务”符号，并区分明细和申报。
- 为避免样式缓存，`manifest.json` 从 `0.6.0` 升到 `0.6.1`。
- 侧栏 CSS 引用增加 `?v=20260724-filled-symbols`。

### 验证结果

- JS 语法检查通过。
- 本机运行目录已同步。
- 已确认运行目录中的 `manifest.json` 版本为 `0.6.1`。
- 已确认运行目录中的侧栏 HTML 引用了 `styles.css?v=20260724-filled-symbols`。

### 后续

- 在 Chrome 扩展页点击重新加载，并关闭后重新打开侧栏，确保不再使用旧实例。

## 2026-07-24 02:16 CST

### 任务目标

用户指出首页图标小、状态点无意义，并追问是否有优质图标库。改用真实优质图标库风格。

### 执行动作

- 选用 Phosphor Icons Duotone 风格 SVG。
- 通过 Iconify 的 Phosphor 图标接口取得候选 SVG。
- 将 6 个首页模块图标替换为 Phosphor 风格路径。
- 移除所有模块图标右下角小圆点。
- 图标 SVG 显示尺寸放大到约 34px。
- CSS 缓存版本改为 `styles.css?v=20260724-phosphor-icons`。
- 保持本地内联 SVG，不在扩展运行时请求外部网络。

### 验证结果

- JS 语法检查通过。
- 首页 420px 离线渲染横向溢出数量为 0。
- 模块区高度约 197px。
- 图标 SVG 显示宽度约 34px。
- 小圆点数量为 0。
- 已执行 `node scripts/install-local-runtime.mjs`，同步到本机扩展运行目录。
- 已确认运行目录中侧栏 HTML 引用 `styles.css?v=20260724-phosphor-icons`。
- 已确认运行目录中存在 `ph-duotone` 图标路径。
- 截图证据：`docs/test-evidence/2026-07-24-sidepanel-phosphor-icons-home.png`。

### 后续

- 在 Chrome 扩展页重新加载扩展，并关闭后重新打开侧栏。

## 2026-07-24 02:28 CST

### 任务目标

按用户反馈优化连接配置页：操作能力做成折叠；项目和对话选择界面统一，不再使用原生系统下拉菜单。

### 执行动作

- 将 `操作能力` 改为 `details.capability-panel`，默认折叠。
- 保留能力汇总徽标，例如 `20/23 项可用`。
- 项目选择和对话选择改为面板内嵌搜索选择器。
- 原生 `connectorProjectSelect` 和 `connectorThreadSelect` 保留为内部状态，但界面隐藏。
- 补充选择器搜索、选中、清空和点击外部关闭逻辑。
- CSS 版本更新为 `styles.css?v=20260724-connector-picker`。
- 重新同步本机运行目录。

### 验证结果

- JS 语法检查通过。
- 连接配置页 420px 离线渲染横向溢出数量为 0。
- `操作能力` 默认折叠。
- 项目原生 select 显示状态为 `display:none`。
- 本机运行目录已确认包含 `connectorProjectPicker` 和新版 CSS 版本。
- 截图证据：`docs/test-evidence/2026-07-24-connector-picker-capability-collapse.png`。

### 后续

- 在 Chrome 扩展页重新加载扩展，并关闭后重新打开侧栏。

## 2026-07-24 02:38 CST

### 任务目标

用户反馈连接配置选择器中项目列表文字积压、选中态颜色太丑，继续精修选择器视觉。

### 执行动作

- 项目/对话列表项设置固定最小高度。
- 标题和路径均设置单行省略。
- 选中态从大面积蓝色改为浅色背景、细蓝边、左侧细强调线和右侧小勾。
- 打开状态的选择器按钮改为轻微蓝边和浅背景，不再重色块。
- CSS 版本更新为 `styles.css?v=20260724-picker-refine`。
- 重新同步本机运行目录。

### 验证结果

- JS 语法检查通过。
- 连接配置页项目列表打开状态截图已生成。
- 选中项不再使用大面积蓝色。
- 本机运行目录已确认引用 `styles.css?v=20260724-picker-refine`。
- 截图证据：`docs/test-evidence/2026-07-24-connector-picker-refined-open.png`。

### 后续

- 在 Chrome 扩展页重新加载扩展，并关闭后重新打开侧栏。

## 2026-07-24 02:45 CST

### 任务目标

按用户要求固定当前版本并推送 GitHub。

### 执行动作

- 执行敏感凭据扫描，未发现明文 MCP token 或 Bearer token。
- 提交当前侧栏 UI 改造和测试证据。
- 创建基线标签 `baseline-sidepanel-app-ui-20260724`。
- 检查 GitHub 远端配置。

### 验证结果

- 当前提交：`main` 当前 HEAD，提交信息 `Polish sidepanel app-style UI`。
- 当前标签：`baseline-sidepanel-app-ui-20260724`。
- Git 工作区提交后干净。
- 当前仓库未配置 remote，无法推送 GitHub。

### 后续

- 用户提供 GitHub 仓库地址后，添加 `origin` 并推送 `main` 与 baseline 标签。

## 2026-07-24 01:05 CST

### 任务目标

准备 GitHub 分发入口，并确认 Agent 自动配置说明可见。

### 执行动作

- 新增根目录 `README.md`，作为 GitHub 首页入口。
- README 指向 `交给Agent自动配置.md` 和 `docs/INSTALL_FOR_AGENT.md`。
- 明确运行文件应复制到本机目录，OneDrive 只保留源码、说明和项目记忆。
- 明确安装脚本不写入 MCP token、Cookie、Authorization、密码或验证码。

### 验证结果

- 已确认当前 Git 仓库无 remote，尚未推送 GitHub。
- 本机未安装 `gh` 命令，不能直接通过 GitHub CLI 创建仓库。
- 可用 GitHub 工具不包含创建新仓库能力；需要提供目标 GitHub 仓库地址后再推送。

### 后续

- 用户提供 GitHub 仓库地址后，添加 `origin` 并推送 `main` 和 baseline 标签。

## 2026-07-24 00:48 CST

### 任务目标

为 GitHub 分发补充 Agent 自动配置说明和本机安装脚本。

### 执行动作

- 新增 `scripts/install-local-runtime.mjs`。
- 新增 `交给Agent自动配置.md`。
- 新增 `docs/INSTALL_FOR_AGENT.md`。
- 安装脚本会把运行文件复制到本机运行目录、注册 Native Host、同步 Connector 和 Codex 插件缓存。

### 验证结果

- 已在本机执行 `node scripts/install-local-runtime.mjs`。
- 脚本成功输出本机扩展目录、Native Host manifest 路径、Connector 路径和 `credentialsWritten=false`。
- 脚本不写入 MCP token、Cookie、Authorization、密码或验证码。

### 后续

- 仍需配置 GitHub remote 或提供目标 GitHub 仓库地址后推送。

## 2026-07-24 00:24 CST

### 任务目标

用户重载扩展后，验证 v20 扫描口径是否生效。

### 验证结果

- 当前连接仍匹配同一绑定 session。
- 当前 Sheet：`其他应收款-其他应收款`。
- 页面适配器版本已回读为 `2026-07-24-page-tree-mirror-v20-index-clear-tag-fix`。
- `查证资料索引` 动态定位为 `Q` 列，`查证核对情况` 动态定位为 `R` 列。
- 扫描只保留真正有批次号的第 2、3 行：
  - `Q2=c30b34ed-0db3-4e31-b6ea-964cbbcadb12`，`R2=不一致`；
  - `Q3=8a3053bb-191a-4b3c-9272-3adbfac91815`，`R3=不一致`。
- `rowsNeedingCheck=0`。

### 结论

v20 已生效，空 `tag:{isClear:true}` 不再干扰当前最终扫描结果。

## 2026-07-24 00:22 CST

### 任务目标

继续完成当前科目已上传测试附件行的“查证核对情况”批量填写和保存回读。

### 执行动作

- 对当前 Sheet `其他应收款-其他应收款` 第 2、3 行执行批量填写。
- 字段动态定位：
  - `查证资料索引`：`Q` 列；
  - `查证核对情况`：`R` 列。
- 填写值：`不一致`。

### 验证结果

- `/assignment_draft/save` 业务成功，requestId `06255d36352cdf33ad65f61e18263e42`。
- `R2` 回读为 `不一致`。
- `R3` 回读为 `不一致`。
- 最终扫描显示：
  - `Q2=c30b34ed-0db3-4e31-b6ea-964cbbcadb12`，`R2=不一致`；
  - `Q3=8a3053bb-191a-4b3c-9272-3adbfac91815`，`R3=不一致`；
  - `rowsNeedingCheck=0`。

### 结论

当前科目两行已完成“测试附件上传、分类、保存、资料索引回读、查证核对情况填写、保存、核对情况回读”的小批量闭环。测试附件不是业务证据，因此核对情况使用 `不一致`。

## 2026-07-24 00:20 CST

### 任务目标

按用户要求换到当前科目，测试“查证资料索引”批量上传能力。

### 当前页面

- Sheet：`其他应收款-其他应收款`
- `查证类核实程序`：`P` 列
- `查证资料索引`：`Q` 列
- `查证核对情况`：`R` 列
- 页面适配器：`2026-07-24-page-tree-mirror-v19-upload-residual-guard`

### 执行动作

- 先执行只读扫描，确认当前页面和列定位。
- 对第 2 行做上传弹窗预演，识别分类：`凭证`、`合同`、`期后回款`、`关联`。
- 对第 2、3 行执行批量上传测试，分类选择 `凭证`，测试文件为 `/tmp/tianyuan-workbench-test/tianyuan-real-batch-upload-test-20260724.pdf`。

### 验证结果

- 第 2 行：
  - `/attach/upload` 业务成功，附件 ID `169418769170433`；
  - `/cell_file/classify_upload` 业务成功，批次号 `c30b34ed-0db3-4e31-b6ea-964cbbcadb12`；
  - `/assignment_draft/save` 业务成功；
  - `Q2` 回读一致。
- 第 3 行：
  - `/attach/upload` 业务成功，附件 ID `169418818715650`；
  - `/cell_file/classify_upload` 业务成功，批次号 `8a3053bb-191a-4b3c-9272-3adbfac91815`；
  - `/assignment_draft/save` 业务成功；
  - `Q3` 回读一致。
- 批量结果：`successRows=2`，`failedRows=0`。

### 发现问题与修复

- 只读扫描时发现空资料索引单元格可能带 `tag:{isClear:true}`，旧判断会误认为已有资料。
- 已修复为仅将有效 text/value/fileId/batchId 视为有内容，源码版本升为 `2026-07-24-page-tree-mirror-v20-index-clear-tag-fix`。

### 后续

- 重新加载扩展后验证 v20 扫描口径。
- 测试附件不是业务证据；若继续执行查证核对情况，应批量填 `不一致`。

## 2026-07-24 00:18 CST

### 任务目标

排查用户截图中批量上传返回 `BATCH_UPLOAD_ALL_FAILED`、页面显示系统异常且没有传成功的问题。

### 诊断结论

- `BATCH_UPLOAD_ALL_FAILED` 是插件安全门禁返回，表示本次批量没有任何行同时通过附件入库、分类批次、底稿保存和单元格回读。
- 代码中存在版本接线问题：`page_adapter.js` 已升级到 `2026-07-24-page-tree-mirror-v18-procedure-editor`，但 `content.js` 仍等待旧版回包，导致新版页面执行逻辑不能稳定接上。
- 批量上传工具 schema 缺少 `procedureText`，批量动作无法显性传入“查证类核实程序”前置字段。

### 修复动作

- 统一 `content.js` 与 `page_adapter.js` 的适配器版本。
- 给 `tianyuan.batch_upload_audit_attachments` 增加 `procedureText` 参数。
- 分类失败时额外返回前置程序处理结果和上传弹窗文本，便于下一轮区分前置字段问题与天源分类接口问题。
- 追加残留文件硬保护：上传弹窗打开后若已经存在文件，直接中止并关闭弹窗，不再点击保存。
- 同步 Native Host 与 Connector 插件运行副本。
- 重启本地 Connector Bridge。

### 验证结果

- `page_adapter.js`、`content.js`、`sidepanel.js`、`native_host.js` 和 Connector client 语法检查通过。
- Bridge 健康检查通过。
- 重启 Bridge 后已重新匹配到当前天源页面；v19 浏览器脚本仍需要重新加载扩展后才会完整生效。

### 后续

- 从一个尚未成功上传的新行做单行复测；若分类成功，再做两行真实批量复测。
- 测试附件只能用于流程验证，后续“查证核对情况”应填 `不一致`，不能填 `一致`。

## 2026-07-23 当前科目测试附件上传成功

### 任务目标

在用户当前打开科目的“查证资料索引”中上传一个测试文件，验证对话控制浏览器脚本的完整闭环。

### 执行动作

- 使用 `subjectCode=current`，不按旧 URL 科目导航。
- 读取当前 Sheet 为 `应付职工薪酬`。
- 通过表头动态定位“查证资料索引”为 `I2`。
- 预演读取到“工资计提表”等 6 个上传分类。
- 生成 213 字节测试 PDF。
- 将测试 PDF 注入“工资计提表”分类。
- 点击上传弹窗保存。
- 点击底稿保存。
- 回读 `I2`。
- 执行结束后删除本机临时测试 PDF。

### 验证结果

- `/attach/upload`：HTTP 200、业务 code 200，附件 ID `169407777996802`。
- `/cell_file/classify_upload`：HTTP 200、业务 code 200，批次号 `aaa86ec2-4456-431a-ba2e-5f247563a637`。
- `/assignment_draft/save`：HTTP 200、业务 code 200。
- `I2` text/value 回读为 `aaa86ec2-4456-431a-ba2e-5f247563a637`。
- 分类批次与单元格回读一致。
- 未捕获或保存任何凭据。

### 结论

通过 Codex 对话驱动固定浏览器脚本上传评估核实附件的能力已完成真实页面验证。

## 2026-07-23 当前科目实时识别与上传对象修复

### 问题

- 用户在天源左侧切换科目后，Connector 仍回传旧 URL 科目 `C5-9`，但实时 Sheet 已变为 `应付职工薪酬`。
- 使用“当前科目”预演时，真实 cellType 被诊断摘要覆盖，调用 `activateEditor()` 失败。

### 修复

- Connector 心跳改为实时读取当前页面上下文。
- 上传动作支持 `subjectCode=current`，不根据旧 URL 科目导航。
- 真实上传单元格对象改由 `rawCellType` 保存，诊断摘要与执行对象分离。
- 扩展版本升级为 `0.5.2`。

### 验证

- 页面适配器、content script 和侧栏脚本语法检查通过。
- Manifest 版本回读为 `0.5.2`。
- Git 差异格式检查通过。
- 本次预演未打开上传弹窗，未注入文件，未产生线上写入。

## 2026-07-23 当前页面附件上传预演

### 任务目标

在当前绑定天源页面的“查证资料索引”中演示上传测试文件。

### 执行动作

- 通过连接器确认当前在线 session 和当前 Codex 对话绑定。
- 对当前科目 `C5-9`、第 2 行执行附件上传预演。
- 通过表头动态定位“查证资料索引”，实际定位到 `J2`。
- 检查 `operation-upload-cell` 和 `activateEditor` 能力。

### 结果

- 目标 Sheet：`应交税费`。
- 目标 cellType：`operation-upload-cell`。
- 目标单元格：`J2`。
- `isReadOnly=true`，触发只读硬门禁。
- 未打开上传弹窗。
- 未注入测试文件。
- 未调用 `/attach/upload`、`/cell_file/classify_upload` 或 `/assignment_draft/save`。

### 后续

需要先在当前天源页面进入编辑状态并取得编辑锁，再重新执行预演；预演通过后才上传测试文件。

## 2026-07-23 21:45 CST

### 任务目标

先实现类似 WPS/Office Connector 的连接面板，绑定当前天源标签页并查看稳定操作能力；暂不实现浏览器内 Agent 对话。

### 执行动作

- 新增 `127.0.0.1:40415` Connector Bridge。
- 收敛协议为 `/health`、`/api/protocol`、`/api/sessions`、`/api/sessions/register`、`/api/sessions/:id/heartbeat` 和 session 读取。
- 移除 Connector 内部 Agent 指令队列试验代码。
- 增加轻量 session 上下文摘要和能力矩阵。
- 侧栏连接配置页增加启动、绑定、session 信息、能力列表和顶部 Connector 状态。
- Manifest 增加本机 Bridge host permission。
- 扩展开发版本升级为 `0.4.0`。
- Native Host 增加 `start_connector_bridge` 动作，并同步本机运行副本。

### 验证结果

- Native Host、侧栏脚本语法检查通过。
- Manifest 解析通过，侧栏 ID 引用检查无缺失。
- Bridge 健康、协议、注册、heartbeat、session 读取通过。
- Native Messaging 自动拉起 Bridge 通过。
- 固定工作台扩展来源可访问；外部网页来源返回 403。
- 未执行任何天源正式写入。

### 输出

- `docs/decisions/2026-07-23-tianyuan-connector-connection-first.md`
- `docs/test-evidence/tianyuan-connector-connection-20260723.md`
- `extension/manifest.json`
- `extension/src/sidepanel/index.html`
- `extension/src/sidepanel/sidepanel.js`
- `extension/src/sidepanel/styles.css`
- `native-helper/native_host.js`

## 2026-07-23 21:58 CST

### 任务目标

按 WPS/Office Connector 的项目绑定和路由逻辑，为天源浏览器增加 Codex 项目/对话绑定，并提供 Codex 侧只读通讯插件。

### 执行动作

- Connector 面板增加 Codex 项目列表、对话列表、绑定范围、保存绑定、绑定当前对话和解除绑定。
- Connector Bridge 增加持久化绑定文件和项目/对话目录读取。
- 绑定记录使用 `sessionId + bindingId + projectId + threadId + scope`。
- 新增 `plugins/tianyuan-browser-connector/`，提供 4 个只读 MCP 工具。
- MCP 路由要求复用明确的 `sessionId + bindingId`，不使用最新 session 猜测。

### 验证结果

- Connector Platform 返回 15 个项目、98 个对话。
- 绑定保存、读回和 Bridge 重启恢复通过。
- MCP `initialize`、`tools/list`、`tools/call` 通过。
- 无在线绑定时明确返回路由问题，不自动选择其他页面。
- 未开放正式天源写入。
- 插件结构和 Skill 校验通过。
- 已安装并启用 `tianyuan-browser-connector@personal`。
- 已从插件缓存实际启动 MCP Server，`tools/list` 和 `connection_status` 返回正常。

## 2026-07-23 22:15 CST

### 问题

用户点击“保存绑定/绑定当前对话”没有可见反馈。现场检查发现 `127.0.0.1:40415` Connector 未运行，在线 session 为 0；错误只写入页面顶部状态栏，按钮附近没有提示。

### 修复

- “保存绑定”和“绑定当前对话”改为一键流程：
  - 自动检查并启动 Connector；
  - 自动读取并绑定当前天源标签页；
  - 自动创建 session；
  - 最后保存 Codex 项目/对话绑定。
- 按钮下方实时显示启动、页面读取、保存、成功或失败原因。
- 当前标签页与旧 session 不一致时重新注册，避免把新页面绑定到旧 session。
- 扩展版本升级为 `0.4.1`。

## 2026-07-23 16:26:56 CST

### 任务目标

确认 `extension/` 是否为浏览器插件文件，并判断是否可以压缩为 Edge 浏览器可用格式。

### 诊断结论

- `extension/` 是浏览器插件源码目录。
- `extension/manifest.json` 使用 `manifest_version: 3`，包含 `background.service_worker`、`side_panel`、`content_scripts`、`permissions` 和 `host_permissions`，属于标准 Chromium Manifest V3 扩展。
- Microsoft Edge 与 Chrome 同属 Chromium 扩展体系，可直接加载该未打包目录，也可使用 zip 包作为 Edge Add-ons 提交/传输包。

### 执行动作

- 读取并确认 `extension/manifest.json`。
- 读取并确认 `extension/README.md`。
- 生成 Edge 用压缩包：
  - `dist/天源浏览器工作台-v0.3.0-Edge-插件-20260723-1624.zip`

### 验证结果

- 已检查 zip 包内容，`manifest.json` 位于压缩包根目录。
- 已从 zip 包内读取并解析 `manifest.json`，确认：
  - 插件名称：天源浏览器工作台；
  - 版本：`0.3.0`；
  - manifest 版本：`3`。

### 后续建议

- 本机测试：Edge 打开扩展管理页，开启开发人员模式，选择“加载解压缩的扩展”，直接选择 `extension/` 目录。
- 分发或提交：使用已生成的 zip 包；如需正式上架 Edge Add-ons，还需要按 Microsoft 商店流程补充图标、说明、隐私信息和发布资料。

## 2026-07-23 09:06:28 CST

### 任务目标

排查用户截图中插件科目清单未显示 `其他应付款` 的原因。

### 诊断结论

- 是的，主要原因是 `其他应付款` 在天源左侧树里存在更深一层的父子结构：`流动负债 -> 其他应付款 -> 其他应付款`。
- 插件原逻辑先按页面显示树叶子节点和 MCP 科目代码层级做精确匹配。
- 只要精确匹配到了 `银行存款`、`长期股权投资`、`应付职工薪酬` 等其他科目，函数就提前返回。
- 因此 `其他应付款` 这种页面缩进深度与 MCP 科目代码深度不完全一致的节点，没有进入后续宽松匹配流程，被误删。

### 修复动作

- 修改 `filterSubjectsByVisibleContext`：
  - 保留原精确匹配；
  - 再补充同名科目的宽松层级匹配；
  - 合并后按 `科目代码 + 科目名称` 去重；
  - 不再因为前面已有精确匹配结果而提前丢弃后续同名深层节点。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- 尚未在真实天源页面重新加载扩展验证，需要重新加载后点击“加载科目”确认。

### 后续建议

重新加载未打包扩展后，点击“加载科目”。预期 `C5` 下应出现 `其他应付款`，并可作为显示科目勾选。

## 2026-07-23 09:14:33 CST

### 任务目标

继续修正 `其他应付款` 未加载出来的问题。

### 追加判断

- 用户确认后，这不是简单的“多一层”问题，而是同名深层节点被过滤链路提前收口。
- 进一步分析发现，当前过滤还可能在页面可见名与 MCP 同名重复时只保留少数已匹配结果，导致重复同名科目再次被丢掉。

### 追加修复

- 在 `filterSubjectsByVisibleContext` 中增加重复同名兜底：
  - 先计算页面可见名称；
  - 再统计 MCP 结果里同名科目的数量；
  - 只要页面可见且 MCP 里同名重复，就把整组重复同名科目保留下来；
  - 合并后按 `科目代码 + 科目名称` 去重。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- 尚未在真实页面重新加载验证。

### 后续建议

重新加载未打包扩展后，继续点击“加载科目”。如果仍没出来，就不要再靠层级猜了，下一步直接抓这条节点的页面原始文本和 helper 返回 JSON 做定点比对。

## 2026-07-23 01:45:20 CST

### 任务目标

按用户要求优化侧栏页面显示效果：执行日志不需要一直显示，改为可折叠；整体样式做成更接近 Codex 的简洁美观面板。

### 执行动作

- 将“执行日志”从常驻列表改为默认收起的折叠区。
- 新增日志条数显示，执行过程中追加日志时自动更新。
- 将“证据 JSON”也改为折叠区，减少默认占屏。
- 调整面板视觉：
  - 背景、边框、卡片和列表改为更轻的低噪样式；
  - 主操作按钮使用更明确的深色样式；
  - 公司/科目范围面板和功能模块改为更规整的轻量卡片；
  - 减少厚边框和大面积高对比背景；
  - 保持宽面板和窄面板的自适应布局。
- 修复证据 JSON 折叠标题中的“复制”按钮点击冒泡问题，避免复制时误展开/收起。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/content/content.js` 和 `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本次为静态验证，尚未在 Chrome 侧边栏真实截图复核。

### 后续建议

重新加载未打包扩展后，检查侧栏默认状态：执行日志和证据 JSON 应收起；运行保存或退出编辑后，日志条数应增加，展开后可查看明细。

## 2026-07-23 01:38:33 CST

### 任务目标

按用户要求调整项目存储边界：底层依赖都安装或保存到本机，不放在 OneDrive 云盘项目中；云盘项目只保留基础项目信息。

### 执行动作

- 检查 OneDrive 项目目录，确认当前没有 `node_modules` 或 Python 虚拟环境。
- 将项目根目录中的重型材料迁移到本机目录：
  - `tycpv-setup-0.1.0-macos-arm64.pkg`
  - `macos-tycpv-agent-cli-guide.md`
  - `valuation-declaration-table-json/`
  - `valuation-json-to-excel/`
  - `.snapshots/`
- 本机依赖目录：
  - `~/.tianyuan-workbench/dependencies/天源评估系统/`
  - `~/.tianyuan-workbench/project-snapshots/天源评估系统/`
- 更新 `.gitignore`，忽略依赖、缓存、日志、构建产物、安装包和生成的 Native Host launcher。
- 更新 `native-helper/install_native_host.sh`：
  - Native Host 运行副本生成到 `~/.tianyuan-workbench/native-helper/`；
  - HTTP helper 运行副本也生成到 `~/.tianyuan-workbench/native-helper/`；
  - launcher 和日志均写入本机目录。
- 删除项目内生成文件 `native-helper/native_host_launcher.sh`，以后由安装脚本在本机目录生成。
- 将本机运行依赖规则写入 `AGENTS.md`、`PROJECT_MEMORY.md` 和 `PROJECT_STATE.md`。

### 验证结果

- OneDrive 项目根目录已不再包含迁移前的重型安装包、工具目录和 `.snapshots`。
- 迁移目标目录已存在并能列出迁移后的材料。
- 已运行 `native-helper/install_native_host.sh` 重新生成本机 Native Host/HTTP helper 副本。
- Chrome Native Messaging 注册文件已指向 `~/.tianyuan-workbench/native-helper/native_host_launcher.sh`。
- `native-helper/native_host.js` 和 `native-helper/server.js` 语法检查通过。

### 后续建议

后续如果要安装 npm、Python、OCR、PDF、CLI 等底层依赖，统一安装到 `~/.tianyuan-workbench/` 或系统级包管理目录，不要在 OneDrive 项目目录直接安装。

## 2026-07-23 01:33:28 CST

### 任务目标

在已完成的“保存底稿”功能基础上，新增第二个功能模块：批量点击“退出编辑”。

### 执行动作

- 在侧边栏“功能模块”区域新增“退出编辑”模块，与“保存底稿”并列。
- “退出编辑”模块复用已确认的公司范围和科目范围，不重新要求选择公司或科目。
- 新增预演模式：只定位当前科目页面的“退出编辑”按钮，不点击。
- 新增正式执行模式：必须勾选确认后才允许点击“退出编辑”。
- 页面适配器新增 `exit_edit_current_subject` 动作：
  - 检查当前页面是否为资产基础法底稿页；
  - 定位“退出编辑”按钮；
  - 正式执行时沿用公司选择逻辑；
  - 公司范围确认后重新定位“退出编辑”按钮，避免页面重绘导致旧按钮引用失效；
  - 点击后尝试确认弹窗；
  - 采集页面消息和执行后上下文。
- 批量执行逻辑与保存模块一致：逐科目执行，单科目失败记录结果并继续后续科目。
- 最近一次批量退出编辑结果写入扩展本地存储 `tianyuanWorkbenchLastBatchResult`。

### 验证结果

- 已执行静态验证：
  - `extension/src/injected/page_adapter.js` 语法检查通过；
  - `extension/src/sidepanel/sidepanel.js` 语法检查通过；
  - `extension/src/content/content.js` 语法检查通过；
  - `extension/manifest.json` JSON 解析通过。
- 本次尚未在真实天源页面点击“退出编辑”，不能宣称线上退出编辑已成功。

### 后续建议

重新加载未打包扩展后，按“确认公司 -> 确认科目 -> 退出编辑预演”的顺序先试跑。预演可定位按钮后，再用单公司、单科目正式执行验证。

## 2026-07-22

### 任务目标

按用户要求调整面板逻辑：先选公司，再选科目，确认工作范围后再进入功能模块；“保存”只是其中一个功能模块。

### 执行动作

- 将公司清单和科目清单从“批量保存底稿”区域拆出。
- 新增“工作范围”区域：
  - 公司清单排在前；
  - 显示科目排在后；
  - 默认打开公司、收起科目。
- 确认公司后自动收起公司范围并展开科目范围。
- 确认科目后自动收起科目范围。
- 新增“功能模块”区域，把当前保存动作整理为“保存底稿”模块。
- 保留原有 DOM ID 和执行函数，避免重写保存执行链路。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 相关脚本通过语法检查。
- `extension/src/content/content.js`、`extension/src/injected/page_adapter.js` 通过语法检查。
- `extension/manifest.json` 通过 JSON 解析。
- 尚未在 Chrome 侧边栏实机截图复核，需要重新加载扩展后检查折叠和顺序。

### 后续建议

重新加载扩展后，按“公司清单 -> 确认 -> 显示科目 -> 确认 -> 功能模块保存”的顺序试跑。后续新增功能时，直接在“功能模块”区域并列新增。

## 2026-07-22

### 任务目标

修复面板中已勾选两个公司，但批量保存没有按这两个公司实际执行的问题。

### 诊断结论

- 面板确认公司时保存的是 checkbox value，但执行配置里只把公司转换成 `item.name` 传给页面。
- 页面端 `selectCompanyScope` 只用文本包含匹配天源弹窗，容易受到父子公司、简称/全称差异、历史勾选状态影响。
- 页面端未在点击保存前读回“实际已勾选公司”，所以即使弹窗选择与面板确认不一致，也可能继续保存。

### 修复动作

- 面板执行配置新增 `selectedCompanies`，传递公司 `value/id/code/shortName/name/title`。
- 页面端公司匹配改为结构化多字段匹配：
  - 公司编号；
  - 公司简称；
  - 公司全称；
  - 面板标题；
  - 系统 ID/value。
- 部分公司执行时会先调整天源公司弹窗为“只选面板确认的公司”。
- 调整后立即读回实际勾选公司；若存在少选或多选，返回 `ACTUAL_COMPANY_SELECTION_MISMATCH` 并停止保存。
- content script 和 injected adapter 版本号提升到 `2026-07-23-company-selection-v2`，避免旧脚本缓存。

### 验证结果

- `extension/src/sidepanel/sidepanel.js`、`extension/src/content/content.js`、`extension/src/injected/page_adapter.js` 通过 Node 语法检查。
- `extension/manifest.json` 通过 JSON 解析。
- 尚未在真实天源页面重新正式保存；需要重新加载扩展后验证部分公司范围。

### 后续建议

重新加载扩展后，用预演或小范围正式执行验证。若天源弹窗因父子联动导致实际勾选多于面板确认，公司选择步骤应失败并在 JSON 中显示 `selectedAfter / missingAfter / extraAfter`。

## 2026-07-22

### 任务目标

修复科目清单未正确加载“其他应付款”的问题。

### 诊断结论

- 截图中天源左侧真实显示树包含“其他应付款”，但插件只显示 `银行存款 / 长期股权投资 / 应付职工薪酬`。
- 当前代码仍然先用 MCP 的显示字段过滤，再用页面左侧显示树过滤；此前已经确认 MCP 显示字段和天源实际显示状态不完全一致，因此“其他应付款”会先被误删。
- 页面左侧存在父级和子级同名的情况，例如父级“其他应付款”下还有子级“其他应付款”，只按名称去重或匹配会丢失层级信息。

### 修复动作

- 页面适配器采集科目树时保留同名不同层级节点，不再只按文本去重。
- 页面适配器为每个科目树节点补充 `depth` 和 `leaf`。
- 侧栏加载科目时改为：
  - MCP 提供全量科目代码和名称；
  - 页面左侧真实显示树作为最终过滤依据；
  - 只把页面显示树中的叶子节点作为可勾选保存科目；
  - 同名科目按页面层级深度匹配，避免父级和子级混淆。
- content script 和 injected adapter 版本号已提升，避免旧页面适配器缓存继续生效。

### 验证结果

- `extension/src/sidepanel/sidepanel.js`、`extension/src/content/content.js`、`extension/src/injected/page_adapter.js` 通过 Node 语法检查。
- `extension/manifest.json` 通过 JSON 解析。
- 尚未在真实天源页面重新点击“加载科目”验证；需要重新加载扩展后验证 `其他应付款` 出现在 `C5 流动负债` 下。

### 后续建议

重新加载未打包扩展并刷新天源底稿页后，点击“加载科目”。预期清单包含 `银行存款 / 长期股权投资 / 应付职工薪酬 / 其他应付款`，且父级“其他应付款”不作为单独可保存项。

## 2026-07-22

### 任务目标

检查批量保存时最后一个“其他应付款”未运行，以及任务完成后科目和公司选择被清空的问题。

### 诊断结论

- 项目目录没有本次批量运行的持久化日志文件；`~/.tianyuan-workbench/native-helper/native_host.log` 只有 Native Host 启动记录，不能还原每个科目的页面执行结果。
- 代码中批量循环遇到任一科目 `result.ok === false` 或页面上下文未就绪时会 `break`，因此前一个科目失败/超时会直接跳过后续的“其他应付款”。
- 批量循环中每次 `readContextForTab` 都调用 `render`；原 `render` 会把 MCP 科目和公司列表重新渲染为当前科目/当前公司，并把确认状态清空，导致任务运行后选择消失。

### 修复动作

- 批量执行改为每个科目独立捕获异常，失败后记录结果并继续下一个科目。
- 页面上下文刷新增加 `preserveBatchSelections` 选项；批量执行期间不重置已加载清单和已确认选择。
- 每次批量任务完成或失败后，将最近一次结果和任务日志写入扩展本地存储键 `tianyuanWorkbenchLastBatchResult`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js`、`extension/src/content/content.js`、`extension/src/injected/page_adapter.js` 通过 Node 语法检查。
- `extension/manifest.json` 通过 JSON 解析。
- 尚未在真实天源页面重新执行正式保存；需要重新加载扩展后验证“其他应付款”会被尝试执行，且选择状态保持。

### 后续建议

重新加载未打包扩展后，先用预演模式选择两个以上科目运行，确认失败项后续仍继续；再做正式保存验证。

## 2026-07-22

### 任务目标

固定当前插件版本，确保后续科目和公司清单改动出现回归时可以退回。

### 执行动作

- 在项目根目录初始化 Git 仓库。
- 将当前项目文件提交为基线版本。
- 创建基线标签：`baseline-subject-company-selection-20260722`。
- 生成独立压缩快照：`.snapshots/tianyuan-workbench-baseline-20260722.zip`。
- 将回退命令和基线行为写入 `项目管理/VERSION_BASELINES.md`。

### 验证结果

- 基线提交、标签和压缩快照均已生成。
- 本次只进行版本固定和项目记录更新，没有修改插件功能。

### 后续建议

后续每完成一个可验证功能节点，再创建一个新的 Git 提交或标签；出现回归时优先回退到最近一个已验证标签。

## 2026-07-23 00:53:37 CST

### 任务目标

恢复之前已经做好的科目父级名称补全顺序，避免后续修改再次破坏。

### 执行动作

- 定位当前回归点：代码又变成“先过滤显示科目，再建立父级名称映射”，导致隐藏父级的名称无法用于层级标题。
- 修复为两套数据：
  - `allMcpSubjects`：MCP 全量科目，不按显示状态过滤，只用于建立 `科目代码 -> 科目名称` 映射；
  - `displayedMcpSubjects`：按显示状态过滤后的科目，用于生成可选科目。
- `enrichSubjectHierarchyNames(displayedMcpSubjects, allMcpSubjects)` 固化“先全量映射、后显示过滤”的顺序。
- 将该规则写入 `PROJECT_MEMORY.md`。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

后续修改科目树时，不能再把父级名称映射建立在过滤后的科目集合上。

## 2026-07-23 00:51:50 CST

### 任务目标

修复用左侧当前可见 DOM 判断显示状态会漏掉折叠科目的问题。

### 执行动作

- 按用户反馈确认：左侧科目树存在折叠节点，不能只用当前可见文本判断显示状态。
- 修改页面适配器：
  - 读取显示科目前先展开左侧科目树中的折叠节点；
  - 展开后再采集天源“显示/隐藏”后的完整显示科目树；
  - 不点击“阶段”等无关入口。
- 修改侧栏加载科目流程：
  - 点击“加载科目”时先调用页面动作 `list_asset_draft_subjects`；
  - 用展开后采集到的 `subjectTree` 作为最终显示状态过滤依据；
  - MCP 继续负责提供科目代码、名称和基础结构。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/injected/page_adapter.js`、`extension/src/sidepanel/sidepanel.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载科目”。插件会先展开左侧科目树再采集显示状态，折叠下的显示科目不应再漏掉。

## 2026-07-23 00:46:58 CST

### 任务目标

回应用户关于 MCP/CLI 是否能判断科目显示状态的问题，并修复插件科目显示状态口径。

### 执行动作

- 核验当前 `tycpv --help`：
  - CLI 公开命令只有登录、登出、资产基础法导入和各类导出；
  - 未暴露“读取科目清单/读取显示隐藏状态”的命令。
- 判断 MCP 返回的科目显示字段与天源左侧“显示/隐藏”后的实际页面口径不一致，不能单独作为最终过滤依据。
- 修改科目过滤：
  - MCP 负责提供科目代码和名称；
  - 天源页面左侧实际显示树作为最终显示状态校验；
  - 过滤只使用 `context.subjectTree`，不再使用页面正文或 URL 扫描结果。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载科目”。应只保留天源左侧实际显示状态的科目，例如截图场景下只保留 `银行存款`，不再显示 `现金/其他货币资金`。

## 2026-07-23 00:43:10 CST

### 任务目标

按用户要求查看历史版本并恢复科目树正确口径。

### 执行动作

- 核对历史验证记录：
  - `2026-07-22-visible-subject-selection-static-validation.md`：隐藏科目不进入批量任务。
  - `2026-07-22-parent-subject-code-name-static-validation.md`：父级节点作为层级标题显示为 `科目代码 科目名称`。
- 恢复科目树口径：
  - 通过科目代码前缀补出父级层级容器；
  - 父级容器没有复选框，不进入保存科目清单；
  - 只有 MCP 显示状态过滤后保留的科目有复选框、可确认、可参与批量保存；
  - 父级标题显示为 `C3 流动资产`、`C3-1 货币资金` 等。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载科目”。预期恢复为折叠层级效果：父级作为无复选框标题，显示状态科目作为带复选框项。

## 2026-07-23 00:39:34 CST

### 任务目标

按用户要求修复科目树仍展示非显示状态父级的问题。

### 执行动作

- 确认旧树构建仍会为显示科目的所有代码前缀补父级容器，例如 `C3/C3-1`。
- 修改科目树构建逻辑：
  - 只为 MCP 显示状态过滤后保留下来的科目创建节点；
  - 不再创建非显示状态父级容器；
  - 子科目只挂到“已显示的最近父级”下；
  - 如果没有已显示父级，则直接显示在根层。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载科目”。列表中应只出现 MCP 标记为显示状态的科目；隐藏父级不会作为层级标题出现。

## 2026-07-23 00:36:52 CST

### 任务目标

修复科目树顶层父级 `C3 流动资产` 偶发丢失、树从 `C3-1` 开始的问题。

### 执行动作

- 定位原因为旧科目树构建同时混用 `parentCode`、`path` 和临时路径节点，节点会被反复重挂，导致顶层父级不稳定。
- 重写科目树构建逻辑为按科目代码前缀稳定建树：
  - `C3-1` 永远挂到 `C3`；
  - `C3-1-2` 永远挂到 `C3-1`；
  - 若父级不是 MCP 显示状态科目，则只作为层级容器；
  - 若父级本身是 MCP 显示状态科目，则保留可选状态。
- 科目显示过滤仍以 MCP 的 `isDisplayedSubject` 为准。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载科目”，应稳定显示 `C3 流动资产 -> C3-1 货币资金 -> C3-1-1/2/3`，不会再从 `C3-1` 直接起树。

## 2026-07-23 00:33:45 CST

### 任务目标

按用户澄清纠正科目树逻辑：只显示 MCP 标记为显示状态的科目。

### 执行动作

- 撤回上一轮给父级分组强加复选框的改动。
- 保留 `normalizeMcpSubjects -> isDisplayedSubject` 作为科目显示过滤口径。
- 不再根据当前页面左侧展开分支裁剪科目。
- 父级只有在 MCP 返回且为显示状态时才作为可选科目；否则仅作为层级容器。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载科目”，检查是否只显示 MCP 显示状态科目，并保持完整层级。

## 2026-07-23 00:29:49 CST

### 任务目标

修复科目清单只加载当前展开分支、不完整的问题。

### 执行动作

- 定位原因为 `filterSubjectsByVisibleContext` 使用当前页面左侧可见科目树做二次过滤。
- 当前页面左侧只展开 `C3 -> C3-1 -> C3-1-2` 时，会把 MCP 返回的其他显示状态科目裁掉。
- 已移除这层基于当前展开状态的过滤。
- 科目清单现在以 MCP 返回的显示状态字段为准，由 `isDisplayedSubject` 过滤隐藏科目。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载科目”，应加载完整 MCP 显示状态科目树，而不是当前页面展开分支。

## 2026-07-23 00:27:29 CST

### 任务目标

修复科目树父级 `C3/C3-1` 只作为分组显示、没有复选框的问题。

### 执行动作

- 定位原因为“右侧显示状态”过滤只保留了当前可见叶子科目，父级科目被过滤掉，树构建时临时创建的父级节点不可勾选。
- 修改过滤逻辑：保留右侧显示科目的同时，从 MCP 原始清单中补回所有父级科目。
- 父级只有在 MCP 原始清单中真实存在时才补回，不创建虚拟可选科目。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载科目”，`C3`、`C3-1` 若为 MCP 真实科目，应显示复选框并可参与确认选择。

## 2026-07-23 00:24:48 CST

### 任务目标

按用户要求将公司清单显示改为公司简称。

### 执行动作

- 公司清单显示标题统一为 `编码 + 公司简称`。
- 合并页面公司表时，页面全称只用于匹配和备用，不再覆盖 MCP 返回的公司简称。
- 若没有简称，则从公司全称中移除常见公司后缀作为显示兜底。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载清单”，公司树应显示为 `1 中显芯科`、`1-1 英拓智算` 等简称口径。

## 2026-07-23 00:22:29 CST

### 任务目标

根据用户确认编码显示正确后，补充公司清单层级关系。

### 执行动作

- 公司树渲染支持按编码前缀自动挂接父子关系：
  - `1-1`、`1-2` 自动挂到 `1` 下；
  - `1-3-1`、`1-3-2` 自动挂到 `1-3` 下。
- 父公司自身仍作为可勾选节点显示。
- 仅在父编码对应的公司真实存在时建立父子关系，不创建虚拟公司。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载清单”，公司清单应以可折叠树显示：`1` 下包含 `1-1/1-2/1-3`，`1-3` 下包含 `1-3-1/1-3-2`。

## 2026-07-23 00:20:27 CST

### 任务目标

处理用户继续看到 `页面编码未合并：页面 10 行` 的问题，并修复状态提示误导。

### 执行动作

- 纠正状态口径：
  - 不再把“页面读到 10 行”表述成“页面编码 10 行”；
  - 改为显示“页面 N 行，带编码 M 行”。
- 页面表格读取新增宽松模式：
  - 不再强依赖表头必须叫 `编码`；
  - 只要表格行中出现 `1`、`1-1`、`1-3-2` 形式层级编码，就抽取为公司编码；
  - 不抽取长系统 ID。
- 侧栏合并前会从页面行 raw cells、固定列 cells、label/text 中二次提取层级编码。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/injected/page_adapter.js`、`extension/src/sidepanel/sidepanel.js`、`extension/src/content/content.js`、`extension/src/background/service_worker.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载清单”。若仍无法显示编号，面板应显示“页面 N 行，带编码 0 行”，说明当前读取到的 10 行不含系统编码，需要改为读取实际显示编码的页面或接口。

## 2026-07-23 00:16:33 CST

### 任务目标

处理用户截图显示 `页面编码未合并：页面 10 行` 的问题。

### 执行动作

- 判断页面公司编码已读到，但页面行数与 MCP 公司数不同，旧逻辑只在数量完全一致时做顺序兜底，导致编码未合并。
- 增强公司合并逻辑：
  - 页面行匹配时同时使用公司名称、简称、页面整行文本、固定列文本参与匹配；
  - 若仍未匹配，则从页面已读取的真实编码行中按顺序补给 MCP 公司；
  - 不生成或推导任何公司编号，只使用页面真实编码。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/injected/page_adapter.js`、`extension/src/content/content.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后再次点击“加载清单”。若页面真实编码顺序与公司清单一致，应显示 `编码 + 公司简称`，标题旁应显示 `编码 6/6`。

## 2026-07-23 00:15:07 CST

### 任务目标

处理用户截图显示 `页面编码 0 行` 的问题。

### 执行动作

- 判断问题已从“编码未合并”收敛为“公司列表页未读到编码表格行”。
- 将公司列表页读取从后台非活动标签页改为临时活动标签页读取，避免天源前端表格在后台不渲染。
- 读完公司列表页后自动回到底稿页。
- 若公司列表页仍无编码，自动在当前底稿页打开“公司主体/选择更多”弹窗兜底读取公司清单。
- 弹窗读取新增编码提取：
  - 从节点文本、title、aria-label 和 data 属性中查找 `1`、`1-1`、`1-3-2` 形式编码；
  - 不把长系统 ID 当成公司编号。
- 页面公司表读取失败时新增表格诊断，包括表格数量、表头、固定列表头和行数。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/injected/page_adapter.js`、`extension/src/sidepanel/sidepanel.js`、`extension/src/content/content.js`、`extension/src/background/service_worker.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后点击“加载清单”。这次会短暂切到公司列表页读取编码，随后自动回到底稿页；如果仍读不到，会再从当前页公司弹窗兜底读取，并在面板状态中显示最终编码行数。

## 2026-07-23 00:10:03 CST

### 任务目标

排查用户截图中公司清单仍只显示简称的原因，并修复旧注入脚本残留导致更新不生效的问题。

### 执行动作

- 通过 Chrome 获取当前活动页 URL，确认当前页为天源底稿页：
  - `https://excel.zhrdc.net/ty/operation/165353602809858/165353602809933/asset-based-approach/draft?subjectCode=C3-1-2`
- 新增公司编码来源状态：
  - 显示 `编码 N/M`、`页面编码 0 行`、`页面编码未合并` 或 `编码读取失败`。
- 升级侧栏到页面注入脚本的通信协议：
  - 侧栏消息改为 `*_V2`，避免旧 content script 响应；
  - content script 注入带版本参数的 `page_adapter.js`；
  - 页面适配器返回 `adapterVersion`；
  - content script 只接受当前版本的读取结果，忽略旧适配器返回。
- 已通过 AppleScript 刷新当前天源底稿页，清理页面内旧注入脚本。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/injected/page_adapter.js`、`extension/src/sidepanel/sidepanel.js`、`extension/src/content/content.js`、`extension/src/background/service_worker.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后，再点公司清单“加载清单”。新版面板会直接显示编码来源状态，能判断是页面编码没有读到，还是已读到但未合并。

## 2026-07-23 00:06:25 CST

### 任务目标

根据用户截图修复公司清单仍只显示简称、不显示系统编码的问题。

### 执行动作

- 判断当前截图表现为：MCP 公司名称清单已加载，但页面 `编码` 列未合并进显示标题。
- 在 `mergeCompanyDisplayRows` 中增加按行顺序兜底：
  - 优先仍按公司名称/简称匹配页面表格行；
  - 如果匹配失败，但页面表格行数与 MCP 公司数一致，则使用页面第 N 行真实编码补充 MCP 第 N 个公司；
  - 该兜底只使用页面表格已读取到的真实编码，不再生成推导编号。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/injected/page_adapter.js`、`extension/src/sidepanel/sidepanel.js`、`extension/src/content/content.js`、`extension/src/background/service_worker.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后再次点击公司清单“加载清单”。若页面表格读取到了编码，列表应显示为 `编码 + 公司简称`。

## 2026-07-23 00:01:24 CST

### 任务目标

回应用户关于“公司编号读不到”的反馈，直接修复插件内公司列表页读取逻辑，避免继续要求用户手工复制调试数据。

### 执行动作

- 确认 Chrome 当前未开启“允许 Apple 事件中的 JavaScript”，外部 AppleScript 不能直接读取网页 DOM。
- 改造插件页面适配器 `list_equity_table_companies`：
  - 后台打开公司列表页后等待表格行渲染；
  - 主表读取时排除 Element UI 固定列副本；
  - 固定列读取时单独按 `编码/公司编号/层级编码/序号` 表头取值；
  - 兼容固定编码列与右侧公司名称/简称列分离的表格结构。
- 改造侧边栏公司层级处理：
  - 不再把根据父子顺序推导出的 `1/1-1/1-3-2` 作为公司编号展示；
  - 公司编号仅使用 MCP 或页面表格真实返回的编码字段。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/injected/page_adapter.js`、`extension/src/sidepanel/sidepanel.js`、`extension/src/content/content.js`、`extension/src/background/service_worker.js` 已通过语法检查。
- 当前未执行真实保存，未读取或写入任何 Cookie、Authorization、密码、验证码或 token。

### 后续建议

重新加载扩展后，在天源底稿页点击公司清单“加载清单”。若页面表格真实可读，应显示 `编码 + 公司简称`；若仍为空，应优先检查公司列表页是否需要登录或是否存在表格虚拟滚动未展开。

## 2026-07-22 23:53:16 CST

### 任务目标

修复公司编号显示为误导性平铺编号 `1/2/3/4/5/6` 的问题。

### 执行动作

- 新增 Element UI 固定列拆表读取逻辑：固定列读 `编码`，主体表格读 `公司名称/公司简称/上级母公司`。
- 禁止在没有父级关系或页面编码时生成平铺假编号。
- 公司加载证据 JSON 增加 `pageCompanyRows` 和 `normalizedCompanies`。
- 新增验证记录 `docs/test-evidence/2026-07-22-company-fixed-table-code-read-static-validation.md`。

### 验证结果

- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

### 后续建议

重新加载扩展后点击“加载清单”。如果仍异常，复制证据 JSON 的 `pageCompanyRows` 和 `normalizedCompanies`，按真实 DOM 继续适配。

## 2026-07-22 23:49:50 CST

### 任务目标

解决 MCP 公司清单未读取系统页面“编码”列的问题。

### 执行动作

- 新增页面动作 `list_equity_table_companies`，按表头读取股权结构/公司列表页中的 `编码`、`公司名称`、`公司简称`、`上级母公司`。
- 侧栏点击“加载清单”时，先通过 MCP 获取系统 ID，再后台打开 `equity/list` 页面读取表格编码。
- 按公司名称/简称将页面表格结果与 MCP 公司结果合并。
- 系统 ID 继续作为内部 value，展示使用页面表格 `编码 + 公司简称`。
- 重新执行 `native-helper/install_native_host.sh`，同步本机 Native Host 副本。
- 新增验证记录 `docs/test-evidence/2026-07-22-company-equity-table-merge-static-validation.md`。

### 验证结果

- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

### 后续建议

重新加载扩展后点击“加载清单”。若任务日志显示 `页面公司表读取完成：N 行`，公司列表应显示页面编码；若失败，查看日志中的失败原因继续适配表格 DOM。

## 2026-07-22 23:45:24 CST

### 任务目标

解决公司清单未显示页面“编码”列的问题。

### 执行动作

- 若 MCP 未直接返回层级编码，则按公司父子关系和接口原始顺序推导编号。
- 支持通过 `parentId/parentCompanyId` 或 `parentName/parentCompanyName` 建立父子关系。
- 公司树排序优先使用层级编号。
- 本地样本验证可输出 `1`、`1-1`、`1-2`、`1-3-1` 这类编号。
- 重新执行 `native-helper/install_native_host.sh`，同步本机 Native Host 副本。
- 新增验证记录 `docs/test-evidence/2026-07-22-company-code-inference-static-validation.md`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。
- 样本输出：`1 中显芯科 | 1-1 英拓智算 | 1-2 深圳扶摇 | 1-3 中显光电 | 1-3-1 迪吉芯半导体 | 1-3-2 力通兴威`。

### 后续建议

重新加载扩展后点击“加载清单”。如仍未显示层级编号，说明 MCP 公司返回缺少父级关系字段，需要改由页面表格采集。

## 2026-07-22 23:42:21 CST

### 任务目标

将科目确认反馈改造成与公司清单一致。

### 执行动作

- “显示科目”标题旁新增确认状态。
- 默认显示 `默认当前科目`。
- 加载科目后未确认时显示 `未确认`。
- 点击确认后显示 `已确认 N 个`。
- 新增验证记录 `docs/test-evidence/2026-07-22-subject-confirm-feedback-static-validation.md`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

### 后续建议

重新加载扩展后，点击“加载科目”并确认，检查标题旁确认数量是否更新。

## 2026-07-22 23:41:17 CST

### 任务目标

按用户澄清，将“公司编号”适配为页面表格中的层级编码，而不是系统 ID。

### 执行动作

- 新增公司层级编码字段白名单，覆盖 `treeCode/hierarchyCode/levelCode/sortNo/serialNo/sequence/orderNo/index/编码/层级编码/序号` 等。
- 公司显示标题不再使用系统 ID 兜底。
- Native Host 和 HTTP helper 透传层级编码字段。
- 父级公司显示不再用 parentId 作为展示前缀，优先用父级层级编码。
- 重新执行 `native-helper/install_native_host.sh`，同步本机 Native Host 副本。
- 新增验证记录 `docs/test-evidence/2026-07-22-company-hierarchy-code-static-validation.md`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

### 后续建议

重新加载扩展后点击“加载清单”。如仍无法显示 `1-1` 这类编码，复制证据 JSON 中对应公司的 `raw` 字段，确认 MCP 是否返回该列。

## 2026-07-22 23:37:34 CST

### 任务目标

修复公司确认无明显反馈，并将公司显示改为业务编号和简称。

### 执行动作

- “公司清单”标题旁新增确认状态显示。
- 点击公司“确认”后显示 `已确认 N 个`。
- 公司列表标题优先显示 `公司编号 公司简称`。
- 系统 ID 仍保留为内部选择值，不再优先展示。
- Native Host 和 HTTP helper 透传常见公司编码字段与简称字段。
- 默认当前公司显示为 `当前 当前公司`。
- 重新执行 `native-helper/install_native_host.sh`，同步本机 Native Host 副本。
- 新增验证记录 `docs/test-evidence/2026-07-22-company-code-short-name-confirm-feedback-static-validation.md`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

### 后续建议

重新加载扩展后点击“加载清单”。如仍显示长系统 ID，复制证据 JSON 中对应公司的 `raw` 字段，以便按 MCP 真实字段名适配。

## 2026-07-22 23:31:23 CST

### 任务目标

按用户要求重做公司选择逻辑，使其与科目选择一致。

### 执行动作

- 移除“公司范围”下拉。
- 刷新当前页面后，公司清单默认显示当前公司并勾选。
- 公司加载后改为树形渲染。
- 公司节点显示为 `公司编号 公司名称`。
- 支持 MCP 公司层级字段 `path/fullPath/namePath/parentName/parentCompanyName/parentId/parentCompanyId`。
- 公司加载后显示“全选 / 全不选 / 确认”按钮。
- 加载公司后未确认选择时，不允许运行批量保存。
- 批量保存底层 `companyScope` 改为根据确认选择自动推导。
- 新增验证记录 `docs/test-evidence/2026-07-22-company-tree-selection-static-validation.md`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

### 后续建议

重新加载扩展后刷新侧栏，确认默认当前公司已勾选；点击“加载清单”检查公司编号、公司名称和层级显示。

## 2026-07-22 23:23:24 CST

### 任务目标

继续修复科目树父级只显示代码的问题。

### 执行动作

- 加载 MCP 科目后，先用全量结果建立 `科目代码 -> 科目名称` 映射。
- 过滤隐藏科目前先补齐显示科目的父级名称和路径。
- 父级节点显示为 `科目代码 科目名称`。
- 增加常见顶层科目窄兜底，避免父级不在 MCP 返回项内时只显示代码。
- 新增验证记录 `docs/test-evidence/2026-07-22-parent-subject-code-name-static-validation.md`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本地样本验证 `C3` 可显示为 `C3 流动资产`，`C3-1-2` 可生成 `流动资产/货币资金/银行存款` 路径。

### 后续建议

重新加载扩展后再次点击“加载科目”，确认父级是否显示名称。

## 2026-07-22 23:20:57 CST

### 任务目标

修复用户反馈：科目树需要按“科目代码 + 科目名称”显示，并继续过滤隐藏科目。

### 执行动作

- 新增统一科目标题格式 `科目代码 科目名称`。
- 当前科目默认项也改为 `科目代码 科目名称`。
- 扩展 MCP 显示状态字段识别范围，补充 `isDisplay/displayStatus/showFlag/visibleFlag/selected` 等字段。
- 扩展隐藏状态字段识别范围，补充 `is_hidden/is_hide/hiddenFlag` 等字段。
- 加载科目时刷新当前页面上下文，并使用页面可见科目名称对 MCP 清单做二次过滤。
- 重新执行 `native-helper/install_native_host.sh`，同步本机 Native Host 副本。
- 新增验证记录 `docs/test-evidence/2026-07-22-subject-code-name-visible-filter-static-validation.md`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

### 后续建议

重新加载扩展后再次点击“加载科目”。如隐藏科目仍出现，需要复制证据 JSON 中对应科目的 `raw` 字段，以便确认 MCP 真实显示状态字段名。

## 2026-07-22 23:15:39 CST

### 任务目标

修复 MCP 已连接但“加载科目”失败，错误为 `Cannot read properties of null (reading 'code')`。

### 执行动作

- 前端 `isDisplayedSubject()` 增加空项保护。
- 前端 `normalizeMcpSubjects()` 先过滤空项和非对象项，再读取科目代码。
- Native Host `normalizeSubjects()` 过滤阶段先排除 `null`。
- HTTP helper `normalizeSubjects()` 过滤阶段先排除 `null`。
- 重新执行 `native-helper/install_native_host.sh`，同步本机 Native Host 副本。
- 新增验证记录 `docs/test-evidence/2026-07-22-mcp-subject-null-item-static-validation.md`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

### 后续建议

重新加载 Chrome 扩展后再次点击“加载科目”。如仍失败，复制证据 JSON 中的 `message`，继续适配 MCP 原始字段结构。

## 2026-07-22 23:12:28 CST

### 任务目标

修复用户反馈：点击“加载科目”没有反应。

### 执行动作

- 点击“加载科目”后立即写入任务日志“开始加载科目清单”。
- 加载成功/失败均写入任务日志，避免 UI 看起来无响应。
- 本地 helper HTTP 请求增加 6 秒超时。
- Native Messaging 请求增加 12 秒超时。
- 事件绑定增加空元素保护，避免扩展侧栏 HTML/JS 缓存版本不一致时脚本中断。
- 重新执行 `native-helper/install_native_host.sh`，同步本机 Native Host 副本。
- 新增验证记录 `docs/test-evidence/2026-07-22-load-subject-click-feedback-static-validation.md`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

### 后续建议

在 Chrome 扩展页重新加载扩展后回到底稿页，点击“加载科目”。若任务日志没有出现“开始加载科目清单”，说明侧栏仍是旧版本，需要关闭侧栏再打开或重新加载扩展。

## 2026-07-22 23:09:22 CST

### 任务目标

按用户反馈修正科目选择流程：加载后才显示全选/全不选/确认；批量保存只处理右侧显示状态科目。

### 执行动作

- “显示科目”区域默认只保留“加载科目”按钮。
- MCP 科目加载完成后才显示“全选 / 全不选 / 确认”按钮。
- 新增科目选择确认状态，加载后的 MCP 科目未确认前不允许运行批量保存。
- 刷新页面读取的当前科目不强制确认，避免挡住当前公司单科目预演。
- 面板端和 helper 端均增加显示状态过滤，识别 `visible/isShow/show/display/displayed/checked` 及 `hidden/isHidden/hide/isHide` 等字段。
- 清理科目树旧重复函数，避免硬编码中文分类覆盖真实 MCP 层级。
- 重新执行 `native-helper/install_native_host.sh`，同步本机 Native Host 副本。
- 新增验证记录 `docs/test-evidence/2026-07-22-visible-subject-selection-static-validation.md`。

### 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本语法检查通过。
- 当前未执行真实保存。

### 后续建议

重新加载扩展后，在真实底稿页点击“加载科目”，检查是否只出现右侧显示状态科目，并验证“确认”后再运行预演。

## 2026-07-22 22:59:39 CST

### 任务目标

按用户截图要求，将科目清单做成类似天源左侧科目树的折叠效果。

### 执行动作

- 新增科目树构造逻辑，按科目代码前缀组织层级。
- 父节点用于展开/折叠；具体科目节点保留复选框。
- 当前科目所在路径默认展开。
- 增加常见父级科目中文名称兜底。
- 新增科目树相关样式。
- 新增验证记录 `docs/test-evidence/2026-07-22-subject-tree-ui-static-validation.md`。

### 验证结果

- sidepanel 语法检查通过。
- manifest JSON 解析通过。
- 扫描项目文件、Chrome 注册文件和本机 Native Host 安装目录，未发现完整 MCP token。

### 后续建议

重新加载扩展后点击“加载科目”，验证折叠树显示和末级复选框选择是否符合预期。

## 2026-07-22 22:53:48 CST

### 任务目标

解决 MCP token 需要反复配置的问题。

### 执行动作

- `extension/manifest.json` 新增 `storage` 权限。
- “配置 MCP”弹窗新增“记住本机”复选框。
- 默认仍只在当前侧边栏内存中保存 token。
- 用户勾选“记住本机”后，token 保存到 Chrome 本地扩展存储。
- “清除”会同时删除内存 token 和 Chrome 本地扩展存储 token。
- 更新 `docs/decisions/2026-07-22-session-token-configuration.md`。
- 新增 `docs/test-evidence/2026-07-22-remember-mcp-token-static-validation.md`。

### 验证结果

- sidepanel 和 content script 语法检查通过。
- manifest JSON 解析通过。
- 扫描项目文件、Chrome Native Host 注册文件和本机 Native Host 安装目录，未发现完整 MCP token 落盘。

### 后续建议

重新加载扩展；配置 MCP 时勾选“记住本机”；关闭并重新打开侧边栏验证是否自动读取 token。

## 2026-07-22 22:51:18 CST

### 任务目标

连接功能可用后，修复科目和公司清单的实际加载与展示问题。

### 执行动作

- 页面刷新时不再把 DOM 左侧科目树写入批量保存科目清单，避免出现“左侧显示科目”等脏文本。
- 点击“加载科目”后只使用 MCP 清单，不再回退到页面 DOM。
- 公司清单区域默认显示，用户可直接点击“加载清单”。
- Native Host 和 HTTP helper 的 MCP 返回值解析增加递归展开，兼容嵌套返回。
- 科目和公司字段增加多个兜底键名解析。
- 重新执行 `native-helper/install_native_host.sh`，更新本机 Native Host 副本。
- 新增验证记录 `docs/test-evidence/2026-07-22-mcp-list-rendering-static-validation.md`。

### 验证结果

- Native Host、HTTP helper、sidepanel、content script 语法检查通过。
- manifest JSON 解析通过。
- 扫描项目文件、Chrome 注册文件和本机 Native Host 安装目录，未发现完整 MCP token。

### 后续建议

重新加载扩展后，先确认 MCP 已连接，再分别点击“加载科目”和“加载清单”。如果科目仍为空，复制证据 JSON 供继续适配 MCP 原始字段结构。

## 2026-07-22 22:47:30 CST

### 任务目标

按用户要求优化 CLI 连接逻辑：CLI 未连接或需授权时，在插件面板点击后打开授权页面，授权后可连接。

### 执行动作

- 面板新增“授权 CLI”按钮。
- Native Host 新增 `cli_login` 动作，通过 `/usr/local/bin/tycpv login` 打开授权流程。
- 点击“授权 CLI”后，面板提示授权页已打开；授权完成后用户点击“启动/检查”刷新状态。
- 重新执行 `native-helper/install_native_host.sh`，更新本机 Native Host 副本。
- 新增决策记录 `docs/decisions/2026-07-22-cli-authorization-flow.md`。
- 新增验证记录 `docs/test-evidence/2026-07-22-cli-authorization-flow-static-validation.md`。

### 验证结果

- Native Host、sidepanel、content script 语法检查通过。
- manifest JSON 解析通过。
- 扫描项目文件、Chrome 注册文件和本机 Native Host 安装目录，未发现完整 MCP token。

### 后续建议

重新加载扩展后点击“授权 CLI”，完成浏览器授权，再点击“启动/检查”。如 `tycpv` 后续提供登录状态检查命令，可再把 CLI 状态从“安装可用”升级为“授权可用”。

## 2026-07-22 22:45:39 CST

### 任务目标

按用户要求优化 MCP 连接逻辑：未配置或断开时，可在插件面板点击配置，输入 token 后自动连接。

### 执行动作

- 面板新增“配置 MCP”按钮。
- 新增 token 输入弹窗，确认后自动执行连接检查。
- 侧边栏用运行内存保存本次 token，不写入文件。
- Native Messaging 请求会临时携带本次 token。
- Native Host 支持接收消息中的 `mcpToken`，并仅在进程内存中使用。
- 重新执行 `native-helper/install_native_host.sh`，更新本机安装目录下的 Native Host 副本。
- 新增决策记录 `docs/decisions/2026-07-22-session-token-configuration.md`。
- 新增验证记录 `docs/test-evidence/2026-07-22-session-token-configuration-static-validation.md`。

### 验证结果

- Native Host、sidepanel、content script 语法检查通过。
- manifest JSON 解析通过。
- 扫描项目文件、Chrome 注册文件和本机 Native Host 安装目录，未发现完整 MCP token。

### 后续建议

重新加载扩展，点击“配置 MCP”，粘贴真实 token 后确认连接。连接成功后再点击“加载科目”和“加载清单”。

## 2026-07-22 22:41:34 CST

### 任务目标

继续修复 Chrome Native Messaging 仍报 `Native host has exited.` 的问题。

### 执行动作

- 更新 `native-helper/install_native_host.sh`，将 Native Host 安装到本机隐藏目录：
  - `~/.tianyuan-workbench/native-helper/native_host.js`
  - `~/.tianyuan-workbench/native-helper/native_host_launcher.sh`
- Chrome Native Host 注册文件改为指向本机隐藏目录下的启动器，避免 OneDrive 中文路径和云盘同步层干扰执行。
- 启动器增加非敏感启动日志：
  - `~/.tianyuan-workbench/native-helper/native_host.log`
- 重新注册 Chrome Native Host。

### 验证结果

- Chrome 注册文件已指向 `~/.tianyuan-workbench/native-helper/native_host_launcher.sh`。
- 本机隐藏目录下的启动器可通过 Native Messaging stdio 协议返回 `health` 状态。
- 启动日志可写入。
- 返回状态中 CLI 可用，版本 `0.1.0`；MCP 因当前测试环境未提供 token 显示未配置。

### 后续建议

重新加载扩展并重新打开侧边栏后点“启动/检查”。如果仍显示 `Native host has exited.`，查看 `~/.tianyuan-workbench/native-helper/native_host.log` 是否新增记录，以判断 Chrome 是否真正执行到启动器。

## 2026-07-22 22:39:13 CST

### 任务目标

修复 Native Messaging 报错 `Native host has exited.`。

### 执行动作

- 更新 `native-helper/install_native_host.sh`，生成 `native-helper/native_host_launcher.sh`。
- Native Host 注册文件路径改为启动器脚本，而不是直接指向 `native_host.js`。
- 启动器使用绝对 Node 路径 `/usr/local/bin/node` 执行 `native_host.js`。
- 重新注册 Chrome Native Host。

### 验证结果

- 注册文件已指向 `native_host_launcher.sh`。
- 启动器 shell 语法检查通过。
- `native_host.js` 语法检查通过。
- 使用近似 Chrome 的空环境模拟 Native Messaging stdio 调用，启动器可正常返回 `health` 状态。

### 后续建议

在 `chrome://extensions` 重新加载扩展，然后回面板点“启动/检查”。如环境未配置 MCP token，预期状态应为 Helper 已启动、CLI `0.1.0`、MCP 未配置 token。

## 2026-07-22 22:36:31 CST

### 任务目标

继续排查面板点击“启动/检查”仍显示 Helper 未启动的问题。

### 执行动作

- 面板连接状态区新增“扩展 ID”和“连接信息”，用于显示 Native Messaging 真实错误。
- `checkConnections()` 失败时不再吞掉错误，会写入证据 JSON，并在顶部状态显示原因。
- Chrome Native Host 注册文件临时允许两个扩展 ID：
  - 新固定 ID：`lkflndcnklpeaejohaacoaolnmhgigoc`
  - 旧已加载 ID：`fdbllnmaaklkcmoacoapbibiggnndkfpa`
- 重新执行 `native-helper/install_native_host.sh` 生成注册文件。

### 验证结果

- 注册文件已包含两个 allowed origin。
- sidepanel 和 native host 语法检查通过。
- 扫描项目文件和 Chrome 注册文件，未发现完整 MCP token。

### 后续建议

重新加载扩展后，先查看面板显示的扩展 ID 和连接信息。如果仍失败，复制证据 JSON 中的 `reason`，即可判断是 host not found、forbidden、程序退出，还是 MCP token 未配置。

## 2026-07-22 22:31:01 CST

### 任务目标

降低 helper 启动门槛，实现插件面板点击后自动启动本地 helper。

### 执行动作

- 新增 `native-helper/native_host.js`，实现 Chrome Native Messaging Host。
- 新增 `native-helper/install_native_host.sh`，注册 Chrome Native Host。
- 更新 `extension/manifest.json`，加入固定扩展 key 和 `nativeMessaging` 权限。
- 更新 `extension/src/sidepanel/index.html`，将连接按钮改为“启动/检查”。
- 更新 `extension/src/sidepanel/sidepanel.js`，HTTP helper 不可用时自动回退到 Native Messaging。
- 执行 Native Host 注册，写入 Chrome 标准注册文件。
- 新增 `docs/decisions/2026-07-22-native-messaging-autostart.md`。
- 新增 `docs/test-evidence/2026-07-22-native-messaging-autostart-validation.md`。

### 验证结果

- Native Host 注册文件已生成，允许扩展 ID `lkflndcnklpeaejohaacoaolnmhgigoc`。
- Native Host stdio 协议直测可返回 health 状态。
- 测试环境未设置 MCP token 时返回 `VALUATION_MCP_TOKEN_NOT_SET`，未出现凭据落盘。
- CLI 状态检测到 `tycpv` 版本 `0.1.0`。
- 代码语法检查和 manifest JSON 解析通过。
- 项目文件及 Chrome 注册文件扫描未发现完整 MCP token。

### 后续建议

重新加载未打包扩展后，在面板点击“启动/检查”验证扩展侧自动拉起 Native Host。若要 MCP 显示已连接，需要通过本机安全环境提供 `VALUATION_MCP_TOKEN`。

## 2026-07-22 22:24:06 CST

### 任务目标

处理面板未加载上下文、上半部分信息过多、缺少 MCP/CLI 连接状态的问题。

### 执行动作

- 修复 `extension/src/content/content.js`：等待页面适配器加载完成后再发送上下文读取请求，避免首次注入消息丢失。
- 更新 `extension/src/sidepanel/index.html`：新增连接状态区；页面、表格、门禁合并为折叠的“页面诊断”。
- 更新 `extension/src/sidepanel/sidepanel.js`：新增 Helper/MCP/CLI 状态检查，加载公司和科目前先确认 MCP 已连接。
- 更新 `extension/src/sidepanel/styles.css`：新增连接状态和折叠诊断样式。
- 更新 `native-helper/server.js`：`/health?probe=1` 返回 MCP 探测结果和 tycpv CLI 状态。
- 新增 `docs/test-evidence/2026-07-22-panel-timeout-connection-ui-static-validation.md`。

### 验证结果

- helper、content script、sidepanel、page adapter 语法检查通过。
- manifest JSON 解析通过。
- helper `/health?probe=1` 可返回 Helper、MCP、CLI 状态。
- 测试环境未带 MCP token 时，MCP 正确显示未配置；CLI 检测到 `tycpv` 版本 `0.1.0`。
- 项目文件扫描未发现完整 MCP token 落盘。

### 后续建议

重新加载未打包扩展；用临时环境变量 `VALUATION_MCP_TOKEN` 启动 helper；打开天源底稿页后先确认连接状态三项，再点击“加载科目”和“加载清单”。

## 2026-07-22 22:16:39 CST

### 任务目标

修复批量保存模板中“科目和公司清单不能在插件面板稳定加载”的问题，改为通过天源 MCP/native-helper 加载结构化清单。

### 执行动作

- 新增 `native-helper/server.js`，实现本地只读 helper。
- 新增 `native-helper/README.md`，记录启动方式和安全边界。
- 更新 `extension/manifest.json`，允许面板访问 `http://127.0.0.1:8765/*`。
- 更新 `extension/src/sidepanel/sidepanel.js`，将“加载科目”和“加载清单”改为请求 helper 并渲染复选框。
- 新增 `docs/decisions/2026-07-22-mcp-native-helper-list-source.md`。
- 新增 `docs/test-evidence/2026-07-22-mcp-native-helper-static-validation.md`。

### 验证结果

- helper 语法检查通过。
- sidepanel 和 page adapter 语法检查通过。
- manifest JSON 解析通过。
- helper 可启动，`/health` 返回正常，且不返回凭据信息。
- 项目文件扫描未发现完整 MCP token 落盘。

### 后续建议

用本机临时环境变量 `VALUATION_MCP_TOKEN` 启动 helper 后，重新加载扩展，在真实天源底稿页验证公司和科目清单是否完整进入插件面板。

## 2026-07-22 21:14:43 CST

### 任务目标

接手新项目“天源系统浏览器插件 / 天源浏览器工作台”，迁移旧项目上下文交接包，读取核心文件，创建新项目结构和项目管理记忆。

### 使用文件

- 源目录：`/Users/zer0y/Library/CloudStorage/OneDrive-个人/共享/2026-天源/20260529 中显光电/项目管理/_work/tianyuan_browser_extension/context_handoff`
- 压缩包：`/Users/zer0y/Library/CloudStorage/OneDrive-个人/共享/2026-天源/20260529 中显光电/项目管理/_work/tianyuan_browser_extension/tianyuan_browser_extension_context_handoff_20260722.zip`
- 已读取：
  - `docs/context/README.md`
  - `docs/context/天源浏览器插件可行性与架构草案.md`
  - `docs/context/天源评估核实附件上传能力记录.md`
  - `docs/context/ego_asset_check_upload_template.sh`
  - `docs/context/tianyuan-asset-draft-save.SKILL.md`
  - `docs/context/save_asset_draft.js`

### 执行动作

- 核对源目录文件清单。
- 核对压缩包可打开；发现压缩包列表中的中文文件名存在编码噪声，因此复制以源目录实际文件为准。
- 创建目录：
  - `docs/context/`
  - `docs/decisions/`
  - `docs/test-evidence/`
  - `extension/`
  - `native-helper/`
  - `skills/`
  - `prototypes/`
  - `项目管理/`
- 复制旧项目交接文件到 `docs/context/`。
- 创建项目管理四件套并写入规则、长期事实、当前状态和本次日志。

### 输出文件

- `docs/context/README.md`
- `docs/context/天源浏览器插件可行性与架构草案.md`
- `docs/context/天源评估核实附件上传能力记录.md`
- `docs/context/ego_asset_check_upload_template.sh`
- `docs/context/tianyuan-asset-draft-save.SKILL.md`
- `docs/context/save_asset_draft.js`
- `项目管理/AGENTS.md`
- `项目管理/PROJECT_MEMORY.md`
- `项目管理/PROJECT_STATE.md`
- `项目管理/TASK_LOG.md`

### 验证结果

- 源目录实际存在 6 个交接文件，总大小 41,890 字节。
- 新项目 `docs/context/` 已复制 6 个交接文件。
- 已读取 README 和 5 个核心文件。
- 项目管理四件套已创建。

### 发现问题

- 压缩包可打开，但 `unzip -l` 输出的两个中文文件名乱码；本次未从压缩包解压覆盖，避免中文文件名损坏。
- 旧项目上传测试未完成正式保存闭环，因为编辑锁由其他用户持有；这已写入项目风险和完成门禁。

### 后续建议

下一步先做只读 MVP：建立 Chrome Manifest V3 骨架、content script 与 MAIN-world adapter 消息桥，只读取并展示当前天源页面上下文和门禁状态，形成第一份 `docs/test-evidence/` 验证记录后再进入保存和上传动作。

## 2026-07-22 21:19:57 CST

### 任务目标

执行第一步开发建议：搭建 Chrome Manifest V3 只读 MVP，实现天源资产基础法底稿页面上下文采集和侧边栏展示。

### 使用文件

- `项目管理/AGENTS.md`
- `项目管理/PROJECT_MEMORY.md`
- `项目管理/PROJECT_STATE.md`
- `docs/context/README.md`
- `docs/context/天源浏览器插件可行性与架构草案.md`
- `docs/context/天源评估核实附件上传能力记录.md`

### 执行动作

- 创建 `extension/manifest.json`。
- 创建 background service worker，支持点击扩展图标打开 Side Panel。
- 创建 content script，负责注入页面适配器并转发读取请求。
- 创建 MAIN-world 页面适配器，只读取 URL、SpreadJS、表头、目标字段、上传 cellType、保存按钮、登录/编辑锁/权限提示。
- 创建侧边栏 HTML/CSS/JS，用于刷新、展示上下文和复制证据 JSON。
- 创建 MVP 技术决策记录。
- 创建静态验证记录。

### 输出文件

- `extension/README.md`
- `extension/manifest.json`
- `extension/src/background/service_worker.js`
- `extension/src/content/content.js`
- `extension/src/injected/page_adapter.js`
- `extension/src/sidepanel/index.html`
- `extension/src/sidepanel/styles.css`
- `extension/src/sidepanel/sidepanel.js`
- `docs/decisions/2026-07-22-mvp-readonly-context-panel.md`
- `docs/test-evidence/2026-07-22-readonly-mvp-static-validation.md`

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- 4 个 JS 文件已通过语法检查。
- 已扫描写入关键词；当前插件未实现上传、保存、点击或 `activateEditor()` 调用。

### 发现问题

- 当前尚未在真实天源页面运行，因此未形成 live 页面证据。
- 真实页面上的编辑锁、按钮文案和 SpreadJS 对象需要下一轮实机验证。

### 后续建议

在 Chrome 开发者模式加载 `extension/`，打开真实天源资产基础法底稿页，点击侧边栏“刷新”，保存证据 JSON 到 `docs/test-evidence/` 后再设计保存和上传动作。

## 2026-07-22 21:22:52 CST

### 任务目标

修复 ego lite/Chrome 加载扩展时报错：`Invalid value for 'web_accessible_resources[0]'. Invalid match pattern.`

### 执行动作

- 将 `extension/manifest.json` 中 `web_accessible_resources[0].matches` 从 `https://excel.zhrdc.net/ty/*` 调整为 `https://excel.zhrdc.net/*`。
- 保持 content script 匹配范围仍为 `https://excel.zhrdc.net/ty/*`。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- 4 个 JS 文件已通过语法检查。

### 后续建议

在扩展加载失败弹窗中点击“重试”；若仍未刷新，则取消后重新选择 `extension/` 目录加载。

## 2026-07-22 21:27:23 CST

### 任务目标

根据加载成功后的页面截图，补强当前停留在 `/equity/list` 公司列表页时的只读识别和提示。

### 执行动作

- 修改 `extension/src/injected/page_adapter.js`，支持从 `/ty/operation/<projectId>/...` 通用路径读取项目 ID。
- 增加 `isEquityListRoute` 标记。
- 修改侧边栏页面，增加“公司列表”字段。
- 修改侧边栏状态提示：列表页提示点击某行“资产基础法”进入底稿。

### 验证结果

- `extension/src/injected/page_adapter.js` 已通过语法检查。
- `extension/src/sidepanel/sidepanel.js` 已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。

### 后续建议

在扩展页点击重新加载或更新后，回到天源公司列表页点侧边栏“刷新”；再点击某行“资产基础法”进入底稿页，刷新侧边栏，形成真实页面 JSON 证据。

## 2026-07-22 21:30:07 CST

### 任务目标

解决用户进入真实底稿页后侧边栏显示 `CONTENT_SCRIPT_UNAVAILABLE`，且扩展页不易找到单卡刷新按钮的问题。

### 执行动作

- 在 `extension/manifest.json` 增加 `scripting` 权限。
- 修改 `extension/src/sidepanel/sidepanel.js`：首次发送消息失败时，自动向当前 tab 注入 `src/content/content.js`，再重试读取上下文。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/sidepanel/sidepanel.js`、`extension/src/content/content.js`、`extension/src/injected/page_adapter.js` 已通过语法检查。

### 后续建议

因权限变化，需要在扩展页点顶部“更新”，或重新加载未打包扩展。之后回到底稿页，直接点侧边栏“刷新”。

## 2026-07-22 21:31:15 CST

### 任务目标

记录只读 MVP 在真实天源资产基础法底稿页的首次成功验证。

### 使用文件

- 用户截图：`/var/folders/p9/hv7qggk90q7_5qnth4hf4yb00000gn/T/codex-clipboard-9d693675-929a-4271-9c23-20ae12dd4517.png`

### 执行动作

- 将截图复制到 `docs/test-evidence/2026-07-22-readonly-mvp-live-success.png`。
- 创建真实页面验证记录 `docs/test-evidence/2026-07-22-readonly-mvp-live-success.md`。
- 更新项目状态。

### 验证结果

- 页面为资产基础法底稿页。
- 项目 ID 读取为 `166983428210689`。
- 主体 ID 读取为 `166983430307866`。
- 科目读取为 `C3-1-2`。
- SpreadJS 已找到。
- Sheet 读取为 `应付账款`。
- “查证资料索引”通过表头定位为 `P` 列，目标 `P2`。
- 上传单元格识别为 `operation-upload-cell`，具备 `activateEditor`。
- 保存按钮可见。
- 登录状态未见拦截。

### 后续建议

进入“保存当前科目”dry run 设计；仍保持不点击保存、不上传文件，先展示将执行动作和门禁状态。

## 2026-07-22 21:41:56 CST

### 任务目标

根据用户要求，将 `tianyuan-asset-draft-save` skill 的批量保存能力迁入插件面板，作为后续批量任务的第一个独立模板。

### 使用文件

- `/Users/zer0y/codex-skills/skills/tianyuan-asset-draft-save/SKILL.md`
- `extension/src/content/content.js`
- `extension/src/injected/page_adapter.js`
- `extension/src/sidepanel/index.html`
- `extension/src/sidepanel/sidepanel.js`
- `extension/src/sidepanel/styles.css`

### 执行动作

- 扩展 content script 消息桥，支持页面动作请求。
- 页面适配器新增 `save_asset_draft_current_subject` 动作。
- 侧边栏新增“批量保存底稿”任务模板。
- 支持多个科目代码逐个打开底稿 URL。
- 支持公司范围：当前公司、部分公司、全部公司。
- 支持执行方式：预演、不点击保存；正式执行、点击保存。
- 正式执行要求勾选确认。
- 新增决策记录和静态验证记录。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- 4 个 JS 文件已通过语法检查。
- 未发现凭据保存逻辑。
- 当前未执行真实保存。

### 后续建议

在 Chrome 扩展页点击“更新”后，回到底稿页先运行预演模式：当前公司、当前科目。预演证据通过后，再选择一个可控科目做正式保存，并用系统回读确认结果。

## 2026-07-22 21:50:06 CST

### 任务目标

根据用户反馈修正批量保存模板交互：科目不手工输入、公司用清单多选、面板自适应宽度。

### 执行动作

- 页面适配器新增 `subjects` 采集，返回当前 URL 科目和页面可见科目代码。
- 页面适配器新增 `list_asset_draft_companies` 动作，打开 `选择更多` 弹窗读取公司清单，然后关闭弹窗，不点击 `确定`。
- 侧边栏将“科目代码”文本框替换为“显示科目”复选清单。
- 侧边栏将“部分公司匹配”文本框替换为“公司清单”加载和复选清单。
- 批量保存配置改为从勾选项取科目和公司。
- CSS 改为随侧边栏宽度自适应的 `auto-fit/minmax` 布局。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/content/content.js`、`extension/src/injected/page_adapter.js`、`extension/src/sidepanel/sidepanel.js` 已通过语法检查。
- 当前未执行真实保存。

### 后续建议

在扩展页点击“更新”后，回到底稿页刷新面板，检查“显示科目”清单；选择“部分公司”后点击“加载”，检查公司清单是否完整。确认 UI 后再跑预演。

## 2026-07-22 21:56:39 CST

### 任务目标

按用户澄清，纠正批量保存模板交互：不是在天源原生弹窗中选择并确认，而是把科目清单、公司清单加载到插件面板中选择。

### 执行动作

- 恢复公司清单读取逻辑：打开 `选择更多` 弹窗、读取公司项、关闭弹窗，不点击 `确定`。
- 移除面板中的“打开选择器/确认选择”交互，改为“加载清单”。
- 保留公司面板多选，执行时再根据面板勾选结果应用到天源公司选择弹窗。
- 新增按左侧科目树文本切换科目的页面动作 `activate_subject_by_label`。
- 批量执行支持 `subjectCode` URL 打开和左侧树名称点击两类科目目标。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/background/service_worker.js`、`extension/src/content/content.js`、`extension/src/injected/page_adapter.js`、`extension/src/sidepanel/sidepanel.js` 已通过语法检查。
- 未发现凭据保存逻辑。

### 后续建议

更新扩展后，在当前底稿页刷新面板；检查科目树项是否加载到“显示科目”；公司范围选“部分公司”，点击“加载清单”，确认公司列表进入面板。

## 2026-07-22 22:02:10 CST

### 任务目标

修复用户反馈：科目没有加载出复选清单，公司清单没有加载出来。

### 执行动作

- 新增面板按钮“加载科目”，显式调用 `list_asset_draft_subjects`。
- `list_asset_draft_subjects` 会尝试读取左侧科目树；如果只读到当前项，会尝试点击“阶段”展开后再读。
- 公司清单入口从只找 `选择更多` 扩展为兼容 `选择更多`、`公司主体`、`公司列表`、`股权结构` 等文字。
- 公司弹窗读取改为优先抓取 `.el-checkbox__label`，避免把父容器大段文本当作公司。
- 入口查找过滤超长文本，避免误点整页容器。

### 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- `extension/src/injected/page_adapter.js`、`extension/src/sidepanel/sidepanel.js` 已通过语法检查。

### 后续建议

更新扩展后在当前页尝试“加载科目”和“加载清单”。如果公司仍加载失败，复制证据 JSON 中的 `visibleControls`，据此锁定真实入口按钮。

## 2026-07-23 09:27:48 CST

### 任务目标

修复用户反馈：`其他应付款` 没有加载出来，且多层级/同名父子科目不应被错误过滤。

### 执行动作

- 将页面左侧科目树采集从坐标启发式升级为 Element UI 树递归读取。
- 同名树节点按真实树路径去重，避免 `其他应付款 -> 其他应付款` 被压缩。
- 面板科目过滤改为所有页面可见树节点参与匹配，不再只依赖叶子节点。
- 加载科目证据 JSON 新增页面树读取数量、MCP 标准化数量、最终科目数量摘要。
- 页面适配器版本升级到 `2026-07-23-subject-tree-recursive-v3`，便于重新加载扩展后替换旧脚本。

### 验证结果

- `extension/src/injected/page_adapter.js` 已通过语法检查。
- `extension/src/content/content.js` 已通过语法检查。
- `extension/src/sidepanel/sidepanel.js` 已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- 测试证据已写入 `docs/test-evidence/2026-07-23-subject-tree-recursive-v3-static-validation.md`。

### 后续建议

重新加载未打包扩展后，在当前天源底稿页点击“加载科目”，确认 `其他应付款` 是否显示在真实层级下；若仍异常，查看证据 JSON 的 `pageSubjectResult` 和 `subjectContextSummary`。

## 2026-07-23 09:27:48 CST

### 任务目标

修复用户截图反馈：科目树有滚动条，但“加载科目”仍只显示上半部分节点，`其他应付款` 仍未进入清单。

### 执行动作

- 在页面适配器中新增树容器滚动采集。
- 加载科目时自动对可滚动的左侧树容器分段下拉并合并多轮采集结果。
- 保留前一轮递归读取和同名父子节点路径去重逻辑。
- 同步将适配器版本升级到 `2026-07-23-subject-tree-scroll-v4`。

### 验证结果

- `extension/src/injected/page_adapter.js` 已通过语法检查。
- `extension/src/content/content.js` 已通过语法检查。
- `extension/src/sidepanel/sidepanel.js` 已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- 新证据文件已写入 `docs/test-evidence/2026-07-23-subject-tree-scroll-v4-static-validation.md`。

### 后续建议

重新加载未打包扩展后再次点击“加载科目”，重点看 `其他应付款` 是否能在滚动到底后出现；若仍缺失，查看证据 JSON 里页面树采集条数是否随滚动增加。

## 2026-07-23 09:27:48 CST

### 任务目标

修复用户截图反馈：加载后只剩 `C3` 分支，说明页面树仍不完整且不应继续硬裁 MCP 清单。

### 执行动作

- 在侧栏新增页面科目树可用性判断。
- 当页面树只读到首屏碎片时，自动回退到 MCP 显示字段生成清单。
- 增加明确日志提示，说明当前是回退路径而不是页面树完整结果。
- 将适配器版本继续提升到 `2026-07-23-subject-tree-fallback-v5`。

### 验证结果

- `extension/src/injected/page_adapter.js` 已通过语法检查。
- `extension/src/content/content.js` 已通过语法检查。
- `extension/src/sidepanel/sidepanel.js` 已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- 新证据文件已写入 `docs/test-evidence/2026-07-23-subject-tree-fallback-v5-static-validation.md`。

### 后续建议

重新加载未打包扩展后再次点击“加载科目”，确认不再只显示 `C3` 单一路径；如果页面树仍不完整，面板应明确提示已回退到 MCP 显示字段。

## 2026-07-23 09:27:48 CST

### 任务目标

修复用户截图反馈：侧栏刷新直接报 `TIANYUAN_WORKBENCH_GET_CONTEXT_TIMEOUT`，导致工作台暂时不能用。

### 执行动作

- 将 `collectContext()` 改为轻量上下文，只返回页面基础信息。
- 默认不再在刷新上下文里塞整棵科目树。
- 缩减控件预览数量，降低页面消息响应压力。
- 将适配器版本升级到 `2026-07-23-context-lite-v6`。

### 验证结果

- `extension/src/injected/page_adapter.js` 已通过语法检查。
- `extension/src/content/content.js` 已通过语法检查。
- `extension/src/sidepanel/sidepanel.js` 已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- 新证据文件已写入 `docs/test-evidence/2026-07-23-context-lite-v6-static-validation.md`。

### 后续建议

重新加载未打包扩展后先刷新侧栏，确认超时消失；然后再点“加载科目”继续验证清单。

## 2026-07-23 09:27:48 CST

### 任务目标

修复用户反馈：天源左侧已显示多个科目，但插件清单仍漏掉 `其他应付款` 等项目，且层级名称存在串层风险。

### 执行动作

- 科目匹配扩展为名称、父级名称、路径和原始 MCP 名称字段多候选匹配。
- 支持 `其他应付款-其他应付款` 这类名称后缀形式。
- 页面树不完整时，将页面明确匹配到的科目并入 MCP 显示科目，而不是丢弃。
- 增加 `fallbackCount` 证据字段。

### 验证结果

- 三个 JS 文件已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- 本地样例匹配通过：`其他应付款-其他应付款`、`电子设备`、`其他流动资产`。
- 新证据文件已写入 `docs/test-evidence/2026-07-23-subject-name-path-match-v7-static-validation.md`。

### 后续建议

重新加载未打包扩展后点击“加载科目”，检查页面已经显示的 `其他应付款`、`其他流动资产`、`电子设备` 是否完整进入面板。

## 2026-07-23 09:27:48 CST

### 任务目标

按用户要求改为加载全部科目，避免 MCP 与页面显示状态字段不一致造成漏项。

### 执行动作

- 科目面板改为使用 MCP 全量科目建立完整代码层级。
- 显示状态科目默认勾选。
- 隐藏状态科目保留并标记“（隐藏）”，默认不勾选。
- 面板文案改为“全部科目”。
- 加载结果记录显示数量、隐藏数量。

### 验证结果

- 三个 JS 文件已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- 全量科目证据文件已写入 `docs/test-evidence/2026-07-23-all-subjects-with-status-static-validation.md`。

### 后续建议

重新加载未打包扩展后点击“加载科目”，确认全部科目进入面板，隐藏科目显示“（隐藏）”且默认未勾选。

## 2026-07-23 09:27:48 CST

### 任务目标

修复用户反馈：全量科目模式下，父级科目名称大量错位，例如 `C4-8` 被显示为最后一个子科目名称。

### 执行动作

- 检查父级建树逻辑和 `pathNameForCode()`。
- 确认旧逻辑按路径起点索引，无法处理只返回后半段的 MCP 路径。
- 改为按路径末端和代码层级对齐。
- 收集所有子科目路径，对父级名称进行投票，子路径优先、当前对象名称兜底。

### 验证结果

- 三个 JS 文件已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- `固定资产/房屋建筑物`、`非流动资产/固定资产/电子设备` 等本地路径样例通过。
- 新证据文件已写入 `docs/test-evidence/2026-07-23-parent-subject-path-alignment-static-validation.md`。

### 后续建议

重新加载未打包扩展后点击“加载科目”，重点检查 `C4-8` 及其他父级名称是否与真实层级一致。

## 2026-07-23 09:27:48 CST

### 任务目标

修复用户反馈：父级科目名称仍有错位，同时全量科目模式会把隐藏科目带入批量处理风险。

### 执行动作

- 页面科目树节点增加真实父级路径。
- 父级名称按路径末端和代码层级重建。
- 恢复只加载显示状态科目。
- 页面树完整时使用页面显示状态，页面树不可用时使用 MCP 显示字段兜底。
- 隐藏科目不再进入批量执行清单。
- 页面适配器版本升级为 `2026-07-23-page-tree-path-v7`。

### 验证结果

- 三个 JS 文件已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- 新证据文件已写入 `docs/test-evidence/2026-07-23-page-tree-path-display-filter-v8-static-validation.md`。

### 后续建议

重新加载未打包扩展后点击“加载科目”，检查 `C4-8` 等父级名称和隐藏科目过滤结果。

## 2026-07-23

### 任务目标

修复用户反馈：页面左侧明确显示土建工程、土地使用权等科目，但插件清单仍然漏项。

### 执行动作

- 确认旧逻辑只从页面读取名称和层级，无法直接获得批量执行所需的 `subjectCode`。
- 从 Vue 节点数据、DOM 属性和节点链接中读取科目代码。
- 页面树结果增加 `subjectCode` 和父级路径。
- 侧栏改为科目代码优先匹配，名称和路径作为兜底。
- MCP 缺项但页面读到代码时，补充页面来源科目候选。
- 适配器版本升级为 `2026-07-23-page-subject-code-v8`。

### 验证结果

- 三个 JS 文件已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- 新证据文件已写入 `docs/test-evidence/2026-07-23-page-subject-code-read-static-validation.md`。

### 后续建议

重新加载未打包扩展后点击“加载科目”，查看证据 JSON 中的 `pageTreeCodeCount`，并检查土建工程、土地使用权等科目。

## 2026-07-23

### 任务目标

修复用户反馈：页面科目树已经展开，但插件仍因 MCP 映射失败产生遗漏，无法照抄页面树。

### 执行动作

- 页面树直接作为显示范围、层级和顺序来源。
- 只将页面叶子科目设置为可勾选项。
- MCP 只补充科目代码，不再过滤页面节点。
- 编号仅在页面直读，或 MCP 唯一同名同层级匹配时展示。
- 编号不能可靠匹配时不展示，保留层级并使用页面路径执行。
- 无代码页面科目使用 `treepath:` 保存完整路径。
- 页面适配器新增 `activate_subject_by_path`，按完整路径切换同名科目。
- 页面适配器版本升级为 `2026-07-23-page-tree-mirror-v9`。

### 验证结果

- 三个 JS 文件已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- 新证据文件已写入 `docs/test-evidence/2026-07-23-page-tree-mirror-static-validation.md`。

### 后续建议

重新加载未打包扩展后点击“加载科目”，逐项对照页面树，并查看证据 JSON 的 `pageMirrorCount`。

## 2026-07-23

### 任务目标

隐藏科目编号的界面显示，保留内部执行映射。

### 执行动作

- 修改科目显示标题，只显示名称和层级。
- 保留代码、`treepath` 和页面路径作为内部批量执行值。
- 不改变科目选择、确认和批量执行逻辑。

### 验证结果

- 三个 JS 文件已通过语法检查。
- `extension/manifest.json` 已通过 JSON 解析。
- 新证据文件已写入 `docs/test-evidence/2026-07-23-hide-subject-codes-ui-static-validation.md`。

## 2026-07-23

### 任务目标

固定用户初步测试通过的当前天源浏览器工作台成果，为后续新功能开发提供稳定起点。

### 固定范围

- 页面科目树镜像。
- 页面显示状态过滤。
- 父级层级和页面顺序保留。
- 科目编号隐藏，内部执行映射保留。
- 页面路径执行和同名科目定位。
- 批量保存、批量退出编辑现有模块。

### 固定结果

- 基线名称：`baseline-page-tree-mirror-20260723`
- 后续新功能从该基线继续。
- 不再在新功能开发中随意修改上述科目基础能力。

## 2026-07-23 14:40 CST

### 任务目标

将原单页侧栏改造成多页面天源浏览器工作台。

### 执行动作

- 新增首页、连接配置页、批量保存页和批量退出编辑页。
- 顶部统一显示 Helper、MCP、CLI 状态。
- 使用 hash 内部路由切换页面，不重新加载侧栏。
- 公司和科目范围组件在两个功能页之间复用，但状态按模块独立保存。
- 分别保存每个模块的勾选、确认、日志和证据。
- 任务执行期间禁用路由按钮。
- 增加侧栏聚焦和 30 秒连接状态刷新。
- 优化窄侧栏单列布局，日志和证据默认折叠。

### 验证结果

- 三个 JavaScript 文件通过语法检查。
- Manifest 通过 JSON 解析。
- HTML 与 JavaScript 元素引用全部对应。
- `git diff --check` 通过。
- 本机 Chrome Headless 四个路由页面均生成静态预览。
- 未修改页面科目树镜像和内部执行映射逻辑。

### 后续建议

重新加载未打包扩展，依次检查首页、连接配置、批量保存和批量退出编辑；分别选择不同范围后往返切换，确认两套范围互不覆盖。

## 2026-07-23 15:30 CST

### 任务目标

将 CLI 的资产基础法明细表和申报表导出能力加入天源浏览器工作台。

### 执行动作

- 核对本机 `tycpv 0.1.0` 两个导出命令及参数。
- 首页新增“导出明细表”和“导出申报表”。
- 新增两个独立导出页面，只复用公司范围，不显示科目范围。
- 进入导出页后自动通过 MCP 加载公司清单。
- 新增 macOS 文件夹选择器，并将用户选择的绝对路径传给 CLI。
- Native Host 新增两个导出白名单、参数校验和持续进度消息。
- 侧栏新增进度条、百分比、最新状态、执行日志和结果证据。
- 扩展版本升级为 `0.2.0`。
- 更新并安装本机 Helper 运行副本。

### 验证结果

- 两个 CLI 帮助信息确认支持项目、公司和输出目录参数。
- Native Host 和扩展 JavaScript 语法检查通过。
- Manifest JSON 和 103 个 HTML 元素引用检查通过。
- 假 CLI 流式协议测试从 3% 推进到 100%，回传 2 个模拟文件。
- 非白名单命令和相对目录均被拦截。
- 本机 Helper 源码与安装副本哈希一致。
- 已安装 Native Host 健康检查成功，CLI 版本为 `0.1.0`。
- 未执行真实项目导出。

### 后续建议

重新加载扩展后，先各选择 1 至 2 个公司，在临时目录执行明细表和申报表导出，核对生成结果后再扩大范围。

## 2026-07-23 16:20 CST

### 任务目标

审计并接入评估明细表、申报表打印格式 Skill，增加批量文件处理页面。

### 执行动作

- 解包并审计两个 2026-07-21 Skill 压缩包。
- 将 Skill 源码迁入项目 `skills/`。
- 修正申报表基础脚本固定用户路径。
- 为明细表 `.xlsm` 增加 VBA 保留加载。
- Native Host 新增多文件、文件夹和输出目录选择器。
- 新增递归工作簿发现、输出冲突命名和 500 文件上限。
- 实现覆盖、源目录副本、新目录三种输出策略。
- 覆盖模式改为临时副本处理、完整性检查和原子替换。
- 首页新增两个打印格式模块和独立功能页面。
- 新增进度条、文件级状态、日志和结果证据。
- 扩展版本升级为 `0.3.0`。
- 将 Skill 与 Helper 同步安装到本机运行目录。

### 验证结果

- Python 3.9.6 和 openpyxl 3.1.5 可用。
- 两个 Python 脚本通过编译检查。
- Native Host、侧栏脚本和 Manifest 检查通过。
- HTML 133 个 ID 与 JavaScript 元素全部对应。
- 样本文件夹批量处理 2 个明细表成功。
- 新目录申报表处理成功。
- 覆盖模式原子替换成功，无临时文件和备份残留。
- 所有样本输出通过 ZIP 完整性检查。
- 已安装 Native Host 使用正式运行副本成功处理申报表样本。
- 未修改或处理用户正式工作簿。

### 后续建议

重新加载扩展后，先选择真实导出文件的副本，使用“在源文件夹创建打印版副本”检查 WPS 打印预览；确认无误后再使用覆盖模式。

## 2026-07-23 15:55 CST

### 任务目标

将天源浏览器工作台完整打包为可交给 Windows 用户测试的 Windows x64 发行包，并提供可由桌面 Agent 直接执行的安装说明。

### 输入资料

- Windows 天源 CLI：
  `/Users/zer0y/Library/Containers/com.tencent.WeWorkMac/Data/Documents/Profiles/7ACF52D60EA37529B905680384A5F454/Caches/Files/2026-07/1CA2722CF00C64B2547958B6B4AB89D5/tycpv-setup-0.1.0-win-x64.exe`
- Node.js 24.14.0 Windows x64 官方运行时。
- Python 3.14.6 Windows x64 embeddable 官方运行时。
- `openpyxl 3.1.5`、`et_xmlfile 2.0.0` 离线 wheels。

### 执行动作

- 核验 `tycpv` 安装包为 Windows Inno Setup，产品名 `tycpv`，版本 `0.1.0`。
- 将 Windows CLI 安装包复制到本机依赖目录，不放入 OneDrive 运行依赖目录。
- Native Host 增加 Windows CLI、Python 和打印脚本路径。
- Windows 文件/文件夹选择改用 PowerShell + Windows Forms。
- Excel ZIP 完整性校验改为 Python `zipfile.testzip()`，移除固定 `/usr/bin/unzip` 依赖。
- 覆盖源文件改为同目录临时备份、替换和失败回滚，兼容 Windows 目标文件已存在行为。
- CLI 输出文件识别增加 Windows 盘符和反斜杠路径。
- Native Host 增加 `--self-test`。
- 使用 Node.js SEA 生成 Windows x64 独立 `native_host.exe`。
- 制作 `安装.cmd`、`安装.ps1`、`卸载.cmd`、`卸载.ps1`。
- 安装脚本将运行文件放到 `%LOCALAPPDATA%\TianyuanWorkbench`，并写入当前用户 Native Messaging 注册表。
- Python 改为便携运行时，不修改系统 Python，不依赖目标电脑联网安装。
- 增加 `安装使用说明.md` 和 `交给Agent安装.md`。
- 首次 ZIP 检查发现 macOS `._` 资源文件后，改用 `zip -X` 重建干净包。

### 输出

- `dist/天源浏览器工作台-v0.3.0-Windows-x64-测试版-20260723.zip`
- `dist/天源浏览器工作台-v0.3.0-Windows-x64-测试版-20260723.zip.sha256`
- `docs/test-evidence/windows-x64-release-20260723.md`

### 验证结果

- Native Host JavaScript 语法检查通过。
- Windows 构建脚本和 macOS 构建脚本语法检查通过。
- Python 打印脚本编译检查通过。
- Native Messaging `health` 帧协议检查通过。
- Windows Native Host 为 PE32+ x86-64 console executable。
- Windows 便携 Python 为 PE32+ x86-64 console executable。
- ZIP 完整性检查通过，无 `._`、`.DS_Store` 或 `__MACOSX`。
- 解包后 266 个文件全部通过内部 `SHA256SUMS`。
- 扩展版本 `0.3.0`，固定 ID 对应 key 保留。
- 未发现内嵌 MCP token 模式。
- Windows 安装脚本未残留 macOS 专用路径。

### 验证边界

- 当前没有真实 Windows 执行环境，尚未验证 PowerShell 安装、注册表、SmartScreen、Chrome Native Host 拉起和 CLI 授权。
- `tycpv` 安装器和 SEA Native Host 没有可用发布者签名，可能出现未知发布者提示。

### 下一步

将 ZIP 和同名 `.sha256` 一并发给 Windows 测试用户。对方可双击 `安装.cmd`，也可把 `交给Agent安装.md` 交给具备 Windows 桌面控制能力的 Agent。

## 2026-07-23 16:30 CST

### 任务目标

根据 Windows 测试反馈重构安装包：已有天源 CLI 和 Python 时不重复执行完整依赖部署，并同步修改使用说明和 Agent 安装提示。

### 执行动作

- 将安装器从“固定完整安装”改为自动双模式。
- 天源 CLI 可运行时直接复用，不校验、不执行包内 CLI 安装器。
- 新增 Python 候选检测：环境变量、既有工作台 Python、PATH、用户 Python 目录、Program Files 和 PythonCore 注册表。
- 仅接受 Python 3.9 或以上版本。
- 已有 Python 包含 `openpyxl >= 3.1.5` 和 `et_xmlfile` 时直接复用。
- 已有 Python 缺少依赖且 pip 可用时，从包内两个离线 wheel 使用 `--user` 补齐。
- 离线补齐失败、Python 版本过低或无 pip 时，才校验并复制包内便携 Python。
- 将安装包校验改为按需分层：
  - 快速路径校验版本文件、扩展、Native Host 和 Skill；
  - CLI 安装前校验 CLI 安装器；
  - wheel 补齐前校验两个 wheels；
  - 便携 Python 回退前校验便携运行时。
- 安装报告新增安装模式和安装耗时。
- Windows 构建包增加独立 `runtime/python-wheels/`。
- 发行修订号改为 `r2`，不改变扩展功能版本 `0.3.0`。
- 更新 `安装使用说明.md` 和 `交给Agent安装.md`。

### 输出

- `dist/天源浏览器工作台-v0.3.0-Windows-x64-测试版-r2-20260723.zip`
- `dist/天源浏览器工作台-v0.3.0-Windows-x64-测试版-r2-20260723.zip.sha256`
- `docs/test-evidence/windows-x64-release-r2-20260723.md`

### 验证结果

- ZIP 完整性通过，无 macOS 元数据。
- 包内全量 SHA-256 通过。
- 快速路径核心 17 个文件校验通过。
- wheel 补齐路径 2 个文件校验通过。
- CLI 回退路径 1 个安装器校验通过。
- 便携 Python 回退路径 241 个文件校验通过。
- Windows Native Host 和便携 Python 均为 x86-64 PE。
- 构建脚本、Native Host 语法和凭据扫描通过。

### 验证边界

- 当前构建机仍不是 Windows，PowerShell 分支和实际耗时需要在测试电脑回读 `%LOCALAPPDATA%\TianyuanWorkbench\安装检查结果.txt` 验证。

### 下一步

让当前 Windows 测试用户改用 r2 包重新安装，并反馈安装模式、安装耗时、CLI/Python/openpyxl 路径及三项连接状态。
## 2026-07-23 22:17 CST

### 任务目标

修复连接配置页点击“保存绑定 / 绑定当前对话”没有反应的问题，并完成自动连接链路验证。

### 原因

- Connector Bridge 当时未运行，当前页面也没有 Connector session。
- 旧按钮逻辑只在页面顶部显示缺少 session 的提示。
- 用户位于绑定区域时看不到顶部提示，因此表现为按钮没有反应。

### 执行动作

- 新增 `ensureCurrentPageConnectorSession()`。
- 绑定按钮会自动启动 Connector、读取当前天源标签页、注册页面 session，再保存 Codex 绑定。
- 按钮下方新增启动、页面绑定、保存、成功和失败反馈。
- session 仅在绑定的 `tabId` 与当前标签页一致时复用。
- 扩展版本升级为 `0.4.1`。
- 新增测试证据 `docs/test-evidence/tianyuan-binding-auto-connect-20260723.md`。

### 验证结果

- Native Host 和侧栏 JavaScript 语法检查通过。
- Manifest JSON 解析和 Git 差异格式检查通过。
- 155 个 HTML ID 与 155 个 JavaScript 控件引用全部对应。
- Connector `/health` 和 `/api/protocol` 检查通过。
- Native Messaging 自动启动动作检查通过。
- 本机安装的 Native Host 与项目源码哈希一致。

### 验证边界

- 当前 Codex 的 Chrome 控制通道不可用，未代替用户执行真实侧栏点击。
- 需要重新加载 `0.4.1` 扩展后，在天源页面直接点击绑定按钮回测。
## 2026-07-23 22:48 CST

### 任务目标

允许用户通过 Codex 对话，在已绑定的资产基础法底稿指定科目和行中，通过浏览器脚本上传评估核实附件。

### 执行动作

- 新增 Connector 受控动作队列及结果回传接口。
- 新增 `tianyuan.preview_audit_attachment_upload`。
- 新增 `tianyuan.upload_audit_attachment`。
- 侧栏增加绑定标签页任务轮询、目标科目切换和页面动作执行。
- 页面适配器增加“查证资料索引”定位、上传弹窗打开、文件注入、上传和分类监听、底稿保存与单元格回读。
- 文件限制为常见文档、表格、图片和压缩包，单文件最大 20MB。
- 正式动作要求确认文本 `确认上传并保存`。
- 扩展版本升级为 `0.5.0`，连接器插件升级为 `0.2.0`。
- 同步 Native Host、个人插件源码和 Codex 插件缓存副本。

### 验证结果

- 所有 JavaScript 和 JSON 静态检查通过。
- 155 个 HTML ID 与 JavaScript 控件引用完整。
- Connector 预演和正式任务队列协议通过。
- 临时测试 PDF 可由 Bridge 读取并以内存 Base64 交付任务。
- Connector Bridge 重启和健康检查通过。
- Gateway 已返回新增能力矩阵。

### 验证边界

- 未对真实天源底稿上传测试附件，避免制造孤立附件。
- 需要重新加载 Chrome 扩展 `0.5.0` 并重新绑定页面。
- Codex 当前任务不会热加载新增 MCP 工具，需要新建任务或重启 Codex 后测试。
- 首次真实测试必须先预演，再使用用户明确指定的附件正式执行。

## 2026-07-23 23:10 CST

### 任务目标

验证对话控制是否可以在上传评估核实附件后，联动填写“查证核对情况”，完成保存和回读闭环。

### 执行动作

- 读取 Connector 当前连接状态，确认 Bridge 在线、当前对话绑定匹配且只有 1 个在线 session。
- 读取当前资产基础法底稿上下文：
  - 天源项目 ID：`165353602809858`；
  - 公司 ID：`165353602809933`；
  - URL 科目参数：`C5-9`；
  - 当前 Sheet：`应付职工薪酬`。
- 调用受控只读动作检查第 2 行 `查证核对情况`：
  - 动态定位为 `J2`；
  - 原值为空；
  - 单元格可编辑。
- 调用受控写入动作，将第 2 行 `查证核对情况` 写入 `不一致` 并保存。

### 验证结果

- `/ty/api/assignment_draft/save` 返回 HTTP 200，业务 code 200。
- 保存 requestId：`596165230a02d58eca13ebac7775c960`。
- `J2` 回读 text/value 均为 `不一致`。
- `readbackConsistent=true`。
- 未读取或记录 Cookie、Authorization、密码、验证码或 token。
- 未开放任意 JavaScript；写入能力限制在 `查证核对情况` 字段。

### 结论

“上传测试附件 -> 填写查证核对情况 -> 保存 -> 回读一致”的小流程已在真实天源页面跑通。由于附件是测试 PDF，本次结论选择 `不一致`，不能作为真实业务核验结论。

### 输出

- `docs/test-evidence/tianyuan-conversation-attachment-upload-20260723.md`
- `项目管理/PROJECT_MEMORY.md`
- `项目管理/PROJECT_STATE.md`
- `项目管理/TASK_LOG.md`

## 2026-07-23 23:28 CST

### 任务目标

按用户要求，对当前科目的“查证资料索引”核查流程走一次批量处理。

### 执行动作

- 新增受控只读动作 `scan_audit_index_check_rows`。
- 新增受控批量写入动作 `batch_set_audit_check_results`。
- 新增 Codex 工具入口：
  - `tianyuan.scan_audit_index_check_rows`
  - `tianyuan.batch_set_audit_check_results`
- 修复 content script 与 page adapter 的版本握手，使新增 v13 页面适配器可被调用。
- 通过当前绑定 session 扫描当前 Sheet。

### 扫描结果

- 当前 Sheet：`长期待摊费用`。
- Sheet 行数：22。
- 扫描数据行：21。
- `查证资料索引` 动态定位：`N` 列。
- `查证核对情况` 动态定位：`O` 列。
- 有“查证资料索引”的行数：0。
- 需要填写“查证核对情况”的行数：0。

### 批量处理结果

- 执行 `tianyuan.batch_set_audit_check_results`，目标结论为 `不一致`。
- 候选行数为 0，实际更新 0 行。
- 跳过原因：`NO_ROWS_NEED_UPDATE`。
- `writesPerformed=false`。
- 未触发 `/assignment_draft/save`。

### 结论

当前科目没有已上传或已分类的“查证资料索引”，批量核查流程正确空跑，没有误写“查证核对情况”。后续若先上传附件生成资料索引，再执行批量核查，将只处理“资料索引有内容且核对情况为空”的行。

### 输出

- `docs/test-evidence/tianyuan-current-subject-audit-index-batch-20260723.md`
- `项目管理/PROJECT_MEMORY.md`
- `项目管理/PROJECT_STATE.md`
- `项目管理/TASK_LOG.md`

## 2026-07-23 23:31 CST

### 任务目标

离线模拟测试“查证资料索引批量核查”规则，不触碰线上天源底稿。

### 模拟样本

- 共模拟 5 行。
- 4 行存在“查证资料索引”。
- 2 行“查证资料索引”有内容且“查证核对情况”为空。
- 2 行“查证核对情况”已有内容。
- 1 行没有“查证资料索引”。

### 验证结果

- 需要回填的行：第 2 行、第 5 行。
- 跳过无资料索引行：第 3 行。
- 跳过已填写核对情况行：第 4 行、第 6 行。
- 模拟回填值：`不一致`。

### 结论

批量规则符合预期：只处理“查证资料索引有内容且查证核对情况为空”的行，不会覆盖已有核对情况，也不会处理没有资料索引的行。

## 2026-07-23 23:43 CST

### 任务目标

按用户截图要求，在当前 `长期待摊费用` 科目中做“小批量真实模拟”：先向“查证资料索引”上传测试文件，再批量填写“查证核对情况”。

### 执行动作

- 确认 Connector session 在线并绑定当前对话。
- 初始扫描当前 Sheet：
  - `查证资料索引` 动态定位为 `N` 列；
  - `查证核对情况` 动态定位为 `O` 列；
  - 初始有资料索引行数为 0。
- 生成本机临时测试 PDF：`tianyuan-batch-audit-index-test-20260723.pdf`。
- 第 2 行执行附件上传。
- 第 3 行执行附件上传测试。
- 上传后扫描已形成资料索引的行。
- 执行批量填写核对情况。
- 最终扫描回读。
- 删除本机临时测试 PDF。

### 验证结果

- 第 2 行：
  - `N2` 上传测试 PDF 成功；
  - `/attach/upload` 成功；
  - `/cell_file/classify_upload` 成功；
  - `/assignment_draft/save` 成功；
  - `N2` 回读批次号 `0eb9b2cc-3b1e-47b1-8b89-123c361c51a3`。
- 第 3 行：
  - `/attach/upload` 成功；
  - `/cell_file/classify_upload` 返回业务 code 500，提示 `系统异常`；
  - 未形成 `N3` 资料索引回读；
  - 未触发底稿保存，不计入成功。
- 批量填写：
  - 候选行：第 2 行；
  - 写入 `O2=不一致`；
  - `/assignment_draft/save` 成功；
  - 保存 requestId：`8dcc45c816007722898637723c5beeaa`；
  - `O2` 回读 text/value 均为 `不一致`。
- 最终扫描：
  - 有资料索引行数：1；
  - 需要填写核对情况行数：0。

### 发现问题和修复

- 第 3 行失败说明附件入库和分类批次仍必须分段判断，不能把 `/attach/upload` 成功当作底稿成功。
- 失败弹窗可能保留文件输入状态，后续保存可能触发多个上传/分类请求。
- 已补强页面适配器：
  - 分类名称匹配改用弹窗输入描述；
  - 正式上传前尝试清空非目标分类的文件输入；
  - 空 `rowNumbers: []` 不再被误判为用户指定空范围。

### 输出

- `docs/test-evidence/tianyuan-batch-audit-upload-and-check-simulation-20260723.md`
- `项目管理/PROJECT_MEMORY.md`
- `项目管理/PROJECT_STATE.md`
- `项目管理/TASK_LOG.md`

## 2026-07-24 09:45 CST

### 任务目标

按用户要求判断 `tianyuan-valuation-system` 是否与当前浏览器工作台为同一项目；如不是，则新建 GitHub 仓库并推送当前完整版本。

### 执行动作

- 读取 GitHub 账号 `zer0-lyz` 下既有仓库。
- 检查 `zer0-lyz/tianyuan-valuation-system` 远端根目录，确认其结构为旧天源评估系统/MCP/skill 项目，不包含当前浏览器工作台的 `extension/`、`native-helper/`、`plugins/tianyuan-browser-connector/`、`release/` 等完整结构。
- 新建私有仓库 `zer0-lyz/tianyuan-browser-workbench`。
- 对当前项目执行敏感信息扫描，未发现明文 MCP token、Bearer token 或 GitHub token。
- 普通 `git push` 多次因 GitHub HTTPS 传输超时或 HTTP2 framing 错误失败。
- 改为导出当前 HEAD 文件树，生成干净发布仓库，再通过 GitHub API 上传 131 个当前版本文件，创建完整 tree、commit、`main` 引用和 baseline 标签。

### 验证结果

- GitHub 仓库：`https://github.com/zer0-lyz/tianyuan-browser-workbench`。
- 远端 `main` 提交：`cb2bdf4a760ba943896aea291ccffcb650d0860c`。
- 远端根目录已读回：`.gitignore`、`README.md`、`docs`、`extension`、`native-helper`、`plugins`、`release`、`scripts`、`skills`、`交给Agent自动配置.md`、`项目管理`。
- 远端标签已读回：
  - `baseline-sidepanel-app-ui-20260724`
  - `baseline-github-distribution-ready-20260724`

### 后续建议

- Mac mini 使用 `https://github.com/zer0-lyz/tianyuan-browser-workbench` 作为克隆地址。
- 克隆后执行 `node scripts/install-local-runtime.mjs`，然后加载脚本输出的本机 `extensionPath`。
- 若后续继续发布大安装包，建议使用 GitHub Release 附件，不要把大二进制安装包纳入 Git 历史。
