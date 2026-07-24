# 天源 Connector 连接面板验证

日期：2026-07-23

## 已验证

- `native-helper/native_host.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/manifest.json` 可解析。
- 侧栏 JavaScript 引用的 144 个 HTML ID 均存在。
- Bridge `GET /health` 返回 `connector-source-v1`、`tianyuan-browser` 和本地运行状态。
- Bridge `GET /api/protocol` 返回能力矩阵和安全门禁。
- `POST /api/sessions/register` 可登记项目、公司、科目和页面类型。
- `POST /api/sessions/:sessionId/heartbeat` 可更新轻量上下文。
- `GET /api/sessions/:sessionId` 可读回绑定 session。
- Native Messaging `start_connector_bridge` 可自动拉起 Bridge。
- 本机运行副本已同步到 `~/.tianyuan-workbench/native-helper/`。
- 固定扩展来源返回 200，`https://example.com` 来源返回 403。

## 未验证

- 需要重新加载未打包扩展后，在真实侧栏点击“启动 Connector”和“绑定当前页面”。
- 需要在真实天源页面核对绑定的项目、公司、科目、页面类型和最后心跳。
- 尚未执行任何正式保存、退出编辑、上传或落库操作。
- 尚未将本轮改动重新打入 Windows r2 发行包。
