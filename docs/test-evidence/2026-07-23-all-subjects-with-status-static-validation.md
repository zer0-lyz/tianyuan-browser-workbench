# 2026-07-23 全量科目与状态标记静态验证

## 目标

按用户要求，不再因为页面树或 MCP 显示状态字段不一致而漏掉科目。面板改为加载 MCP 返回的全部科目。

## 修复内容

- 全部 MCP 科目进入面板并按代码建立层级。
- MCP 判断为显示状态的科目默认勾选。
- MCP 判断为隐藏状态的科目保留在树中，默认不勾选，并显示“（隐藏）”。
- 面板标题从“显示科目”改为“全部科目”。
- 执行前仍以用户最终确认勾选结果为准。
- 证据 JSON 增加显示数量和隐藏数量。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/sidepanel/index.html` 已更新为全量科目文案。
- `extension/src/sidepanel/styles.css` 已增加隐藏科目样式。
- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

## 验证边界

需要重新加载未打包扩展后点击“加载科目”，确认面板显示“全部科目”，并检查显示/隐藏数量和默认勾选状态。
