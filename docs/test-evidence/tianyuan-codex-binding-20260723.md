# 天源 Codex 项目与对话绑定验证

日期：2026-07-23

## 已验证

- Connector Platform 返回 15 个 Codex 项目和 98 个 Codex 对话。
- 浏览器 session 可保存 `projectId`、`projectName`、`projectPath`、`threadId`、`threadTitle`、`scope` 和 `bindingId`。
- `GET /api/sessions/:sessionId` 可读回 Codex 绑定。
- Bridge 重启后，按同一项目/公司/页面重新注册 session 可恢复持久绑定。
- MCP 只读工具列表已可用：
  - `tianyuan.connection_status`
  - `tianyuan.list_sessions`
  - `tianyuan.get_context`
  - `tianyuan.list_capabilities`
- 未绑定 session 时，`tianyuan.connection_status` 返回 `NO_ONLINE_SESSIONS` 或 `NO_BOUND_SESSIONS`，不会自动选择其他页面。
- `get_context` 缺少 `bindingId` 或绑定不一致时拒绝读取。

## 当前边界

- 尚未开放 Codex 调用正式保存、退出编辑、上传或落库。
- 当前 Codex MCP 的“当前对话”选择遵循本机 Codex 项目/对话目录的最新匹配规则；后续可再接入更强的调用方 thread 元数据校验。
- 需要重新加载 Chrome 扩展后验证真实面板的项目和对话下拉列表。
