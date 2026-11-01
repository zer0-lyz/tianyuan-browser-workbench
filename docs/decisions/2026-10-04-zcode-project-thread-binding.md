# 2026-10-04 绑定 Agent 面板接入 Zcode 项目与对话目录

## 背景

"绑定 Agent"面板此前支持 Codex 与 WorkBuddy 两个目录来源。用户希望在同一个面板绑定 Zcode（本机 ZCode CLI）中的项目和对话，使天源页面可交给 Zcode 会话控制。

## 关键事实

- Zcode 会话存储在 `~/.zcode/cli/db/db.sqlite`（WAL），`session` 表含 `id (sess_*)`、`project_id (proj_*)`、`directory/path`、`title`、`task_type`、`time_*`（毫秒）；无独立 project 表，项目按 `project_id` 从会话推导。`db.sqlite`（cli 根下）是空壳文件，真正的库在 `cli/db/` 下。
- Zcode 的 tianyuan-browser-connector MCP 以 `providerId=codex`（`installationId=codex-8d0383ee-…`，见 `~/.zcode/codex-plugins-marketplace/plugins/tianyuan-browser-connector/runtime/agent-config.json`）向桥接注册，并只消费 `providerId=codex` 的绑定（`client.mjs` 的 codexCompatibility 兼容层）。

## 决策

**Zcode 作为第三种"目录来源"，而不是新的 Agent 身份。** 绑定仍走 Codex 通道（`/api/sessions/:id/binding`，身份挂 codex 来源），只是目录数据换成 Zcode 本地库。理由：

1. 若注册独立 `providerId=zcode` 身份，需改插件 runtime 的 agent-config.json 并重启 MCP，且 Zcode MCP 侧只认 codex 绑定，端到端反而断链。
2. 复用 Codex 表单与绑定端点，改动面最小，绑定元数据（workspaceName/conversationTitle）即 Zcode 项目/会话名。

## 实现（3490517）

- `native-helper/connector_bridge.js`：新增 `zcodeCatalog()`（sqlite3 -json 读 session 表，过滤 `time_archived IS NULL AND parent_id IS NULL`，LIMIT 300），`/api/catalog` 白名单加 `zcode`，缺库返回 `ZCODE_CATALOG_UNAVAILABLE`(503)；bridge options/环境变量 `TIANYUAN_ZCODE_DB_PATH` 供测试注入。
- `extension/src/sidepanel/{sidepanel.js,index.html}`：工具下拉加 `Zcode`；Zcode 复用 Codex 表单区块（`codexAgentBindingFields`），`loadConnectorCatalog(provider)` 按 provider 拉目录；文案（占位、反馈、控制权确认）统一跟随 `agentBindingProviderLabel()`。
- `tests/zcode-catalog.test.cjs`：fixture sqlite 覆盖归档/子代理过滤、字段映射、缺库 503、未知 provider 400。

## 实施记录

- 2026-10-04：quality-check.sh 全量 148 项通过；真实库冒烟：4 项目 / 20 会话，排序正确。已提交 3490517（分支 codex/anjuke-property-continuation-20261001）。运行副本同步与 chrome://extensions 重载待用户验收后执行。
