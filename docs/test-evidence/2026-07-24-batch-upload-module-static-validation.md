# 批量上传文件模块静态验证

日期：2026-07-24

## 范围

- 首页增加“批量上传文件”入口。
- 三步界面包含当前科目、Sheet、目标列校验、文件夹选择、文件与行号映射、执行确认、进度和逐项结果。
- 页面适配器增加只读 `inspect_batch_upload_target` 动作，按当前 Sheet 检查列是否为可上传单元格。
- 正式执行复用既有 `upload_audit_attachment` 固定脚本，不开放任意 JavaScript。

## 验证

- `node --check extension/src/sidepanel/sidepanel.js`
- `node --check extension/src/injected/page_adapter.js`
- `node --check native-helper/native_host.js`
- `git diff --check`
- DOM ID 静态检查：批量上传模块引用完整。
- Playwright 420px 侧栏静态渲染：目标对象步骤无横向溢出，无模块重叠。
- 已执行 `node scripts/install-local-runtime.mjs`，本机运行副本同步到 `~/.tianyuan-workbench/`。
- 目录崩溃保护验证：扩展版本 `0.7.6`，最多处理 200 个文件，支持格式过滤和 20 MB 单文件上限。

## 未执行

- 未在真实天源页面执行上传、保存、清理或退出编辑。
- 尚未实现文件名到行号的自动识别；当前仅支持手工填写行号。
