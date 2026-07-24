# 2026-07-23 科目树不完整时回退 MCP 显示字段 v5 静态验证

## 目标

避免页面左侧科目树只读到首屏时，把 MCP 科目清单裁成单一路径，导致只剩 `C3` 分支。

## 修复内容

- `extension/src/sidepanel/sidepanel.js`
  - 新增页面科目树可用性判断。
  - 当页面树只读到零散首屏内容、无法覆盖足够科目时，改用 MCP 显示字段生成科目清单。
  - 保留页面树作为提示和证据，但不再让不完整的页面树硬裁掉 MCP 清单。
  - 加载时会写入“页面科目树读取不完整，已改用 MCP 显示字段生成清单”的日志。

- `extension/src/injected/page_adapter.js`
  - 继续使用 `2026-07-23-subject-tree-fallback-v5` 版本握手，确保页面注入脚本可替换。

## 验证结果

- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

## 验证边界

本次只完成代码级修复和静态校验；真实验证仍需重新加载未打包扩展后点击“加载科目”，确认不再只显示首屏 `C3` 分支。
