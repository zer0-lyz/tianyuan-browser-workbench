# Windows staging 重命名回退 v0.14.5 测试证据

## 实机错误

`0.14.4` 安装报告返回：

```text
ENOENT: no such file or directory, rename
...\skills.staging-* -> ...\skills
```

CLI `0.1.0`、便携 Python `3.14.6`、`openpyxl 3.1.5` 和前四步均已通过。

## 根因边界

- 正式包源文件完整。
- staging 复制阶段未报错。
- 失败发生在旧目录备份后，将 staging 原子重命名为正式目录的瞬间。
- Windows 本机环境可能使 staging 临时目录不可见或阻止原子重命名。

## 修复

- `validateCopiedDirectory` 首先验证 staging 目录本身存在。
- 原子重命名失败时，从已校验安装源直接覆盖正式目录。
- 直接复制也最多尝试三次，并执行同一回读门禁。
- 成功后删除旧备份；失败时删除半成品并恢复旧备份。

## 自动验证

- 动态注入 staging 重命名 `ENOENT`，确认直接复制回退成功。
- 动态注入首次 staging 复制不产生目录，确认存在性门禁触发重试并成功。
- 安装失败结构化 JSON 回传测试继续通过。
- 根目录 `16` 个测试文件和反馈服务 `7` 项测试全部通过。
- Windows 和 macOS ZIP 均通过 SHA-256、压缩完整性和 `source_dirty=false` 检查。
- 正式 Windows 包回读确认包含 staging 存在性门禁、直接复制回退和组合错误恢复。
- 在线检查确认 `0.14.4` 可发现 `0.14.5`。

## 发布

- 源码提交：`bdb76ca0332cb5a139fb8506ea83a83dc286568e`。
- 源码标签：`v0.14.5`。
- Windows SHA-256：`c2071d3b094dceb4c843589eaa13231106198e5d67146bb75a2bf845d9b4d39c`。
- macOS SHA-256：`13b7c87e718ffccc7d71e6c7290028644e4d6cf777c02c09c8493a456b99f714`。
- 运行指纹：`1ee7dcd1e634fa1fa165e8d140ac3aaaa8acefcc0750fde86f689bc735620d04`。
- 正式 Release：`https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/tag/v0.14.5`。
- 5 个资产全部为 `uploaded`。

## 安全

- 未读取、保存或输出 MCP token、Cookie、Authorization、密码或验证码。
- 未执行任何天源线上写入。
