# Windows Connector 修复验证

日期：2026-07-26

## 输入证据

- 用户 Windows 实机报告：
  `2026-07-26-Windows-Connector修复报告-用户测试.docx`
- 报告内记录的错误：
  - `CONNECTOR_VERSION_MISMATCH`
  - `CONNECTOR_START_TIMEOUT`

## 已完成修复

- 新增 `native-helper/process_launcher.js`。
- 支持独立 SEA EXE 和 Node 脚本两种 Connector 自启动模式。
- 安全支持 `.cmd`、`.bat` CLI 包装器，不使用 `shell:true`。
- 兼容旧版和新版 `runtime-config.json` 键名。
- 修复 Node 脚本模式运行配置目录定位。
- Windows 安装器改为停旧 Connector、暂存、原子切换、契约校验和失败回滚。
- 升级时保留 `agent-sources.json`、`agent-credentials.json`、`connector-bindings.json` 和日志。
- 成功与失败安装报告增加版本、构建编号、运行指纹和关键文件存在状态。

## 自动验证

以下测试通过：

- `tests/windows-runtime-launch.test.cjs`
- `tests/platform-adapters.test.cjs`
- `tests/agent-binding-bridge.test.cjs`
- `tests/update-checker.test.cjs`
- `tests/module-architecture.test.mjs`
- `tests/updates-module.test.mjs`
- `tests/feedback-module.test.mjs`
- `tests/static-extension-contract.test.cjs`
- `feedback-service/test/feedback-service.test.js`
- JavaScript 和 Shell 语法检查
- `git diff --check`

Mac 本机 Node 脚本模式安装和 Connector 重启成功：

- 扩展版本：`0.12.1`
- Connector PID：`50206`
- 协议：`connector-agent-binding-v3`
- 运行指纹：`e54f3743a5865da20252d7a6c71db262bc07fca1f817203d0b6073852b69dfc6`

## Windows 正式包

- 文件：
  `tianyuan-workbench-v0.12.1-windows-x64.zip`
- 下载目录：
  `/Users/zer0y/Downloads/`
- SHA-256：
  `489aa4391858f221aade904358123614b41b81d5040740c6236a5159632ae600`
- 大小：约 73 MB
- Native Host：PE32+ x86-64
- 构建编号：`2026072605`
- 构建日期：`20260726`
- 包内提交：`c7d2705d2129e94460335ce14aea67cf426584b1`。
- `source_dirty=false`。
- `release_channel=stable`。
- 扩展和 Native Helper 的 `runtime-compat.json` 一致。
- ZIP 完整性检查通过。
- macOS 元数据条目数量为 0。

## 验证边界

- 当前构建机不是 Windows，无法执行 PowerShell、注册表、DPAPI、Chrome/Edge Native Messaging 实机验证。
- 需要 Windows 测试机直接运行新版 `安装.cmd`，不要再手工复制单个文件。
- 已按用户决定直接发布正式 Release；后续继续依据 Windows 用户反馈优化。
