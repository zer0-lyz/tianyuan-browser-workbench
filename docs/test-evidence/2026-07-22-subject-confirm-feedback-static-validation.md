# 科目确认反馈静态验证

时间：2026-07-22 23:42:21 CST

## 修正内容

- “显示科目”标题旁新增确认状态。
- 默认显示 `默认当前科目`。
- 加载科目后未确认时显示 `未确认`。
- 点击“确认”后显示 `已确认 N 个`。
- 复用公司清单确认反馈样式。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

## 后续验证

重新加载扩展后，加载科目并点击确认，标题旁应显示 `已确认 N 个`。
