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

当前版本不提供：

- 任意浏览器点击；
- 任意 JavaScript；
- 任意字段写入或任意附件接口调用。

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
