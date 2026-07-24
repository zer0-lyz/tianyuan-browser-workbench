# Windows x64 测试发行验证

验证时间：2026-07-23 15:55 CST

## 输出

- `dist/天源浏览器工作台-v0.3.0-Windows-x64-测试版-20260723.zip`
- `dist/天源浏览器工作台-v0.3.0-Windows-x64-测试版-20260723.zip.sha256`

## 包含内容

- Chrome 扩展 0.3.0；
- Windows x64 Native Host；
- Windows `tycpv 0.1.0` 安装程序；
- Python 3.14.6 Windows x64 便携运行时；
- `openpyxl 3.1.5`、`et_xmlfile 2.0.0`；
- 两个打印格式 Skill；
- 当前用户安装/卸载脚本；
- 中文使用说明；
- `交给Agent安装.md`。

## 已完成验证

- ZIP 压缩结构完整。
- ZIP 不包含 `._`、`.DS_Store` 或 `__MACOSX`。
- 解包后 266 个文件逐项通过 `SHA256SUMS`。
- `native_host.exe` 为 PE32+ x86-64 console executable。
- `python.exe` 为 PE32+ x86-64 console executable。
- `tycpv` 安装器产品名为 `tycpv`，版本为 `0.1.0`。
- Node.js 官方 ZIP SHA-256 与官方 `SHASUMS256.txt` 一致。
- Native Messaging 健康消息协议检查通过。
- Native Host 自检在当前 macOS 源码运行环境通过。
- Native Host、扩展和 Python 脚本语法检查通过。
- 固定扩展 ID 所需 manifest key 保留。
- 未发现内嵌 MCP token 模式。
- Windows 安装脚本未包含 macOS 文件选择或 Native Messaging 路径。

## 待 Windows 实机验证

- Windows Defender SmartScreen 提示处理；
- `安装.cmd` 与 PowerShell 7 步安装流程；
- `tycpv.exe` 实际安装位置和 `--version`；
- 当前用户 Native Messaging 注册表；
- Chrome 拉起 `native_host.exe`；
- PowerShell Windows Forms 文件与文件夹选择器；
- MCP 配置和 CLI 浏览器授权；
- 六个功能模块的最小范围测试。

## 安全边界

- 不在发行包中放入 MCP token、Cookie、Authorization、密码或验证码。
- 不要求关闭 Windows 安全软件。
- 不绕过天源编辑锁。
- 首次测试不使用正式文件覆盖模式。
