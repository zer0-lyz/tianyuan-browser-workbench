# Windows ZIP 文件名编码修复 v0.14.8 测试证据

## 用户现象

- Windows 当前版本为 `0.14.2`。
- 可以发现 `0.14.7`，并正确显示 Windows x64 资产、大小和 SHA-256。
- 点击“更新全部组件”后仍显示：`安装包中缺少安装程序，已停止安装`。

## 根因

- `0.14.7` 包源码阶段确实生成了 `安装.ps1` 兼容入口。
- 正式 ZIP 的该条目未设置 ZIP UTF-8 文件名标志。
- 回读得到的文件名是 `σ«ëΦúà.ps1`，不是旧更新器查找的 `安装.ps1`。
- Windows PowerShell `Expand-Archive` 解压后因此无法提供精确兼容路径。

## 修复

- Windows 发布包改用 `scripts/create-release-zip.py` 和 Python `zipfile`。
- 中文兼容入口必须设置 ZIP general-purpose bit `0x800`。
- 新版更新器仍优先使用 ASCII `install.ps1`，中文入口仅用于旧版更新器自举。

## 自动验证

- 启动器文件编码测试通过。
- 更新器安装程序候选测试通过。
- ZIP 编码测试确认 `安装.ps1` 名称精确、UTF-8 标志存在且解压后路径存在。
- 全量测试和正式包验证结果将在发布后补充。

## 安全

- 未读取、保存或输出 MCP token、Cookie、Authorization、密码或验证码。
- 未执行任何天源线上写入。
