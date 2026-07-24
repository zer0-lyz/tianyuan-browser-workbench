# 公司层级编码字段静态验证

时间：2026-07-22 23:41:17 CST

## 问题现象

用户澄清公司编号指页面表格“编码”列中的层级编码，例如：

- `1`
- `1-1`
- `1-2`
- `1-3`
- `1-3-1`

不是系统 ID。

## 修正内容

- 新增公司层级编码字段白名单，优先读取：
  - `displayCode/display_code`
  - `treeCode/tree_code`
  - `hierarchyCode/hierarchy_code`
  - `levelCode/level_code`
  - `nodeCode/node_code`
  - `relationCode/relation_code`
  - `sortCode/sort_code`
  - `sortNo/sort_no`
  - `serialNo/serial_no`
  - `serialNumber/serial_number`
  - `sequence/seq/seqNo`
  - `orderNo/order_no`
  - `ordinal/index/idx`
  - `rowNo/row_no`
  - `num/number`
  - 中文字段：`编码`、`公司编号`、`层级编码`、`序号`
- 公司展示标题不再用系统 ID 兜底。
- helper 透传层级编码字段给侧栏。
- 父级公司显示也优先用父级层级编码，不再用 parentId 作为显示前缀。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

## 后续验证

重新加载 Chrome 扩展后点击“加载清单”。如仍无法显示 `1-1` 这类编码，说明 MCP 当前公司接口未返回该列，需要查看证据 JSON 中公司 `raw` 字段确认真实字段名或改由页面表格采集。
