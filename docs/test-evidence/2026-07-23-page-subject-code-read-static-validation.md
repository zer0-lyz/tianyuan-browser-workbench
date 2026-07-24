# 2026-07-23 页面科目代码直读静态验证

## 问题原因

此前页面树只返回科目名称和层级。批量执行需要 `subjectCode`，页面名称无法与 MCP 名称对应时，该页面可见科目会被丢弃，因此出现“页面有土建工程、土地使用权，但插件没有”的情况。

## 修复内容

- 页面适配器直接读取科目树节点代码：
  - Vue 节点的 `subjectCode/code/accountCode/value/id/key`；
  - DOM 的 `data-subject-code/data-code/node-key`；
  - 节点链接中的 `subjectCode`。
- 页面科目树结果增加 `subjectCode` 和父级路径。
- 侧栏按代码优先匹配页面显示状态，名称和路径仅作为兜底。
- MCP 缺少同名项但页面能读取到代码时，直接创建页面来源的科目候选。
- 页面来源科目仍只在页面显示树中出现时进入可选清单。
- 页面适配器版本更新为 `2026-07-23-page-subject-code-v8`。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

## 验证边界

需要重新加载未打包扩展后点击“加载科目”，查看证据 JSON 的 `pageTreeCodeCount`，并确认土建工程、土地使用权等页面可见科目进入清单。
