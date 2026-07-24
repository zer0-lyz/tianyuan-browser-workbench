# 2026-07-23 科目树滚动采集 v4 静态验证

## 目标

修复天源浏览器工作台“加载科目”时仍漏掉下方滚动区域中的科目节点，例如 `其他应付款`。

## 修复内容

- `extension/src/injected/page_adapter.js`
  - 在递归读取 Element UI 树节点的基础上，新增树容器滚动采集。
  - 对可滚动的科目树容器按步进滚动，多次采集当前可见树节点并合并去重。
  - 适配器版本更新为 `2026-07-23-subject-tree-scroll-v4`，确保重新加载扩展后注入新逻辑。

- `extension/src/content/content.js`
  - 同步升级适配器版本握手，避免旧版注入脚本继续生效。

## 验证结果

- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

## 验证边界

本次只完成代码级修复和静态校验；真实验证仍需重新加载未打包扩展后，在天源底稿页点击“加载科目”，确认树容器滚动到底后，`其他应付款` 能进入面板清单。
