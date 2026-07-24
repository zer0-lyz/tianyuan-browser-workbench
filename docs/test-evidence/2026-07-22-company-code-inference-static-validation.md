# 公司层级编号推导静态验证

时间：2026-07-22 23:45:24 CST

## 问题现象

用户反馈公司清单仍未加载页面表格中的“编码”列。

## 修正内容

- 如果 MCP 未返回 `1-1` 这类层级编码，则按公司父子关系和接口原始顺序推导编号。
- 支持通过 `parentId/parentCompanyId` 或 `parentName/parentCompanyName` 建立父子关系。
- 公司树排序优先使用层级编号。
- 显示标题继续使用 `层级编号 公司简称`。

## 样本验证

使用与用户截图类似的父子结构验证，输出：

`1 中显芯科 | 1-1 英拓智算 | 1-2 深圳扶摇 | 1-3 中显光电 | 1-3-1 迪吉芯半导体 | 1-3-2 力通兴威`

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

## 后续验证

重新加载 Chrome 扩展后点击“加载清单”。如 MCP 公司项包含父级字段，应显示 `1-1`、`1-3-2` 等编号。
