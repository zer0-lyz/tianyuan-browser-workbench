# Windows 更新解压修复 v0.14.20 测试证据

## 变更

- Windows 更新测试和正式更新使用短随机暂存目录。
- 解压前使用 `System.IO.Compression.ZipFile` 读取条目并检查路径穿越和目标路径长度。
- PowerShell stdout、stderr、退出码和阶段被捕获并脱敏；状态文件使用无 BOM UTF-8 原子替换。
- 更新 runner 在成功或失败后清理已交接的暂存目录，Node 前置失败时清理未交接目录。

## 自动化结果

- `node --test tests/*.cjs tests/*.mjs`：23 项通过，0 项失败。
- 新增 `tests/windows-update-extract.test.cjs`：短暂存目录、`UPDATE_PATH_TOO_LONG`、`UPDATE_ZIP_PATH_TRAVERSAL`、stderr 捕获和 `EncodedCommand` 脱敏通过。
- `tests/update-installer.test.cjs`：普通下载、SHA-256、测试模式不安装、清理、包结构和 Windows 入口通过。
- `tests/windows-update-runner.test.cjs`：父进程等待、失败回写、无 BOM UTF-8 写入和暂存清理脚本生成通过。
- `git diff --check`、Node 语法检查通过。

## 构建产物

- 版本：`0.14.20`；构建号：`2026080208`。
- 源码提交：`2a725e2707a70c2b3473a7f13c9936c534dd6aee`；运行指纹：`b5f28cb293a3cd09fced0d9df122ad529b1c9fa7391617abd3e8f1d2be0f3a9f`；`source_dirty=false`。
- 完整包：`/Users/zer0y/.tianyuan-workbench/releases/tianyuan-workbench-v0.14.20-windows-x64-20260802.zip`。
- 完整包 SHA-256：`3d18b3c756675be37e58a452411d48041c188859b005ac4db91ffb7799faef80`。
- Lite 包：`/Users/zer0y/.tianyuan-workbench/releases/tianyuan-workbench-v0.14.20-windows-x64-lite-20260802.zip`。
- Lite 包 SHA-256：`bd12d75fe6201f6e49b4cc68bc5501e7a820c7dec5ca9c72dab7b202061e55b7`。

## 边界

当前没有 Windows 实机和 PowerShell 5.1 环境，尚未宣称真实安装升级完成。发布后需在 Windows 10/11 上从 `0.14.18` 或 `0.14.19` 执行更新，重点验证 Connector/Native Host 占用、PowerShell 解压、状态 JSON 无 BOM、更新后服务恢复和临时目录清理。
