# 2026-07-23 父级科目路径对齐静态验证

## 发现的问题

父级科目名称被错误向下错一层。例如路径只返回：

`固定资产 / 房屋建筑物`

旧逻辑却按完整路径从 `C4` 开始索引，可能把 `房屋建筑物` 显示成 `C4-8` 的父级名称。

## 修复内容

- `extension/src/sidepanel/sidepanel.js`
  - `pathNameForCode()` 改为从路径末端按当前科目代码层级对齐。
  - 建树时收集所有子科目路径，对父级名称进行投票。
  - 子科目路径优先用于确定父级名称，当前对象自身 `name` 只作为兜底。
  - 例如 `C4-8-1` 的路径为 `固定资产/房屋建筑物` 时，`C4-8` 显示为 `固定资产`，而不是 `房屋建筑物`。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本地路径对齐样例通过。
