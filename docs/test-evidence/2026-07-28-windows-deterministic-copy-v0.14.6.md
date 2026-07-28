# Windows 确定性目录复制 v0.14.6 测试证据

## 连续实机证据

- `0.14.4`：staging 复制未报错，最终重命名时 staging 不存在。
- `0.14.5`：增加 staging 存在性门禁后，三次复制均返回，但 staging 目录仍不存在。
- 错误固定发生在 `skills`，而 CLI `0.1.0`、Python `3.14.6`、`openpyxl 3.1.5` 和前置包校验均通过。

## 排除项

- `skills` 目录不存在软链接。
- Windows ZIP 包含两个打印技能、脚本、YAML 和 `SKILL.md` 的全部条目。
- ZIP SHA-256 与包内 `SHA256SUMS` 已通过。
- 运行目录位于 `%LOCALAPPDATA%\TianyuanWorkbench`，不在 OneDrive 或下载目录。

## 根因

该 Windows 环境中的 Node `fs.cpSync` 存在静默失效：函数没有抛错，但目标目录未创建。原有三次重试仍重复调用同一不可靠 API，因此无法生效。

## 重构

- 完全移除 `fs.cpSync`。
- 逐目录调用 `mkdirSync`。
- 逐文件调用 `copyFileSync`，每个文件立即比较源/目标大小。
- 复制完成后比较完整目录树清单，包括目录、相对路径和文件大小。
- staging 原子替换和直接复制回退继续保留。
- 单文件原子重命名失败时直接覆盖复制并校验。

## 验证

- 测试中将 `fs.cpSync` 替换为必定抛错的函数，所有目录复制仍成功。
- 扩展、Native Helper、skills 和 Connector 四棵实际源码目录分别回读 `33 / 14 / 12 / 15` 个条目一致。
- staging 重命名 `ENOENT`、单文件重命名 `EPERM` 和结构化失败回传测试通过。
- 根目录 `16` 个测试文件和反馈服务 `7` 项测试全部通过。
- 静态门禁确认安装脚本不存在任何 `fs.cpSync` 调用。

## 安全

- 未读取、保存或输出 MCP token、Cookie、Authorization、密码或验证码。
- 未执行任何天源线上写入。
