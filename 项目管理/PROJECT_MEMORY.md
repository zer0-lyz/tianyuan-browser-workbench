# 天源浏览器工作台项目长期记忆

更新时间：2026-07-24 00:18:00 CST

## 项目定位

本项目承接旧项目“天源系统浏览器插件 / 天源系统浏览器工作台”的上下文。目标是把天源资产基础法底稿页面中的页面识别、附件上传、底稿保存、结果回读和操作留痕做成可复用浏览器插件执行层。

插件不替代业务 skill：skill 负责“为什么做、做哪些科目、参数如何确定、成功标准是什么”；插件负责“如何在天源页面安全、稳定地执行和回读”。

## Connector 连接优先架构

- 当前阶段先做连接面板和当前天源标签页绑定，不做浏览器内 Agent 对话。
- Connector 连接面板对应扩展开发版本 `0.4.0`，固定扩展 ID 不变。
- 天源页面绑定沿用 WPS/Office 语义：`sessionId + bindingId + projectId + threadId + scope`。
- 默认绑定范围为当前 Codex 对话；项目范围必须由用户在面板主动选择。
- Codex 只读插件位于 `plugins/tianyuan-browser-connector/`，当前暴露连接状态、session、上下文和能力矩阵四个 MCP 工具。
- 个人插件已安装为 `tianyuan-browser-connector@personal`，本机源码位于 `~/plugins/tianyuan-browser-connector/`。
- Codex 工具调用不得使用“最新在线 session”猜测目标；必须复用连接状态返回的 `sessionId` 和 `bindingId`。
- 本地 Connector Bridge 监听 `127.0.0.1:40415`，协议版本为 `connector-source-v1`。
- 连接流程为：侧栏启动 Bridge -> 读取当前天源页面轻量上下文 -> 注册 session -> 每 20 秒 heartbeat。
- session 只保存项目、公司、科目、页面类型、标签页编号和门禁摘要，不保存完整页面对象或任何凭据。
- 能力矩阵区分“可读取、可预演、确认后执行、本机执行、不支持、暂缓”。
- 不支持任意浏览器自动化、任意 JavaScript 执行和浏览器内 Agent 对话。
- 正式保存和退出编辑仍必须经过编辑锁、用户确认、页面执行和回读，不由 Connector Bridge 直接绕过。
- 扩展 `0.5.0` 和连接器插件 `0.2.0` 新增单文件“评估核实附件上传”受控动作。
- Codex 只能调用固定的预演和上传动作，不开放任意 JavaScript。
- 正式上传必须绑定当前 Codex 项目和对话，明确提供科目、行号、附件路径，并传入 `确认上传并保存`。
- 文件由本机 Bridge 临时读取并以内存数据交付浏览器，不保存文件内容或向浏览器暴露完整路径。
- 正式成功必须同时满足附件上传、分类批次、底稿保存业务成功和目标单元格回读非空。
- 2026-07-23 已完成真实页面闭环验证：当前 `应付职工薪酬` Sheet 的“查证资料索引”动态定位为 `I2`，在“工资计提表”分类上传测试 PDF；附件 ID 为 `169407777996802`，分类批次号为 `aaa86ec2-4456-431a-ba2e-5f247563a637`，`/assignment_draft/save` 业务成功，`I2` 回读与分类批次号一致。
- 2026-07-23 已完成对话控制的“查证核对情况”联动测试：当前 `应付职工薪酬` Sheet 的“查证核对情况”动态定位为 `J2`，原值为空，写入测试结论 `不一致`，`/assignment_draft/save` 业务成功，`J2` 回读 text/value 均为 `不一致`。
- “查证核对情况”写入能力只允许固定字段 `查证核对情况`，不开放任意单元格写入；正式业务结论必须基于附件内容核验，测试附件不能作为“一致”的证据。
- 2026-07-23 新增当前科目“查证资料索引”批量核查能力：先批量扫描“查证资料索引”和“查证核对情况”，仅当资料索引有内容且核对情况为空时，才允许批量填写“查证核对情况”并保存。
- 2026-07-23 当前 `长期待摊费用` Sheet 批量扫描结果：`查证资料索引` 动态定位为 `N` 列，`查证核对情况` 动态定位为 `O` 列，扫描 21 个数据行，资料索引有内容的行数为 0；批量处理正确空跑，未写入、未保存。
- 2026-07-23 当前 `长期待摊费用` Sheet 小批量模拟测试部分通过：第 2 行 `N2` 上传测试 PDF 后形成资料索引批次 `0eb9b2cc-3b1e-47b1-8b89-123c361c51a3`，批量填写 `O2=不一致`，`/assignment_draft/save` 业务成功且回读一致。
- 2026-07-23 同一批测试中第 3 行附件入库成功但 `/cell_file/classify_upload` 返回业务 code 500 `系统异常`，未形成资料索引回读，未触发底稿保存；再次证明 `/attach/upload` 成功不能视为上传保存成功。
- 上传失败后弹窗可能保留文件输入状态，导致后续保存触发多个上传/分类请求；页面适配器已补强分类名称匹配、非目标文件输入清空和空 `rowNumbers` 处理，重新加载扩展后生效。

## 上下文来源

已迁移交接包到 `docs/context/`：

- `README.md`
- `天源浏览器插件可行性与架构草案.md`
- `天源评估核实附件上传能力记录.md`
- `ego_asset_check_upload_template.sh`
- `tianyuan-asset-draft-save.SKILL.md`
- `save_asset_draft.js`

源目录：

`/Users/zer0y/Library/CloudStorage/OneDrive-个人/共享/2026-天源/20260529 中显光电/项目管理/_work/tianyuan_browser_extension/context_handoff`

压缩包已核对可打开，但中文文件名在 `unzip -l` 输出中存在编码噪声；本次迁移以源目录实际文件为准。

## 已验证事实

- 天源资产基础法底稿页面使用 SpreadJS。
- 页面内可通过 `GC.Spread.Sheets.findControl(document.querySelector('.spreadWrapper'))` 获取工作簿对象。
- 评估核实阶段的“查证资料索引”字段不能写死列号，必须按表头定位。
- “查证资料索引”单元格使用 `operation-upload-cell` 自定义 cellType。
- 稳定打开上传弹窗的方法是调用 cellType 的 `activateEditor(true, null, null, { sheet, row, col })`。
- `uploadFile` 只完成前端文件注入，必须触发弹窗“保存”逻辑，才会调用真实上传和分类接口。
- `/ty/api/attach/upload` 成功只代表附件入库。
- `/ty/api/assignment_draft/cell_file/classify_upload` 成功只代表分类批次生成。
- `/ty/api/assignment_draft/save` 成功并且明细回读目标字段一致，才算正式底稿落库。
- 编辑锁是硬门禁。正式插件不能通过前端改只读状态绕过编辑锁。
- 评估核实资料入口是“查证资料索引/CZZLSY”，不是“注释文件/ZSWJ”。

## 旧项目测试事实

旧项目在“中显芯科评估”中验证过评估核实附件上传能力：

- projectId：`165353602809858`
- companyId：`165353602809933`
- 科目：其他应付款
- subjectCode：`C5-10-3`
- sheet：`其他应付款-其他应付款`
- 测试单元格：`P2`
- 字段标题：`查证资料索引`
- 字段编码：`CZZLSY`
- `POST /ty/api/attach/upload` 成功，返回附件 ID `169200060596226`。
- `POST /ty/api/assignment_draft/cell_file/classify_upload` 成功，返回批次号 `8fd2384f-8109-4d63-9dc6-cb9e33ff84bf`。
- `POST /ty/api/assignment_draft/save` 因编辑锁失败，返回“当前底稿编辑锁已被用户：张宇飞持有”。
- 回读 `C5-10-3` 明细时，两条记录的 `CZZLSY` 均为空，说明正式底稿未被污染。

上述旧项目 ID、主体 ID、科目和测试结果只作为技术验证证据，不作为新项目默认运行参数。

## 推荐架构

- Chrome Manifest V3 Side Panel：展示当前项目、主体、科目、阶段、活动行、编辑锁、执行模式和日志。
- Service Worker：维护任务状态和消息协议。
- Content Script：与扩展上下文通信。
- MAIN-world injected adapter：访问页面内 SpreadJS、DOM、上传弹窗和天源接口状态。
- 可选 Native Messaging 或 localhost 本地助手：在用户授权下读取目录文件和任务队列。
- 公司清单和资产基础法科目清单以 MCP/native-helper 为主来源，避免通过页面 DOM、弹窗或左侧树做脆弱抓取。
- 科目树必须先用 MCP 全量科目建立 `科目代码 -> 科目名称` 映射，再做显示状态过滤；父级层级标题可来自全量映射，但只有显示状态过滤后保留的科目才有复选框、才进入批量保存。
- MCP token 只能通过本机环境变量提供给 native-helper，不能写入扩展、项目文档或日志。
- HTTP helper 继续只提供只读清单接口，不执行保存、上传或落库。
- Native Host 允许执行两个白名单 CLI 导出动作：资产基础法明细表和资产基础法申报表。
- CLI 导出目录必须由 macOS 文件夹选择器取得，插件不能自行猜测或读取任意本机路径。

## 本机运行目录

- OneDrive 项目目录只作为项目资料和源码目录，不作为依赖安装目录。
- 运行依赖、安装包、二进制工具、helper 运行副本、日志、缓存和快照统一迁到本机隐藏目录 `~/.tianyuan-workbench/`。
- Native Host 注册文件指向 `~/.tianyuan-workbench/native-helper/native_host_launcher.sh`。
- Native Host 和 HTTP helper 的本机副本位于 `~/.tianyuan-workbench/native-helper/`。
- 已迁移的重型材料：
  - `tycpv-setup-0.1.0-macos-arm64.pkg`
  - `macos-tycpv-agent-cli-guide.md`
  - `valuation-declaration-table-json/`
  - `valuation-json-to-excel/`
  - `.snapshots/`
- 后续新增依赖时，先安装到本机目录或系统包管理位置，不能直接落在 OneDrive 项目目录。

## MVP 范围

第一阶段只支持 `excel.zhrdc.net/ty/*` 下资产基础法底稿页面：

- 自动识别当前资产基础法底稿。
- 显示项目 ID、主体 ID、subjectCode、当前 sheet、当前阶段、活动单元格。
- 识别“查证资料索引”列是否存在。
- 识别保存按钮是否可用。
- 识别编辑锁状态和页面提示文本。
- 保存当前科目。
- 对当前行上传一个附件。
- 执行后回读并输出 JSON 证据。

开发第一步建议只做只读上下文面板，暂不写入、不上传、不保存。

## 功能模块口径

- 侧栏采用多页面工作台结构：顶部全局连接状态、首页功能入口、连接配置页、各功能独立页面。
- “保存底稿”和“退出编辑”是并列功能模块，点击首页入口后进入各自页面。
- 每个功能页独立选择和保存公司、科目范围；切换页面后不得清空，也不得串用另一个功能的选择。
- 新增批量类功能时，按独立模块页面扩展，并复用统一的范围组件、连接状态和任务执行协议。
- 正式执行类功能必须保留确认门禁；预演模式只能定位按钮、读取上下文或输出将执行范围，不能改变天源页面状态。
- 部分公司执行必须以面板确认的公司对象为准；正式执行前需要在天源页面公司选择弹窗中调整并读回实际选择，不一致时停止该科目动作。
- 任务执行期间应锁定页面导航和范围操作，避免运行中切页造成状态漂移。
- Helper、MCP、CLI 状态在所有页面顶部持续显示；配置和授权操作集中放在连接配置页。
- 表格导出模块只选择公司，不选择科目。
- 明细表导出映射 `tycpv export-asset-detail-table`；申报表导出映射 `tycpv export-asset-declare-table`。
- CLI 导出使用 `--project-id`、`--company-ids`、`--out-dir` 参数。
- CLI 没有结构化百分比时，进度条按连接、项目读取、公司读取、逐公司写入和完成阶段估算；只有退出码为 0 才显示 100% 成功。
- 打印格式模块不依赖天源项目、公司、科目、MCP 或 CLI，只依赖 Native Host、本机 Python 和 openpyxl。
- 明细表打印格式使用 `skills/appraisal-detail-print-format/scripts/adjust_appraisal_detail_print.py`。
- 申报表打印格式使用 `skills/appraisal-declaration-print-format/scripts/adjust_appraisal_declaration_print.py`，并复用明细表基础脚本。
- 打印格式支持多文件和文件夹递归批处理，支持覆盖、源目录副本和新目录三种输出方式。
- 覆盖源文件必须先处理临时副本、验证 ZIP 完整性，再原子替换源文件。
- 打印版副本统一增加 `-打印版` 后缀，名称冲突时自动增加序号。

## 科目显示树读取口径

- 科目清单最终显示范围以天源页面左侧实际显示树为准，MCP 提供科目代码、名称和全量映射。
- 页面左侧树应优先按 Element UI/Vue 树结构递归读取，不能只靠坐标、下一行缩进或叶子节点推断。
- 同名父子科目必须保留真实路径差异，例如 `其他应付款 -> 其他应付款`，不能按名称直接去重。
- 面板过滤时，所有页面可见树节点都应参与匹配；叶子节点只能作为辅助信息，不能作为唯一过滤来源。
- 页面适配器版本 `2026-07-23-subject-tree-recursive-v3` 是当前已修复同名深层科目读取问题的基线版本。
- 若页面树存在滚动条，科目采集必须滚动容器并合并多轮视图结果，不能只读取首屏可见节点。
- 页面适配器版本 `2026-07-23-subject-tree-scroll-v4` 是当前滚动采集基线版本。
- 若页面树只读到首屏碎片或覆盖面太小，不能继续用它裁掉完整 MCP 科目清单；应回退到 MCP 显示字段生成清单，并在日志里明确提示回退。
- 页面适配器版本 `2026-07-23-subject-tree-fallback-v5` 是当前回退策略基线版本。
- 面板刷新时的上下文必须保持轻量，不能把整棵科目树和过多预览数据放进 `GET_CONTEXT`，否则会拖到超时。
- 页面适配器版本 `2026-07-23-context-lite-v6` 是当前轻量上下文基线版本。
- 科目与页面树匹配不能只比较一个 `name` 字段；应同时考虑父级名称、完整路径、原始 MCP 名称字段及名称后缀。
- 页面树不完整时，页面明确匹配到的科目应并入 MCP 显示清单，不能因页面树覆盖不足而丢失。
- 当前科目面板口径为“加载全部 MCP 科目”；显示状态科目默认勾选，隐藏状态科目保留但默认不勾选并标记隐藏。
- MCP 路径可能只返回层级后半段，父级名称必须从路径末端按代码层级对齐，并优先使用子科目路径而非单个父级对象的 name。
- 当前批量处理范围只允许进入页面实际显示状态或 MCP 显示字段确认的科目；隐藏科目不应进入可选清单和批量执行。
- 页面显示状态匹配应优先使用页面树节点的 `subjectCode`；只有无法读取代码时，才使用名称和路径匹配。
- 当前科目清单以页面已展开树为唯一显示范围和层级来源；编号仅在页面直读或 MCP 唯一同名同层级匹配时展示，无法可靠补码的叶子通过完整页面路径执行。
- 当前界面不显示科目编号；代码、页面路径和 treepath 仅作为内部执行映射保留。
- 2026-07-23 初步测试通过版本已固定为 `baseline-page-tree-mirror-20260723`，后续新功能必须从该基线继续。
- 2026-07-23 多页面侧栏从上述基线继续开发，不改变页面科目树镜像、显示状态过滤、父级层级和内部执行映射。

## 风险规则

- 不写死坐标、列号或压缩类名。
- 不能绕过编辑锁执行正式插件功能。
- 不能把前端文件回显、附件入库或分类批次生成误判为底稿保存成功。
- 页面前端版本变动可能影响 SpreadJS/Vue 组件结构，需要适配器版本检测和回归测试。
- 浏览器扩展不能无条件读取任意本地路径；批量上传前必须设计安全的用户授权或本地助手。
- 不保存 Cookie、Authorization、密码、验证码或 token。
- Native Host 不接受任意 CLI 命令，只执行代码内白名单子命令；所有参数使用参数数组传递，不经 shell 拼接。
- 打印格式批处理只接受 `.xlsx` 和 `.xlsm`，跳过临时文件、备份文件和已生成打印版，单次最多 500 个。

## Windows x64 发行口径

- Windows 测试版支持 64 位 Windows 10/11 和 Google Chrome，不支持 32 位 Windows 或 Windows ARM。
- Windows 本机运行目录统一为 `%LOCALAPPDATA%\TianyuanWorkbench`，不把运行依赖安装到 OneDrive、企业微信缓存或项目源码目录。
- Chrome Native Messaging 注册在当前用户注册表：
  `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.tianyuan.workbench.helper`。
- Windows Native Host 使用 Node.js SEA 生成独立 `native_host.exe`，不要求目标电脑另行安装 Node.js。
- 打印格式功能使用 Python 3.14.6 Windows x64 便携运行时，并内置 `openpyxl 3.1.5` 和 `et_xmlfile 2.0.0`。
- Windows 文件和文件夹选择通过 PowerShell + Windows Forms 系统对话框完成，不再依赖 macOS `osascript`。
- Windows 覆盖源文件时必须先将原文件改名为同目录临时备份，再替换处理结果；替换失败必须恢复原文件。
- Windows 天源 CLI 使用 `tycpv-setup-0.1.0-win-x64.exe`，源文件 SHA-256 为
  `ef6f685fe52443c73512724daaf3a16df04e3c0645c0145f52cb8f77dc2d8a31`。
- Windows 安装包不包含 MCP token、Cookie、Authorization、密码或验证码；MCP token 必须由使用者本人在插件配置弹窗中输入。
- Windows 包包含 `交给Agent安装.md`，允许桌面 Agent 执行安装、注册、加载扩展和状态检查，但 Agent 不得索取、读取或记录凭据。
- 当前 Windows 包属于测试版：已完成 macOS 构建环境下的源码、PE 架构、ZIP、逐文件哈希和 Native Messaging 协议验证，仍需真实 Windows x64 + Chrome 验证安装、CLI 授权、文件选择和六个模块。
- Windows r2 安装器采用自动双模式：已有 `tycpv`、Python 3.9+、`openpyxl >= 3.1.5` 和 `et_xmlfile` 时走快速安装；已有 Python 缺少库时优先从包内离线 wheels 补齐；检测或补齐失败时才复制便携 Python。
- r2 核心校验只处理扩展、Native Host、打印脚本和版本文件；CLI、离线 wheels、便携 Python 等备用依赖在实际使用前才分别校验，避免快速路径无意义遍历全部备用文件。
- r2 安装报告必须记录安装模式、安装耗时、实际 Python/CLI 路径和版本，以便判断是否真正进入快速路径。

## 2026-07-24 批量评估核实附件上传排查

- 若 content script 与 injected page adapter 的 `ADAPTER_VERSION` 不一致，浏览器动作可能继续走旧注入或忽略新版回包，导致批量上传修复不生效；后续修改 `page_adapter.js` 时必须同步更新 `content.js` 版本号并重载扩展。当前源码版为 `2026-07-24-page-tree-mirror-v20-index-clear-tag-fix`。
- 批量附件上传工具必须透传 `procedureText`，否则“查证类核实程序”前置字段不能由批量动作显性指定。
- `BATCH_UPLOAD_ALL_FAILED` 表示本次批量没有任何一行完成“附件入库、分类批次、底稿保存、单元格回读”闭环，不是上传成功提示。
- 分类接口返回 `系统异常` 时，应回传前置字段状态、弹窗文本和网络证据，不能只输出笼统失败。
- 上传弹窗打开后若已经存在残留文件，插件必须中止并关闭弹窗，不得继续点击“保存”，避免重复产生无效附件入库请求。
- 2026-07-24 当前科目 `其他应收款-其他应收款` 已完成两行真实批量上传闭环：`Q2=c30b34ed-0db3-4e31-b6ea-964cbbcadb12`、`Q3=8a3053bb-191a-4b3c-9272-3adbfac91815`，两行均完成附件入库、分类批次、底稿保存和回读。
- 2026-07-24 当前科目 `其他应收款-其他应收款` 已继续完成两行查证核对情况批量填写闭环：`R2=不一致`、`R3=不一致`，`/assignment_draft/save` 业务成功，最终扫描 `rowsNeedingCheck=0`。
- 空资料索引单元格可能带有 `tag:{isClear:true}`，该状态不能算已有资料；扫描判断应以 text/value 或有效 fileId/batchId 为准。

## 2026-07-24 本机运行目录口径

- 用户明确要求运行文件放在本地，OneDrive 只存放项目基础说明性信息。
- 当前本机项目运行根目录：`~/.tianyuan-workbench/projects/天源评估系统/`。
- 当前 Chrome 未打包扩展应加载：`~/.tianyuan-workbench/projects/天源评估系统/extension`。
- Native Host 运行目录：`~/.tianyuan-workbench/native-helper/`。
- Connector 运行目录：`~/plugins/tianyuan-browser-connector/` 和 `~/.codex/plugins/cache/personal/tianyuan-browser-connector/0.3.0/`。
- OneDrive 后续只保留 `docs/`、`项目管理/`、交接说明、决策和测试证据；不作为扩展、Helper、Connector、脚本和依赖的运行来源。

## 2026-07-24 多 Agent 绑定基线

- Connector Bridge 协议为 `connector-agent-binding-v2`。来源身份由受控本机 `providerId + installationId + credentialRef` 声明，不扫描进程或猜测窗口。
- 页面绑定内部统一为 `agentBinding`。同页多来源可读，唯一控制者可写；切换控制者必须在侧栏确认，并取消旧控制者未完成队列。
- Codex 维持本机项目/对话目录自动读取；WorkBuddy 仅支持手动来源和通用 stdio MCP 配置，不宣称真实 WorkBuddy API 集成。
- 安装脚本优先在 macOS Keychain 保存 Agent 本机凭证，只在 `~/.tianyuan-workbench/` 保存不含明文凭证的 `credentialRef` 配置；不保存 MCP token、Cookie、Authorization、密码或验证码。

## 2026-07-24 扩展运行契约

- 侧栏调用 Bridge 必须发送 `x-tianyuan-extension-id` 和 `x-tianyuan-extension-version`；Bridge 以安装时生成的 `runtime-compat.json` 校验版本。
- 不要将 `Origin` 是否存在作为 Chrome 扩展身份的唯一规则。版本或运行副本不一致时必须返回明确的重新加载提示，而不是模糊的“Connector 未启动”。

## 2026-07-24 MCP token 记住规则

- `tianyuanWorkbenchMcpToken` 是用户显式选择“记住本机”后在 Chrome 扩展本机存储中使用的键。启动时恢复；不得再调用初始化清理逻辑。
- 禁止把 MCP token 复制到 Native Helper、Bridge、仓库、日志、截图或任何云盘路径。清除操作必须同时清空内存与扩展本机存储。
