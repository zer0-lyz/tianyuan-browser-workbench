# MCP/native-helper 静态验证记录

日期：2026-07-22

## 验证对象

- `native-helper/server.js`
- `extension/src/sidepanel/sidepanel.js`
- `extension/src/injected/page_adapter.js`
- `extension/manifest.json`

## 验证结果

- `native-helper/server.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- helper 可启动并监听 `http://127.0.0.1:8765`。
- `/health` 返回正常，且 `security.credentialsReturned` 为 `false`。

## 边界

- 本轮未把 MCP token 写入项目文件。
- 当前 shell 未持久配置 `VALUATION_MCP_TOKEN`，因此未在证据文件中记录真实 MCP 返回结果。
- 真实公司和科目清单加载需在本机临时导入 `VALUATION_MCP_TOKEN` 后验证。
