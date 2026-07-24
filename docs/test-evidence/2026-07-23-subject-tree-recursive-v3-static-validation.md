# 2026-07-23 科目树递归读取 v3 静态验证

## 目标

修复天源浏览器工作台“加载科目”时漏掉 `其他应付款` 的问题。该问题集中在页面左侧树存在同名父子节点时，例如：

- `流动负债`
- `其他应付款`
- `其他应付款`

旧逻辑容易只保留部分叶子或按名称/层级误删候选项。

## 修复内容

- `extension/src/injected/page_adapter.js`
  - `collectSubjectTreeItems()` 优先按 Element UI 树节点递归读取，不再只依赖文本坐标和下一行缩进推断。
  - 为同名节点使用树路径作为去重键，避免 `其他应付款 -> 其他应付款` 被压成一个节点。
  - 读取 Vue/Element 节点数据中的 `subjectName/name/label/text/title` 等字段，DOM 文本仅作为兜底。
  - 读取真实子节点数量判断父子层级，坐标启发式仅作为无结构树时的兜底。

- `extension/src/sidepanel/sidepanel.js`
  - 页面显示科目过滤改为“所有页面可见树节点都参与匹配”，不再先收窄到叶子节点。
  - 同名重复科目按 MCP 全量候选保留，避免深层同名科目被提前过滤掉。
  - 证据 JSON 新增 `pageSubjectResult` 和 `subjectContextSummary`，便于回看页面树读取数量、MCP 数量、最终标准化数量。

- `extension/src/content/content.js`
  - 页面适配器版本更新为 `2026-07-23-subject-tree-recursive-v3`，避免继续使用旧注入脚本。

## 验证结果

- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

## 验证边界

本次在本地完成代码级修复和静态校验；仍需在真实天源底稿页重新加载未打包扩展后点击“加载科目”，确认面板中出现 `其他应付款`，并确认其层级显示正确。
