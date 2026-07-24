# 批量退出编辑功能静态验证记录

验证时间：2026-07-23 01:33 CST

## 验证对象

- `extension/src/sidepanel/index.html`
- `extension/src/sidepanel/sidepanel.js`
- `extension/src/content/content.js`
- `extension/src/injected/page_adapter.js`
- `extension/manifest.json`

## 本次新增能力

- 在侧边栏“功能模块”区域新增“退出编辑”模块。
- 退出编辑复用已确认的公司范围和科目范围。
- 支持预演模式和正式执行模式。
- 正式执行需要勾选确认。
- 页面执行动作新增 `exit_edit_current_subject`。
- 批量结果继续写入扩展本地存储 `tianyuanWorkbenchLastBatchResult`。

## 静态验证命令

```bash
node --check extension/src/injected/page_adapter.js
node --check extension/src/sidepanel/sidepanel.js
node --check extension/src/content/content.js
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8')); console.log('manifest ok')"
```

## 验证结论

- JavaScript 语法检查通过。
- Manifest JSON 解析通过。
- 本次验证未在真实天源页面点击“退出编辑”。

## 风险边界

- “退出编辑”会改变页面编辑状态，正式执行必须由用户在插件面板勾选确认。
- 真实页面可能存在二次确认弹窗或按钮文案变化，需要实机预演后再做正式执行。
- 部分公司执行仍必须读回天源公司弹窗实际勾选状态；不一致时不得继续执行。
