# Windows x64 稳定功能包 r4 验证

时间：2026-07-24

## 成品

- 文件：`天源浏览器工作台-v0.8.3-Windows-x64-测试版-r4-20260724.zip`
- SHA-256：`8c697f907a57ea0f1f90ae3c1dea522fc62e33a6c4a6eccd6f6b6bec47dd11f1`
- 源码提交：`75c40721a0bc0091ea5e9ca3867a02c34d01b5bb`
- 扩展版本：`0.8.3`
- 发行修订：`r4`

## 运行契约

- 扩展和 Native Host 的 `runtime-compat.json` 均为版本 2。
- 两处 `runtimeBuildId` 完全一致：
  `7e2e3f8ba68207d5f5936f814dfb2a1f546a9de338000b4a36374ed4254771d9`
- Connector 协议：`connector-agent-binding-v3`
- 页面适配器：`2026-07-24-page-tree-mirror-v29-replaceable-listeners`

## 自动验证

- ZIP 压缩数据完整。
- 包内 271 个文件全部通过 `SHA256SUMS`。
- 核心扩展、Native Host 和 Connector 源码与稳定源码逐文件一致。
- Native Host：Windows PE32+ x86-64 console executable。
- 便携 Python：Windows PE32+ x86-64 console executable。
- CLI 安装器来源和 SHA-256 与既有核验文件一致。
- 包含八个功能模块和批量清理附件页面。
- 未发现实际 MCP token、Authorization、Cookie、密码或验证码。
- 未包含运行日志、绑定记录、Agent 凭据配置或其他运行态文件。
- 未包含 `.DS_Store`、AppleDouble 或 `__MACOSX`。

## Windows 实机边界

当前构建机不是 Windows，以下事项仍需在真实 Windows 10/11 x64 + Chrome 或 Edge 验证：

- PowerShell 安装脚本；
- 当前用户 Native Messaging 注册表；
- Native Host 实际拉起；
- CLI 安装与浏览器授权；
- MCP 用户输入配置；
- 八个功能模块的只读和最小范围测试。
