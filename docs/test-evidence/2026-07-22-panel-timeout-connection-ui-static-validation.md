# 面板超时与连接状态静态验证记录

日期：2026-07-22

## 修复内容

- content script 等待页面适配器加载完成后再发送上下文读取请求，避免首次注入消息丢失导致 `TIANYUAN_WORKBENCH_GET_CONTEXT_TIMEOUT`。
- 面板新增“连接状态”，显示 Helper、MCP 和 CLI 状态。
- 页面、表格、门禁信息合并为默认折叠的“页面诊断”。

## 验证结果

- `native-helper/server.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本地 helper `/health?probe=1` 可返回 Helper、MCP、CLI 状态。
- 测试进程未配置 MCP token 时，MCP 状态正确显示 `VALUATION_MCP_TOKEN_NOT_SET`。
- 本机 `tycpv --version` 可被 helper 检测到，版本为 `0.1.0`。

## 边界

- 本轮未执行真实保存。
- 本轮未将 MCP token 写入项目文件。
- 真实 MCP 连接和清单加载仍需用本机临时 `VALUATION_MCP_TOKEN` 启动 helper 后在浏览器面板验证。
