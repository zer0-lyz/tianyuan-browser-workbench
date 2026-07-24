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
- 评估核实附件上传预演。
- 经明确确认的单文件上传、分类、底稿保存和回读。

当前版本不提供：

- 任意浏览器点击；
- 任意 JavaScript；
- 退出编辑；
- 任意字段写入或任意附件接口调用。

附件正式上传必须使用 `tianyuan.upload_audit_attachment`，确认文本必须为 `确认上传并保存`。执行前必须先预演，且必须复用连接状态返回的 `sessionId` 和 `bindingId`。只有附件上传、分类批次、`/assignment_draft/save` 和目标单元格回读全部通过，才可报告成功。

## Gateway 回退

若 MCP 工具未暴露，可使用：

```bash
node "$HOME/.tianyuan-workbench/browser-connector/runtime/scripts/agent-tool-call.mjs" \
  tianyuan.connection_status '{"onlyOnline":true,"projectPath":"当前项目目录"}'
```

Gateway 与 MCP 必须使用相同的 `sessionId`、`bindingId`、`projectId` 和 `threadId`。
