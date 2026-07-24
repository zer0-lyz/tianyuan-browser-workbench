# 批量上传确认失败诊断与修复

日期：2026-07-24

## 现象

银行存款 Sheet 批量上传 5 个文件时，前 4 项完成并统一保存，第 5 项停止：

- 文件：`3.1.4美元招行2025年12月.pdf`
- 行号：第 3 行
- 分类：`网银截图`
- 原错误：`UPLOAD_OR_CLASSIFY_NOT_CONFIRMED`

## 原因边界

该错误表示上传弹窗点击“保存”后，插件未在证据窗口内同时确认：

- `/attach/upload` HTTP 和业务成功；
- `/cell_file/classify_upload` HTTP 和业务成功。

截图本身不能区分接口业务失败与响应超时；Native Host 日志也只记录进程启动，不包含页面接口响应。

## 修复

- 上传与分类证据等待由 8 秒延长到 15 秒。
- 网络证据增加业务 `code` 和 `msg/message` 摘要。
- 失败结果增加 `uploadConfirmation.attach` 和 `uploadConfirmation.classify`。
- 面板失败项直接显示缺失或失败的接口、HTTP 状态、业务 code 和消息。
- 单项成功后清空目标文件输入，并等待上传弹窗稳定关闭后再开始下一项。
- 保留原有门禁：附件上传和分类批次未同时确认时，不执行统一底稿保存。

## 验证

- `node --check extension/src/injected/page_adapter.js`
- `node --check extension/src/sidepanel/sidepanel.js`
- `node --check extension/src/content/content.js`
- `node --check native-helper/native_host.js`
- `node --check native-helper/connector_bridge.js`
- `node tests/agent-binding-bridge.test.cjs`
- `git diff --check`

上述检查通过。真实天源接口响应仍需重新加载扩展后，用“继续未完成项”复测第 5 个文件确认。
