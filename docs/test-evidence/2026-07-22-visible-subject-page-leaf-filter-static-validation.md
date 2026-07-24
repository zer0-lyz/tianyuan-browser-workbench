# 页面显示科目叶子过滤静态验证

## 验证目标

修复天源页面左侧真实显示“其他应付款”，但插件科目清单未加载该科目的问题。

## 修复口径

- MCP 只作为科目代码和名称全集来源。
- 页面左侧科目树是最终显示状态依据。
- 可勾选保存项只来自页面显示树的叶子科目。
- 同名父子科目按层级深度区分，例如父级“其他应付款”和子级“其他应付款”。

## 代码变化

- `extension/src/injected/page_adapter.js`
  - 科目树采集不再按纯文本去重；
  - 增加 `depth` 和 `leaf` 字段；
  - 版本号提升到 `2026-07-23-visible-subject-leaf-v1`。
- `extension/src/sidepanel/sidepanel.js`
  - 页面树存在时，先用 MCP 全量科目，再按页面叶子节点过滤；
  - 页面树不可用时，才回退使用 MCP 显示字段。
- `extension/src/content/content.js`
  - 同步提升注入版本，避免旧适配器缓存。

## 静态验证

- `node --check extension/src/sidepanel/sidepanel.js`：通过。
- `node --check extension/src/content/content.js`：通过。
- `node --check extension/src/injected/page_adapter.js`：通过。
- `extension/manifest.json` JSON 解析：通过。

## 真实验证边界

本记录不代表已经在真实页面重新加载成功。需要重新加载未打包扩展，并在天源底稿页点击“加载科目”验证。
