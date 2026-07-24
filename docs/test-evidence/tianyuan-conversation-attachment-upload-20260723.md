# 对话控制评估核实附件上传验证

日期：2026-07-23

## 已完成

- Connector Bridge 新增受控浏览器动作队列。
- Codex 插件新增上传预演和正式上传两个 MCP 工具。
- 侧栏每 1.5 秒领取当前绑定 session 的待执行任务。
- 侧栏可按项目、公司和科目代码切换目标底稿。
- 页面适配器按表头定位“查证资料索引”。
- 页面适配器通过 `operation-upload-cell.activateEditor(true, ...)` 打开上传弹窗。
- 页面适配器通过 `File + DataTransfer` 注入本机 Bridge 提供的文件。
- 页面适配器分别观察附件上传、分类批次和底稿保存网络结果。
- 页面适配器回读目标单元格，并区分上传、分类、保存和回读状态。

## 静态验证

- 扩展页面适配器、content script、侧栏脚本语法检查通过。
- Native Host 语法检查通过。
- Connector MCP server 和共享 client 语法检查通过。
- Manifest 和插件 JSON 解析通过。
- Git 差异格式检查通过。
- 155 个 HTML ID 与 155 个 JavaScript 控件引用全部对应。
- 扩展版本为 `0.5.0`。
- 插件和 MCP server 版本为 `0.2.0`。

## 协议验证

- 预演任务成功完成 `queued -> claimed -> completed`。
- 正式任务成功完成 `queued -> claimed -> failed` 测试流程；失败状态为测试主动回传，不执行真实页面写入。
- 测试 PDF 通过 Bridge 临时读取并以 Base64 交付浏览器任务。
- 浏览器任务中只显示文件名、大小和类型，不返回本机完整路径。
- 项目源码、本机 Native Host、本机插件源码和 Codex 插件缓存副本哈希一致。
- Connector Bridge 重启和 `/health` 检查通过。
- Gateway 能读取新增的附件上传能力矩阵。

## 尚未执行

- 未在真实天源底稿中注入或上传测试文件。
- 未验证真实页面上传弹窗的分类名称匹配。
- 未验证编辑锁释放后的 `/assignment_draft/save` 和目标字段正式回读。

真实验证应先调用上传预演，确认科目、行号、单元格地址和分类，再使用用户指定的正式附件执行一次。

## 2026-07-23 当前页面预演

- 连接状态：在线，当前对话绑定匹配。
- 当前科目：`C5-9`。
- 当前 Sheet：`应交税费`。
- 目标表头：`查证资料索引`。
- 动态定位结果：`J2`，未写死列号。
- 页面脚本已确认目标 cellType 为 `operation-upload-cell`，且存在 `activateEditor`。
- 目标单元格返回 `isReadOnly=true`。
- 结果：按编辑锁硬门禁停止；未打开上传弹窗、未注入测试文件、未调用上传接口、未点击底稿保存。

## 2026-07-23 切换科目后的预演修复

- Connector 缓存仍显示 URL 科目 `C5-9`，但实时 Sheet 已变为 `应付职工薪酬`。
- 新增 `subjectCode=current`，对“当前打开科目”执行时不再按旧 URL 科目主动导航。
- 修复 Connector 心跳只回传旧 `latestContext` 的问题，后续心跳会实时读取当前页面。
- 预演发现 `locateAuditUploadCell()` 将真实 cellType 替换为诊断摘要，导致 `activateEditor is not a function`。
- 已保留真实对象为 `rawCellType`，诊断摘要继续单独输出。
- 页面适配器升级为 `2026-07-23-page-tree-mirror-v11-attachment-celltype`。
- 扩展升级为 `0.5.2`。
- 本次错误发生在打开弹窗前，未注入文件、未上传附件、未点击保存。

## 2026-07-23 真实页面上传成功

- 当前 Sheet：`应付职工薪酬`。
- 目标字段：`查证资料索引`。
- 动态定位单元格：`I2`。
- 上传分类：`工资计提表`。
- 测试文件：`tianyuan-browser-workbench-test-20260723.pdf`，213 字节。
- 本机临时测试文件在执行完成后已删除。
- `POST /ty/api/attach/upload`：
  - HTTP 200；
  - 业务 code 200；
  - 附件 ID：`169407777996802`。
- `POST /ty/api/assignment_draft/cell_file/classify_upload`：
  - HTTP 200；
  - 业务 code 200；
  - 分类批次号：`aaa86ec2-4456-431a-ba2e-5f247563a637`。
- `POST /ty/api/assignment_draft/save`：
  - HTTP 200；
  - 业务 code 200。
- `I2` 回读 text/value：`aaa86ec2-4456-431a-ba2e-5f247563a637`。
- 回读批次号与分类接口返回一致。
- 结论：附件上传、分类批次、底稿保存和单元格回读闭环成功。
- 安全结果：未读取或记录 Cookie、Authorization、密码、验证码或 token。

## 2026-07-23 查证核对情况联动测试成功

- 测试目的：验证上传资料后，可通过对话触发受控浏览器脚本，在同一行填写“查证核对情况”并保存回读。
- 当前绑定：
  - Tianyuan session：`tianyuan_d58bcfd2-dc10-4a20-8175-d732a9c76e8e`。
  - Binding ID：`1f540a81-bae9-4905-9af8-4f31e526cb77`。
  - 当前天源项目 ID：`165353602809858`。
  - 当前公司 ID：`165353602809933`。
- 当前页面：
  - URL 科目参数：`C5-9`。
  - 当前 Sheet：`应付职工薪酬`。
  - 行号：第 2 行。
- 字段定位：
  - 目标字段：`查证核对情况`。
  - 动态定位单元格：`J2`。
  - 临近字段包括：`查证类核实程序`、`查证资料索引`、`查证核对情况`、`评估调整金额`、`评估调整原因`、`评估价值`。
  - 未写死坐标或列号。
- 写入内容：
  - 原值：空。
  - 测试写入：`不一致`。
  - 选择该结论的原因：本次上传的是测试 PDF，不代表真实业务证据，不能虚假标记为“一致”。
- 保存结果：
  - `POST /ty/api/assignment_draft/save`：HTTP 200，业务 code 200。
  - requestId：`596165230a02d58eca13ebac7775c960`。
  - `J2` 回读 text/value 均为 `不一致`。
  - `readbackConsistent=true`。
- 结论：已完成“上传测试附件 -> 填写查证核对情况 -> 保存 -> 回读一致”的受控小流程验证。
- 安全结果：
  - 未读取或记录 Cookie、Authorization、密码、验证码或 token。
  - 未开放任意 JavaScript。
  - 写入动作限制在 `查证核对情况` 字段。
