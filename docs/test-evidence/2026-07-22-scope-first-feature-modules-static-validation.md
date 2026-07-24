# 工作范围优先与功能模块静态验证

## 验证目标

将侧边栏从“批量保存功能内选择公司和科目”调整为“先确认工作范围，再执行功能模块”。

## 调整口径

- 工作范围独立显示。
- 工作范围顺序为：公司清单、显示科目。
- 公司确认后收起公司范围并展开科目范围。
- 科目确认后收起科目范围。
- 保存底稿是功能模块之一，后续功能应在功能模块区域并列加入。

## 代码变化

- `extension/src/sidepanel/index.html`
  - 新增“工作范围”区域；
  - 公司清单前置；
  - 科目清单后置；
  - 新增“功能模块 / 保存底稿”结构。
- `extension/src/sidepanel/sidepanel.js`
  - 增加 `companyScopePanel` 和 `subjectScopePanel` 引用；
  - 公司确认后自动折叠公司、展开科目；
  - 科目确认后自动折叠科目。
- `extension/src/sidepanel/styles.css`
  - 增加工作范围折叠面板和功能模块样式。

## 静态验证

- `node --check extension/src/sidepanel/sidepanel.js`：通过。
- `node --check extension/src/content/content.js`：通过。
- `node --check extension/src/injected/page_adapter.js`：通过。
- `extension/manifest.json` JSON 解析：通过。

## 真实验证边界

本记录不代表已在 Chrome 侧边栏实机确认。需要重新加载未打包扩展后检查实际折叠和执行顺序。
