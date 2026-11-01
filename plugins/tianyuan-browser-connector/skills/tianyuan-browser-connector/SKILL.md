---
name: tianyuan-browser-connector
description: Connect Codex to the exact Tianyuan browser session bound to the current project or conversation before reading page context or requesting browser actions.
---

# 天源浏览器连接器

## 路由规则

1. 天源浏览器操作前先调用 `tianyuan.connection_status`。
2. 优先传入当前 Codex 项目的 `projectPath` 或 `projectId`；来源元数据包含 `threadId` 时一并传入。
3. `issues` 非空时停止，不得自动选择其他最新在线 session。
4. 连接确认后，后续调用必须复用同一个 `sessionId` 和 `bindingId`。
5. 若匹配多个 session，要求用户按天源项目、公司、科目或页面选择目标。
6. 对话范围绑定不得路由到其他 `threadId`；项目范围绑定只允许同项目使用。

## 当前能力

当前版本提供：

- 连接状态；
- session 列表；
- 当前页面轻量上下文；
- 能力矩阵。
- 资产基础法底稿批量保存预演与确认后执行；
- 资产基础法底稿批量退出编辑预演与确认后执行；
- 评估核实附件上传预演。
- 经明确确认的单文件上传、分类、底稿保存和回读。
- 经明确确认的测试资料索引清理、底稿保存和回读。
- 已解析财务报表的 valuation-mcp 预检、用户确认后导入和回读校验。
- 报告页报告动作族（`report_inspect`/`report_capabilities`/`report_navigate`/`report_node_read`/`report_preview`/`report_execute`/`report_save`/`report_editor`/`report_readback`）：仅在当前绑定会话确实报告 `reportAuthoring.supported` 时可用；写入动作受 Bridge 写门禁约束，默认关闭（`REPORT_WRITE_GATE_CLOSED`）。
- 编辑块和表格 MCP 工具定义仍保留，但能否执行取决于当前扩展及 Bridge；不得仅凭工具存在认定报告页支持写入。

当前版本不提供：

- 任意浏览器点击；
- 任意 JavaScript；
- 任意字段写入或任意附件接口调用。
- 报告写入的实机验收：写入路径（预演→执行→保存→回读）代码已实现并经隔离 fixture 测试，但尚未通过真实页面验收；实机使用需运行环境显式开启写门禁并逐项确认。

## 报告编辑页受控操作

先调用 `tianyuan.connection_status`，确认唯一绑定的会话及 `reportAuthoring.supported`。使用同一 `sessionId`、`bindingId`、工作区 `projectId`、`threadId`、`tabId`，并从会话上下文的 `route` 取得报告业务 `projectId`、`companyId`、`reportType` 和 `reportMode`（`detailId` 可选），作为 `reportIdentity` 调用报告动作族。工作区 `projectId` 与报告业务 `projectId` 不能混用；不要复用过期的 session、binding 或 tabId。

节点定位使用 `nodeRef`（`nodePathKey` + `label`；提供候选 ID 时另行核对唯一性）。`report_navigate` 的展开、折叠、选中和搜索只改变视图，不算节点树编辑；真实节点新增、复制、移动和删除必须先经 `report_preview`，再用 `report_execute`（planHash + 精确确认文本）。节点属性写入当前仅支持 `是否编号=是`，须受控打开属性弹窗、执行单次确认，再经 `report_reload` 与同节点 `settings_open` 后的 `report_node_read(verifySaved=true, include=["settings"])` 回读；其他设置字段明确拒绝，不得将弹窗回显称为保存。结构修改单独使用"确认执行报告结构修改"；删除另需操作级确认。保存结果不明时按 `pendingVerify` 处理，不得盲目重试。编辑框工具栏命令以 `report_editor` 白名单为准。完整能力以当前页面的实时检测和实机持久化验收为准，不因工具或 fixture 存在而宣称已支持。探查与动作不返回 Cookie、Token、Authorization、密码或验证码。

节点编辑保存后，先确认刷新不会丢失范围外未保存内容，再刷新目标报告并重新确认绑定；使用 `report_node_read` 传入相同节点、`include: ["editor"]` 和 `verifySaved: true`。只有刷新后的只读模型、身份与待核实记录一致时才返回 `savedVerification.verified` 并归档；任何错误均保留待核实记录，不重试保存。当前真实页面已验证测试节点的正文及四种基础格式，其他能力仍以页面实时能力与独立验收为准。

在用户确认范围外没有需要保留的未保存内容后，可调用 `report_reload` 传同一节点及 `confirmText: "确认刷新并核验已保存报告"`；该操作仅允许对一次已提交保存的待核实记录请求一次刷新。刷新请求成功不是保存成功，仍必须重新确认绑定并调用 `report_node_read` 的 `verifySaved` 回读。

## 批量保存与退出编辑

批量保存必须按以下顺序调用：

1. `tianyuan.connection_status`，确认返回的 `recommendedSession` 与目标项目/对话一致，并记录其中的 `sessionId` 和 `bindingId`。
2. `tianyuan.preview_batch_save`，传入明确的 `subjectCodes`，预演只读取页面，不点击保存。
3. 向用户展示科目数、每个科目的页面状态、保存按钮和编辑锁结果，取得明确确认。
4. `tianyuan.execute_batch_save`，确认文本必须严格为 `确认批量保存`。
5. 检查每个科目的 `saveNetworkSuccess` 或 `saveSuccessTextFound`，只有全部科目都有成功证据，才可报告批量保存成功。

批量退出编辑对应使用 `tianyuan.preview_batch_exit_edit` 和 `tianyuan.execute_batch_exit_edit`，执行确认文本必须严格为 `确认批量退出编辑`。执行工具只会操作当前已绑定的天源资产基础法底稿页面，并继续受编辑锁、项目、公司和对话绑定门禁保护。

如果 `tianyuan.connection_status` 返回 `NO_ONLINE_SESSIONS`，说明 Codex 还没有可控制的浏览器页面，不是批量保存工具缺失。请用户：

1. 在 Chrome 打开已登录的天源资产基础法底稿页面；
2. 加载本机扩展目录 `~/.tianyuan-workbench/projects/天源评估系统/extension`；
3. 打开天源工作台侧栏；
4. 在连接配置中绑定当前项目和当前对话，并确认顶部显示已绑定；
5. 再次调用 `tianyuan.connection_status`，复用返回的 `sessionId` 和 `bindingId`。

不要使用普通未加载扩展的标签页、临时复制浏览器 profile、AppleScript 执行 JavaScript 或任意远程调试实例替代绑定。

附件正式上传必须使用 `tianyuan.upload_audit_attachment`，确认文本必须为 `确认上传并保存`。执行前必须先预演，且必须复用连接状态返回的 `sessionId` 和 `bindingId`。只有附件上传、分类批次、`/assignment_draft/save` 和目标单元格回读全部通过，才可报告成功。

测试清理必须使用 `tianyuan.clear_audit_test_rows`，传入精确行号及当前资料索引值，确认文本必须为 `确认清理测试数据并保存`。只有保存成功且“查证类核实程序”“查证资料索引”“查证核对情况”均回读为空，才可报告清理成功；附件库中的物理文件不会被删除。

## Gateway 回退

若 MCP 工具未暴露，可使用：

```bash
node "$HOME/.tianyuan-workbench/browser-connector/runtime/scripts/agent-tool-call.mjs" \
  tianyuan.connection_status '{"onlyOnline":true,"projectPath":"当前项目目录"}'
```

Gateway 与 MCP 必须使用相同的 `sessionId`、`bindingId`、`projectId` 和 `threadId`。

## 财务报表导入

财务报表导入不通过浏览器页面点击，而通过插件运行时脚本连接 `valuation-mcp`。使用独立技能 `financial-statement-import`，脚本位置为：

```text
runtime/scripts/financial-statement-import.mjs
```

标准流程是“读取已解析数据 → `prepare` 预检 → 展示完整预览 → 用户明确确认 → `execute` 保存 → `read` 回读”。预检阶段不会写入；未获得明确确认不得执行。脚本从本机 `~/.tycpv/` 登录态读取凭据，不在参数、日志或项目文件中保存 MCP token。
