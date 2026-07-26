# `0.10.0` 跨平台适配层验证记录

日期：2026-07-26

## 变更范围

- 新增 `native-helper/platform/`。
- `native_host.js` 改为调用统一平台接口。
- `connector_bridge.js` 改为调用统一凭据接口和运行目录。
- 本机安装器和 macOS Native Host 安装脚本增加统一自检。
- Windows 构建包增加外置平台模块。
- 构建日期固定使用 `Asia/Shanghai`。
- 构建缓存和安装包输出迁移到 `~/.tianyuan-workbench/`，OneDrive 只保留源码和说明。

## 自动测试

- JavaScript 语法检查通过。
- `tests/platform-adapters.test.cjs` 通过。
- `tests/static-extension-contract.test.cjs` 通过。
- `tests/agent-binding-bridge.test.cjs` 通过。
- `tests/update-checker.test.cjs` 通过。
- `git diff --check` 通过。

## macOS 本机验证

- 平台：`darwin/arm64`。
- 平台适配器：`macos`。
- 文件选择：`osascript-standard-additions`。
- 凭据存储：`macos-keychain`。
- 进程控制：`lsof-sigterm`。
- AppleScript、钥匙串和 `lsof` 检查通过。
- Python、两个打印脚本和 `tycpv 0.1.0` 检查通过。
- 本机运行副本安装到 `~/.tianyuan-workbench/`。
- Connector 已用新运行副本重新启动。

## 测试包

开发版本：`0.10.0`

构建编号：`2026072602`

初次测试包已验证：

- Windows Native Host 为 PE32+ x86-64。
- Windows 和 macOS 包均包含五个 `platform/*.js` 文件。
- 两个 ZIP 外层校验及包内 `SHA256SUMS` 通过。
- macOS 包内 Native Host 自检通过。
- 未发现 `.DS_Store`、`._*` 或 `__MACOSX`。

最终包必须在源码提交后重新构建，确保 `VERSION.txt` 的 `git_commit` 与实际源码提交一致。本记录中的最终 SHA-256 和运行指纹在重新构建后补充。

## 未验证边界

- 当前构建机不是 Windows。
- Windows PowerShell/WinForms、DPAPI、注册表、Native Messaging 和 CLI 授权仍需 Windows 10/11 x64 实机验证。
- 未发布 GitHub Release。
