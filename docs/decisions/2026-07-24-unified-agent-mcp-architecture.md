# 统一 Agent MCP 能力架构

日期：2026-07-24

## 决策

天源浏览器能力只在 `plugins/tianyuan-browser-connector/runtime/apps/shared/client.mjs` 定义一次。Codex、WorkBuddy 和后续 Agent 通过同一 MCP server 和同一 Bridge 调用，不复制业务工具实现。

- 浏览器扩展、Native Helper 和 Bridge 是共享运行层。
- 每个 Agent 只提供 `providerId`、`installationId` 和本机 `credentialRef`。
- 页面访问继续由 `agentBinding`、`read/control` 权限和编辑门禁控制。
- WorkBuddy 使用其 `connector-proxy` 聚合统一工具；工具显示问题属于启用/Trust/工具缓存问题，不应通过复制代码解决。
- MCP server 实现标准 `ping`，避免 WorkBuddy 健康检查把正常 Connector 判为失活。

## 验证事实

WorkBuddy 代理已成功从 Connector 读取 12 个天源工具；此前未显示的原因是 `custom-mcp:tianyuan-browser-connector` 不在 WorkBuddy 当前 Agent 的 enabled 列表，且 Connector 未实现 `ping`。

## 安全边界

统一工具不等于共享 Agent 身份。每个 Agent 仍必须独立注册和匹配绑定，防止任意本机进程冒充其他 Agent 获取页面控制权。
