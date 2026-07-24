# 多 Agent 来源识别、授权与页面绑定本地验证

日期：2026-07-24

## 范围

只启动临时本机 Bridge，使用模拟页面 session 和临时来源凭证。未连接天源线上页面，未执行上传、保存、清理、退出编辑或任何底稿写入。

## 执行

```bash
node tests/agent-binding-bridge.test.cjs
```

## 结果

- 旧 `codexBinding` 持久记录迁移为 Codex `agentBinding`；保留兼容字段。
- WorkBuddy 手动来源可绑定为 `read`，并只看到自己的页面 session 上下文。
- WorkBuddy 的写入动作返回 `AGENT_READ_ONLY`。
- 未注册来源返回 `AGENT_NOT_REGISTERED`；交叉使用 Codex binding 返回 `AGENT_BINDING_MISMATCH`。
- 控制权转移未确认时返回 `CONTROL_TRANSFER_CONFIRMATION_REQUIRED`；旧控制者继续领取队列时返回 `AGENT_CONTROL_CONFLICT`。
- 明确确认后控制权切换，原 Codex 已排队写入动作失效；原控制者后续写入返回 `AGENT_READ_ONLY`。
- 另一个仅绑定 Codex 的 session 不会出现在 WorkBuddy 的 `list_sessions` 结果中。
- 以受限本机 Agent 配置启动 Codex Connector 客户端，可读取指定 Codex binding 的连接状态。

## 安全核对

测试临时目录在结束时删除。测试输出不包含 MCP token、Cookie、Authorization、密码、验证码或 Agent 凭证原文。

## 本机安装与只读连通性

- 执行 `node scripts/install-local-runtime.mjs` 成功，Connector 同步到 `~/plugins/tianyuan-browser-connector` 与 `~/.codex/plugins/cache/personal/tianyuan-browser-connector/0.4.0`。
- 通过 Chrome Native Messaging 帧调用 `start_connector_bridge`，Bridge 返回 `connector-agent-binding-v2`。
- 已验证 `tianyuan.list_capabilities`；未建立在线页面时，`tianyuan.connection_status` 返回安全的 `NO_ONLINE_SESSIONS`，未读取任何天源页面上下文。
