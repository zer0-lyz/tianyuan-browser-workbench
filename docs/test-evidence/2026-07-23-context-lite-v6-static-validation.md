# 2026-07-23 上下文轻量化 v6 静态验证

## 目标

修复侧边栏刷新时报 `TIANYUAN_WORKBENCH_GET_CONTEXT_TIMEOUT` 的问题，确保面板先能稳定读到页面基础上下文。

## 修复内容

- `extension/src/injected/page_adapter.js`
  - `collectContext()` 改为轻量读取页面基本信息。
  - 默认不再把 `subjectTree` 整棵树塞进上下文返回。
  - `controlsPreview` 缩减为更小的预览数量。
  - 适配器版本更新为 `2026-07-23-context-lite-v6`。

- `extension/src/content/content.js`
  - 同步升级适配器版本握手，确保重新注入新脚本。

## 验证结果

- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

## 验证边界

本次只完成代码级修复和静态校验；真实验证需重新加载未打包扩展后刷新侧边栏，确认红框超时消失。
