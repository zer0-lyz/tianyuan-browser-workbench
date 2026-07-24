# 2026-07-23 页面科目树镜像静态验证

## 问题原因

此前虽然展开并读取了页面科目树，但仍要求页面名称先映射到 MCP 科目代码后才展示。名称不一致或代码缺失的页面节点会被丢弃，因此无法真正照抄页面树。

## 修复内容

- 页面科目树直接决定面板的显示范围、层级和顺序。
- 只将页面树叶子科目作为可勾选项，父级直接作为路径分组。
- MCP 只负责补充 `subjectCode`，不再决定页面显示范围。
- 编号只在页面直接读到代码，或 MCP 存在唯一的同名同层级匹配时展示。
- 重名、层级不一致或只能模糊匹配时不展示编号。
- 无法补到代码的页面叶子仍保留，通过完整页面路径定位并执行。
- 新增 `activate_subject_by_path`，支持同名科目按完整路径切换。
- 证据 JSON 新增 `pageMirrorCount`。
- 页面适配器版本更新为 `2026-07-23-page-tree-mirror-v9`。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 证据 JSON 输出 `pageMirrorCodedCount` 和 `pageMirrorPathOnlyCount`。

## 验证边界

需重新加载未打包扩展后点击“加载科目”，确认面板的父级、叶子和顺序与天源左侧展开树一致。
