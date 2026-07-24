# 天源浏览器连接器

版本 `0.4.0`。此插件把已注册的本机 Agent 路由到其有权访问的天源浏览器页面。

## 来源与绑定

Bridge 内部使用 `agentBinding`，包含 Agent 来源、安装实例、工作区/对话范围、页面键和 `read`/`control` 权限。现有 `codexBinding` 会幂等迁移为 Codex `agentBinding`，并继续作为只读兼容字段返回。

- `connection_status`、`list_sessions`、`get_context` 仅返回当前已注册 Agent 的绑定页面。
- 读取要求来源身份与绑定匹配。
- 写入除既有确认文本、编辑锁、保存和回读门禁外，还要求当前 Agent 是该页面唯一的 `control` 控制者。
- 典型拒绝码：`AGENT_NOT_REGISTERED`、`AGENT_BINDING_MISMATCH`、`AGENT_READ_ONLY`、`AGENT_CONTROL_CONFLICT`。

Connector 启动时从本机 `runtime/agent-config.json` 或 `TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH` 读取 `providerId`、`installationId` 和 `credentialRef`。凭证本身不写入插件、仓库、工具参数或日志。

## Codex

安装脚本会注册 Codex 本机来源。侧栏仍可自动读取本机 Codex 项目和对话目录，并将当前页面绑定到工作区或对话。

## WorkBuddy 手动配置

当前没有假设或伪造 WorkBuddy 项目、对话或窗口 API。请在侧栏“Agent 控制者管理”创建 WorkBuddy 手动来源，填写本机可见的工作区和对话标识。侧栏会生成一个本机 `agent-config.json` 路径，可用于通用 stdio MCP：

```json
{
  "mcpServers": {
    "tianyuan-browser-connector": {
      "command": "node",
      "args": ["~/plugins/tianyuan-browser-connector/runtime/apps/mcp/server.mjs"],
      "env": {
        "TIANYUAN_CONNECTOR_BRIDGE_URL": "http://127.0.0.1:40415",
        "TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH": "侧栏生成的本机配置路径"
      }
    }
  }
}
```

该配置只含 `credentialRef`，不含 Agent 密钥、MCP token、Cookie、Authorization、密码或验证码。

## 页面控制权

同一页面可以有多个 `read` Agent，但只能有一个 `control` Agent。切换控制权必须由侧栏明确确认；旧控制者未执行或已领取的队列动作会标记为 `AGENT_CONTROL_REVOKED`，不会继续执行。

## 固定能力

Connector 不提供任意浏览器点击、任意 URL、任意 JavaScript 或绕过编辑锁。受控上传、清理和核对动作仍使用原有的确认、编辑锁、保存及回读门禁。
