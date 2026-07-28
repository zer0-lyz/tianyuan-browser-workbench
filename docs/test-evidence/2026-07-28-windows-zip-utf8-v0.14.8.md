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
- 根目录 `17` 个测试文件和反馈服务 `7` 项测试全部通过。
- 正式 Windows ZIP 完整性检查通过，包内 `source_dirty=false`。
- 正式 ZIP 中 `安装.ps1` 的 `flag_bits` 为 `0x800`，与 `install.ps1` 内容完全一致。
- 正式 ZIP 解压后仅找到一个精确路径 `安装.ps1`，旧版更新器的固定路径可以命中。
- 在线模拟 Windows `0.14.2 / 2026072803` 检查更新，返回 `latestVersion=0.14.8`、`updateAvailable=true`、`manifestFound=true`。

## 发布

- 源码提交：`ebbc8698e233de53d6bd75ee320e7b2dc8597877`。
- 源码标签：`v0.14.8`。
- Windows SHA-256：`f5ce81f32540f435c3bdcd5636fcbc366521112a516cabcdd9c83efdc061c6f0`。
- macOS SHA-256：`7f639639b94dbb84977f62a7406ec34c0a5f36f1e75124c44038af6ad012c4ab`。
- 运行指纹：`feaa78e699b5f2f69362c2e077be6b747093a9e206f0f06bfc57740dc8edb196`。
- 正式 Release：`https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/tag/v0.14.8`。
- 5 个资产全部为 `uploaded`。

## 安全

- 未读取、保存或输出 MCP token、Cookie、Authorization、密码或验证码。
- 未执行任何天源线上写入。
