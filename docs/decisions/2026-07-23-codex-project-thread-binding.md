# Codex 项目与对话绑定

## 决策

天源浏览器页面不能只绑定到一个浏览器标签页，还必须绑定到 Codex 项目或具体对话。默认范围为“仅当前对话”，只有用户主动选择“整个项目”时才扩大范围。

## 标识

- `sessionId`：当前天源浏览器标签页的在线连接。
- `bindingId`：当前天源页面与 Codex 路由的绑定记录。
- `projectId`：Codex 项目标识。
- `threadId`：Codex 对话标识。
- `scope`：`thread` 或 `project`。

## 交互

1. 浏览器面板启动 Connector 并绑定当前天源页面。
2. 面板从本机 Connector Platform 加载 Codex 项目和对话列表。
3. 用户选择项目、绑定范围和对话。
4. 面板保存绑定并显示 Binding ID。
5. Codex MCP 先调用 `tianyuan.connection_status`，再复用返回的 `sessionId + bindingId`。
6. 解除绑定后，Codex 只能看到未绑定状态，不能读取页面上下文。

## 路由规则

- 不允许因为某个 session “最新”就自动切换。
- 匹配多个 session 时必须明确选择。
- `get_context` 必须同时提供 `sessionId` 和 `bindingId`。
- 当前只开放只读上下文和能力查询，正式保存、退出编辑、上传和落库仍由浏览器面板的确认门禁控制。
