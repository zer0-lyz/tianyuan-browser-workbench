# 部分公司选择执行静态验证

## 验证目标

修复面板中确认两个公司后，批量保存没有按这两个公司实际执行的问题。

## 修复口径

- 面板确认的公司选择是唯一执行来源。
- 传给页面执行层的是结构化公司对象，不是单一名称字符串。
- 页面端匹配公司时使用编号、简称、全称、标题、ID/value 多字段。
- 点保存前必须读回天源弹窗实际勾选公司。
- 若实际选择与面板确认不一致，停止保存。

## 代码变化

- `extension/src/sidepanel/sidepanel.js`
  - `getBatchSaveConfig` 新增 `selectedCompanies`；
  - `companyFilters` 扩展为编号、简称、名称、ID/value 的候选 token。
- `extension/src/injected/page_adapter.js`
  - `selectCompanyScope` 接收 `selectedCompanies`；
  - 选择前读取弹窗 checkbox 项；
  - 调整为只勾选目标公司；
  - 读回 `selectedAfter` 并校验 `missingAfter / extraAfter`。
- `extension/src/content/content.js`
  - 注入版本提升，避免旧 adapter 缓存。

## 静态验证

- `node --check extension/src/sidepanel/sidepanel.js`：通过。
- `node --check extension/src/content/content.js`：通过。
- `node --check extension/src/injected/page_adapter.js`：通过。
- `extension/manifest.json` JSON 解析：通过。

## 真实验证边界

本记录不代表真实页面已保存成功。需要重新加载未打包扩展后，在天源底稿页用部分公司范围重新执行并检查 JSON 中的 `select_company_scope` 步骤。
