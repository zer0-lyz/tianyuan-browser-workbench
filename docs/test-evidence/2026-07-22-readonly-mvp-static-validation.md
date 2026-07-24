# 只读 MVP 静态验证记录

时间：2026-07-22

## 范围

本次验证仅针对插件文件结构和静态语法，不连接真实天源页面，不执行上传、保存或写入。

## 文件

- `extension/manifest.json`
- `extension/src/background/service_worker.js`
- `extension/src/content/content.js`
- `extension/src/injected/page_adapter.js`
- `extension/src/sidepanel/index.html`
- `extension/src/sidepanel/styles.css`
- `extension/src/sidepanel/sidepanel.js`

## 验证点

- 插件限定匹配 `https://excel.zhrdc.net/ty/*`。
- 页面适配器只读取上下文，不调用 `activateEditor`，不点击保存按钮，不上传文件。
- 输出 JSON 中显式标记：
  - `readOnlyMvp: true`
  - `writesPerformed: false`
  - `credentialsCaptured: false`
- 代码不得保存 Cookie、Authorization、密码、验证码或 token。

## 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- 以下文件已通过 JS 语法检查：
  - `extension/src/background/service_worker.js`
  - `extension/src/content/content.js`
  - `extension/src/injected/page_adapter.js`
  - `extension/src/sidepanel/sidepanel.js`
- 已扫描 `extension/`、`docs/decisions/`、`docs/test-evidence/` 中的写入关键词；除决策文档中提及 `/assignment_draft/save` 的门禁说明外，未发现上传接口、保存接口、`uploadFile`、点击动作或 `activateEditor()` 调用。
- 2026-07-22 21:22:52 CST：修复 ego lite/Chrome 加载报错 `Invalid value for 'web_accessible_resources[0]'. Invalid match pattern.`。原因是 `web_accessible_resources.matches` 对路径匹配更严格，已从 `https://excel.zhrdc.net/ty/*` 改为 `https://excel.zhrdc.net/*`；content script 仍限定 `https://excel.zhrdc.net/ty/*`。
- 2026-07-22 21:27:23 CST：补强 `/equity/list` 公司列表页识别。列表页可读取 `projectId` 并提示点击“资产基础法”进入底稿；真实 SpreadJS 底稿采集仍只在资产基础法底稿页执行。
- 2026-07-22 21:30:07 CST：增加侧边栏自动补注入 content script 能力。若当前天源页是在扩展加载前打开，侧边栏会先通过 `chrome.scripting.executeScript` 注入 `src/content/content.js`，再读取上下文。

## 待补充

真实页面验证已补充：`docs/test-evidence/2026-07-22-readonly-mvp-live-success.md`。
