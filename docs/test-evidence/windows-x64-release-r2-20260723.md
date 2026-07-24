# Windows x64 快速安装 r2 验证

验证时间：2026-07-23 16:30 CST

## 输出

- `dist/天源浏览器工作台-v0.3.0-Windows-x64-测试版-r2-20260723.zip`
- `dist/天源浏览器工作台-v0.3.0-Windows-x64-测试版-r2-20260723.zip.sha256`

## 安装分支

### 快速路径

- 复用已有 `tycpv.exe`；
- 复用 Python 3.9+；
- 复用 `openpyxl >= 3.1.5` 和 `et_xmlfile`；
- 只安装扩展、Native Host、打印脚本和注册表。

### 离线补齐路径

- 复用已有 CLI 和 Python；
- 从包内 `runtime/python-wheels/` 补齐 `openpyxl` 与 `et_xmlfile`；
- 不联网下载，不复制便携 Python。

### 完整回退路径

- 缺少 CLI 时使用包内 CLI 安装器；
- 缺少兼容 Python 或离线补齐失败时使用包内便携 Python。

## 已完成验证

- ZIP 完整性通过，无 `._`、`.DS_Store` 或 `__MACOSX`。
- 包内全量 `SHA256SUMS` 通过。
- 快速路径核心 17 个文件逐项校验通过。
- 离线 wheel 路径 2 个文件逐项校验通过。
- CLI 回退路径安装器校验通过。
- 便携 Python 回退路径 241 个文件逐项校验通过。
- Native Host 和便携 Python 为 Windows x86-64 PE。
- 包内存在 Windows CLI 安装器和两个离线 wheels。
- 安装脚本包含安装模式、耗时和实际依赖路径记录。
- 未发现内嵌 MCP token 模式。

## 待 Windows 实机验证

- 已有 CLI、Python、openpyxl 时是否显示纯快速安装；
- 缺少 openpyxl 时 `pip --user --no-index` 是否成功；
- 无兼容 Python 时便携 Python 回退；
- 三种路径的实际耗时；
- Chrome Native Messaging 和六个模块。
