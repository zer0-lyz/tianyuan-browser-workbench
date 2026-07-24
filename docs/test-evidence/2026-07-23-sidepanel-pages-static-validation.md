# 多页面侧栏静态验证

日期：2026-07-23

## 验证范围

- 首页、连接配置、批量保存、批量退出编辑四个内部路由。
- 顶部 Helper、MCP、CLI 全局连接状态。
- 两个功能模块的独立公司、科目、确认、日志和证据状态。
- 窄侧栏响应式布局。
- 原有批量保存、批量退出编辑和科目树执行逻辑不变。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 通过 Node.js 语法检查。
- `extension/src/injected/page_adapter.js` 通过 Node.js 语法检查。
- `extension/src/content/content.js` 通过 Node.js 语法检查。
- `extension/manifest.json` 通过 JSON 解析。
- HTML 共 81 个 ID，JavaScript 共定义 81 个元素引用；未发现缺失 ID。
- `git diff --check` 通过。
- 使用本机 Chrome Headless 生成首页、连接页、批量保存页和批量退出编辑页静态预览；四个页面均成功渲染。
- 首页在窄侧栏下使用单列功能卡片。
- 日志和证据区域默认折叠。

## 验证边界

本次未通过浏览器控制桥直接操作用户当前 Chrome。需要在 `chrome://extensions/` 重新加载未打包扩展后，进行一次真实侧栏点击验证，并确认两个功能页切换后各自范围保持独立。
