# `0.10.0` 跨平台适配层验证记录

日期：2026-07-26

## 变更范围

- 新增 `native-helper/platform/`。
- `native_host.js` 改为调用统一平台接口。
- `connector_bridge.js` 改为调用统一凭据接口和运行目录。
- 本机安装器和 macOS Native Host 安装脚本增加统一自检。
- Windows、macOS 和本机安装器在自检后自动启动或替换 Connector。
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
- 安装器自动启动 Connector，PID `79593`；等待后健康回读仍在线。

## 测试包

开发版本：`0.10.0`

构建编号：`2026072602`

最终测试包已验证：

- Windows Native Host 为 PE32+ x86-64。
- Windows 和 macOS 包均包含五个 `platform/*.js` 文件。
- 两个 ZIP 外层校验及包内 `SHA256SUMS` 通过。
- macOS 包内 Native Host 自检通过。
- 未发现 `.DS_Store`、`._*` 或 `__MACOSX`。

源码提交：

`4f1c456239d44223e2fc173e4a79c71af8bfdcce`

运行指纹：

`d508d40fe7d7fba7c0ff7ec50d94c1ce81a709eababfa8b04d7d0c251cffa646`

Windows：

- 路径：`~/.tianyuan-workbench/releases/天源浏览器工作台-v0.10.0-Windows-x64-测试版-20260726.zip`
- 大小：`76556955` 字节
- SHA-256：`d3379a9941e06483776d5858fba95204bf7f0e199157f5a358559e66fe506354`

macOS：

- 路径：`~/.tianyuan-workbench/releases/天源浏览器工作台-v0.10.0-macOS-Apple芯片-20260726.zip`
- 大小：`127371319` 字节
- SHA-256：`247ee1a9e88ac62fdb1ac6b86d1cf36ec5675d51241322f300c24e107d521c3e`

两个包内 `git_commit`、`build_date=20260726`、版本、构建编号和运行指纹一致。

## 未验证边界

- 当前构建机不是 Windows。
- Windows PowerShell/WinForms、DPAPI、注册表、Native Messaging 和 CLI 授权仍需 Windows 10/11 x64 实机验证。
- 未发布 GitHub Release。
