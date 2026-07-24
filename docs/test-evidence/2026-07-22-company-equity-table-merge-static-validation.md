# 公司表格编码合并静态验证

时间：2026-07-22 23:49:50 CST

## 问题现象

用户确认系统页面有“编码”列，但 MCP 公司清单未提供该列或字段无法识别。

## 修正方案

- 公司清单加载时仍先用 MCP 获取系统 ID。
- 若需要展示公司编码，则后台打开同项目 `equity/list` 页面。
- 在页面表格中按表头读取：
  - `编码`
  - `公司名称`
  - `公司简称`
  - `上级母公司`
- 将页面表格结果与 MCP 公司结果按公司名称/简称合并。
- 系统 ID 继续作为内部 value，用于正式保存时匹配系统。
- 面板显示使用页面表格中的 `编码 + 公司简称`。

## 验证结果

- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

## 后续验证

重新加载扩展后点击“加载清单”。任务日志应显示 `页面公司表读取完成：N 行`，公司列表应显示页面表格的编码。
