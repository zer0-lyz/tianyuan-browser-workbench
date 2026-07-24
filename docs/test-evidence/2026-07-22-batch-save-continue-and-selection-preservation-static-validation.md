# 批量保存继续执行与选择保持静态验证

## 验证目标

确认批量保存不会因中间科目失败而静默跳过后续科目，并确认页面上下文刷新不会清空已确认的科目和公司。

## 验证内容

- `runBatchSave` 的科目循环为每个科目建立独立 `try/catch`。
- 页面上下文读取调用 `render(response, { preserveBatchSelections: true })`。
- `render` 仅在非保持模式下重置 MCP 科目/公司清单和确认状态。
- 任务结果包含 `taskLogEntries`，并写入 `tianyuanWorkbenchLastBatchResult`。

## 静态结果

- `node --check extension/src/sidepanel/sidepanel.js`：通过。
- `node --check extension/src/content/content.js`：通过。
- `node --check extension/src/injected/page_adapter.js`：通过。
- `extension/manifest.json` JSON 解析：通过。

## 真实验证边界

本记录不代表真实天源页面正式保存成功。重新加载扩展后仍需用预演和小范围正式执行验证页面跳转、保存按钮、编辑锁和结果回读。
