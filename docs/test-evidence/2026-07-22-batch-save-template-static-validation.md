# 批量保存模板静态验证记录

时间：2026-07-22 21:41:56 CST

## 范围

本次验证针对“批量保存底稿”任务模板的静态文件和语法，不执行真实保存。

## 文件

- `extension/src/content/content.js`
- `extension/src/injected/page_adapter.js`
- `extension/src/sidepanel/index.html`
- `extension/src/sidepanel/sidepanel.js`
- `extension/src/sidepanel/styles.css`

## 验证结果

- `extension/manifest.json` 已通过 JSON 解析。
- 以下文件已通过 JS 语法检查：
  - `extension/src/background/service_worker.js`
  - `extension/src/content/content.js`
  - `extension/src/injected/page_adapter.js`
  - `extension/src/sidepanel/sidepanel.js`
- 已扫描扩展代码，未发现 Cookie、Authorization、密码、验证码或完整 token 的保存逻辑。
- 当前模板未实现附件上传接口、`uploadFile` 或附件分类接口。
- 2026-07-22 21:50:06 CST：批量保存面板改为复选清单交互。科目不再手工输入；部分公司支持从 `选择更多` 弹窗读取公司清单后多选。
- 面板 CSS 已改为宽度自适应布局：主要表单使用 `auto-fit/minmax`，页面容器随侧边栏宽度扩展。
- 2026-07-22 21:56:39 CST：纠正交互方向。科目和公司清单均加载到插件面板选择；公司弹窗只作为读取来源，读取后关闭，不在原生弹窗中让用户确认。
- 批量执行支持两类科目目标：有 `subjectCode` 的科目按 URL 打开；仅有左侧树名称的科目按名称点击切换。
- 2026-07-22 22:02:10 CST：新增“加载科目”按钮，显式读取左侧科目树；增强公司清单读取，兼容 `选择更多`、`公司主体`、`公司列表`、`股权结构` 等入口文字，并只抓取弹窗 checkbox label。

## 功能边界

- 预演模式不点击保存。
- 正式执行模式会点击保存，因此下一轮测试应先在可控科目上做单科目、当前公司范围验证。
- 保存成功的最终确认仍需系统回读，不应只依赖页面提示。
- 公司清单读取会打开并关闭选择弹窗，不点击 `确定`；面板勾选结果会在正式执行时重新应用到天源选择弹窗。
