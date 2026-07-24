# 2026-07-23 隐藏科目编号界面显示静态验证

## 修复内容

- 科目面板只显示科目名称和页面层级。
- 科目代码仍保留在内部值中，用于可靠的 URL 切换和批量执行。
- 无法可靠匹配的科目继续通过页面路径执行。
- `subjectDisplayTitle()` 不再把代码拼接到界面标题。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
