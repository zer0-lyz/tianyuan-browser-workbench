# 统一 Codex 项目与对话目录

## 决策

天源浏览器工作台的 Codex 绑定选择器复用 Connector Suite 的本机元数据来源：

- `~/.local/share/office-connector/runtime/config/projects.local.json`
- `~/.local/share/office-connector/runtime/config/threads.local.json`
- `~/.codex/sqlite/codex-dev.db`
- `~/.codex/process_manager/chat_processes.json`
- `~/.codex/sessions/**/*.jsonl`

天源 Connector 优先读取本机 Connector Platform 的 `/api/catalog`；平台不可用或返回空目录时，使用 `native-helper/codex_catalog.js` 做只读回退聚合。

展示层以 Connector Suite 的 `projects.local.json` 和 `threads.local.json` 作为保留项白名单：只展示当前注册且非归档、非删除、非移除的项目和对话，并优先使用注册表中的项目名与重命名后的对话标题。

## 安全边界

- 只读取项目路径、项目名称、对话 ID、标题、状态和时间；
- 不读取或返回对话正文、Cookie、Authorization、密码、验证码或 MCP token；
- 项目和对话仍由用户在侧栏明确选择后绑定；
- `scope=workspace` 与 `scope=conversation` 的权限校验保持不变；
- 本地目录不存在或无法读取时只显示诊断信息，不伪造项目或对话。

## 验收

`tests/codex-catalog.test.cjs` 覆盖 Connector Suite 注册表、Codex 全局状态和进程元数据合并，并确认目录条目不包含 `content` 字段。
