# 天源浏览器连接器

版本 `0.4.2`。此插件把已注册的本机 Agent 路由到其有权访问的天源浏览器页面。

## 来源与绑定

Bridge 内部使用 `agentBinding`，包含 Agent 来源、安装实例、工作区/对话范围、页面键和 `read`/`control` 权限。现有 `codexBinding` 会幂等迁移为 Codex `agentBinding`，并继续作为只读兼容字段返回。

- `connection_status`、`list_sessions`、`get_context` 仅返回当前已注册 Agent 的绑定页面。
- 读取要求来源身份与绑定匹配。
- 写入除既有确认文本、编辑锁、保存和回读门禁外，还要求当前 Agent 是该页面唯一的 `control` 控制者。
- 典型拒绝码：`AGENT_NOT_REGISTERED`、`AGENT_BINDING_MISMATCH`、`AGENT_READ_ONLY`、`AGENT_CONTROL_CONFLICT`。

Connector 启动时从本机 `runtime/agent-config.json` 或 `TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH` 读取 `providerId`、`installationId` 和 `credentialRef`。凭证本身不写入插件、仓库、工具参数或日志。

## Codex

安装脚本会注册 Codex 本机来源。侧栏仍可自动读取本机 Codex 项目和对话目录，并将当前页面绑定到工作区或对话。

## WorkBuddy 配置

侧栏在发现 WorkBuddy 手动来源后，会只读加载 `~/.workbuddy/workbuddy.db` 中的工作区和会话元数据。用户可选择项目和对话后确认绑定；不读取对话正文，也不依赖窗口扫描。若本机目录不可用，仍可在“Agent 控制者管理”中手动填写工作区和对话标识。侧栏会生成一个本机 `agent-config.json` 路径，可用于通用 stdio MCP：

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

## 本机脚本模式

浏览器扩展会自动注册 `tianyuan-local-script` 来源。批量上传、清理和其他侧栏写入模块可以在没有外部 Agent MCP 的情况下使用；首次执行前，侧栏会请求将当前页面控制权授予“天源工作台本机脚本”。该来源只接受已安装扩展的身份请求，不提供 MCP credential，也不会把 token 写入文件。Native Host 和本机 Bridge 仍需通过安装脚本完成注册。

## 固定能力

Connector 不提供任意浏览器点击、任意 URL、任意 JavaScript 或绕过编辑锁。受控上传、清理和核对动作仍使用原有的确认、编辑锁、保存及回读门禁。

资产基础法底稿批量保存和批量退出编辑已作为 MCP 工具暴露给 Codex：

- `tianyuan.preview_batch_save` / `tianyuan.execute_batch_save`
- `tianyuan.preview_batch_exit_edit` / `tianyuan.execute_batch_exit_edit`

这些工具只会操作已绑定的天源资产基础法底稿页面。批量动作采用“预演 → 明确确认 → 逐科目执行 → 返回每科目成功证据”的流程；执行确认文本分别为 `确认批量保存` 和 `确认批量退出编辑`。如果浏览器页面没有加载扩展并绑定当前项目/对话，工具会返回 `NO_ONLINE_SESSIONS` 或绑定不匹配，而不会尝试控制普通标签页。

## 财务报表导入

插件新增独立的“天源财务报表导入”能力，用于将已经解析的资产负债表或利润表数据导入天源评估系统。它通过本机 `~/.tycpv/` 登录态连接 `valuation-mcp`，不依赖浏览器页面点击，也不会读取或修改源 Excel。

固定流程为：

```text
companies → prepare（只读预检）→ 用户确认 → execute（保存）→ read（回读）
```

示例：

```bash
node runtime/scripts/financial-statement-import.mjs companies --project-id <项目ID>
node runtime/scripts/financial-statement-import.mjs prepare \
  --project-id <项目ID> --company-id <公司ID> \
  --file "/本地/资产负债表.xlsx" --type balance_sheet \
  --json "/本地/资产负债表解析数据.json" --audit 2
node runtime/scripts/financial-statement-import.mjs execute --token "<预检返回的短期确认凭证>"
node runtime/scripts/financial-statement-import.mjs read \
  --project-id <项目ID> --company-id <公司ID> --type all
```

详细规则见 `skills/financial-statement-import/SKILL.md`。预检不会落库；只有用户明确确认后才允许执行，执行后必须回读关键科目金额。

## 更新

工作台 `0.13.0` 起，“更新全部组件”会把 Connector 同步到 `~/plugins/tianyuan-browser-connector` 和 `~/.codex/plugins/cache/personal/tianyuan-browser-connector/0.4.2`。已启动的 Codex 或 WorkBuddy MCP 进程不会热替换；更新后仍显示旧版本时，需要重启对应 Agent。
