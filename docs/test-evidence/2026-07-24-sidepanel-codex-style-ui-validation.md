# 2026-07-24 侧栏 Codex 风格 UI 优化验证

## 目标

将天源浏览器工作台侧栏优化为与 WPS Connector / Codex 接近的简洁、低噪声、轻量样式，同时不改变已验证的页面执行逻辑。

## 修改范围

- `extension/src/sidepanel/styles.css`

## 优化内容

- 统一浅灰背景、白色状态卡和轻量边框。
- 主按钮使用低饱和蓝色，次级按钮使用浅灰样式。
- 首页功能模块先改为更紧凑的可扫描卡片，后续按用户反馈进一步改为应用图标宫格。
- 图标使用本地内联 SVG 线性图标，不依赖外部网络或图标库。
- 420px 宽侧栏中 6 个模块以两行展示，模块区高度从列表式约 698px 降到约 185px。
- 已调研 Phosphor Icons、Tabler Icons、Heroicons、Lucide 等开源图标库。当前采用本地内联 SVG，并参考 Phosphor 的轻量线性语言和 Apple 小应用图标的彩色圆角视觉，而不在扩展运行时引入外部依赖。
- 图标底板改为彩色柔和渐变，图形改为白色细线，增强 Apple/Codex 风格的精致感。
- 用户反馈彩色渐变版仍显廉价，已进一步改为中性玻璃感图标：灰白底、细线图标、小号彩色状态点，整体更接近 Codex 的克制风格。
- 顶部 Connector / Helper / MCP / CLI 状态改为两行轻量状态卡。
- 工作范围、保存设置、执行日志、证据 JSON 保持分层显示，日志和证据默认折叠。
- 收窄功能页返回按钮，避免窄侧栏下按钮被拉成整行。

## 验证动作

- `node --check extension/src/sidepanel/sidepanel.js`
- `node --check extension/src/content/content.js`
- `node --check extension/src/background/service_worker.js`
- `node --check extension/src/injected/page_adapter.js`
- `node scripts/install-local-runtime.mjs`
- 使用 Playwright 离线渲染 `extension/src/sidepanel/index.html`：
  - 420px 宽首页截图；
  - 420px 宽批量保存页截图；
  - 检查横向溢出元素数量。

## 验证结果

- JS 语法检查通过。
- 安装脚本运行成功，已同步本机运行目录。
- 安装脚本输出 `credentialsWritten=false`。
- 首页横向溢出数量：`0`。
- 批量保存页横向溢出数量：`0`。
- 应用图标宫格首页横向溢出数量：`0`。
- 应用图标宫格模块区高度：约 `185px`。
- 彩色应用图标版首页横向溢出数量：`0`。
- 彩色应用图标版模块区高度：约 `185px`。
- 中性玻璃图标版首页横向溢出数量：`0`。
- 中性玻璃图标版模块区高度：约 `187px`。
- Phosphor 图标版首页横向溢出数量：`0`。
- Phosphor 图标版模块区高度：约 `197px`。
- Phosphor 图标版 SVG 显示宽度：约 `34px`。
- 首页模块小圆点数量：`0`。
- 连接配置页横向溢出数量：`0`。
- 连接配置页“操作能力”默认折叠：`true`。
- 连接配置页项目/对话原生 select 显示状态：`display:none`。
- 连接配置页 CSS 版本：`styles.css?v=20260724-connector-picker`。
- 连接配置页选择器精修后 CSS 版本：`styles.css?v=20260724-picker-refine`。
- 项目列表选中态：浅色背景、细蓝边、右侧小勾；无大面积蓝色选中块。
- 项目列表项最小高度：约 `52px`，路径单行省略，避免文字堆叠。

## 截图证据

- `docs/test-evidence/2026-07-24-sidepanel-codex-style-home.png`
- `docs/test-evidence/2026-07-24-sidepanel-codex-style-batch-save.png`
- `docs/test-evidence/2026-07-24-sidepanel-app-icons-home.png`
- `docs/test-evidence/2026-07-24-sidepanel-premium-icons-home.png`
- `docs/test-evidence/2026-07-24-sidepanel-neutral-icons-home.png`
- `docs/test-evidence/2026-07-24-sidepanel-phosphor-icons-home.png`
- `docs/test-evidence/2026-07-24-connector-picker-capability-collapse.png`
- `docs/test-evidence/2026-07-24-connector-picker-refined-open.png`

## 边界

本次只改侧栏样式，不改科目树读取、公司读取、保存、退出编辑、导出、打印格式、上传或 Connector 执行逻辑。
