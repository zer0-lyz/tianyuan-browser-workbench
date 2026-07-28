# Windows 本机组件同步修复 v0.14.4 测试证据

## 实机输入

- `0.14.3` Windows 安装完成核心文件校验。
- 天源 CLI `0.1.0` 可运行。
- 未发现系统 Python，工作台便携 Python `3.14.6` 与 `openpyxl 3.1.5` 可运行。
- 第 `5/7` 步失败，报告仅显示 `install-local-runtime.mjs:50`。

## 定位

- 第 50 行是 `mustExist` 门禁，仅在源目录或复制后必需文件不存在时抛错。
- 正式 Windows ZIP 的 32 个必需源文件全部存在，压缩包和 SHA-256 均正常。
- 失败属于 Windows 本机目标目录复制后的文件存在性校验，不是 CLI 或 Python 配置问题。
- PowerShell 的原生命令 stderr 与 `ErrorActionPreference=Stop` 组合截断了 Node 堆栈，只留下第一行，掩盖真实缺失路径。

## 修复

- 本机目录复制最多重试三次。
- 首次目录复制后若个别必需文件缺失，从已校验源目录逐个补拷。
- 三次仍失败时返回 `COPY_DIRECTORY_FAILED` 和具体原因。
- Node 失败只向 stdout 输出一行 JSON，PowerShell 解析其中 `reason` 写入安装报告。

## 验证

- 根目录 `15` 个测试文件全部通过。
- 新增动态测试构造缺少扩展清单的临时安装源，确认退出码为 `1`、stderr 为空、stdout 为可解析 JSON，并包含真实 `reason`。
- 反馈服务 `7` 项测试全部通过。
- Windows 和 macOS ZIP 均通过 SHA-256、压缩完整性和 `source_dirty=false` 检查。
- Windows 启动器编码检查通过；正式包内已包含复制重试、补拷和结构化错误回传。
- 在线检查确认 `0.14.3` 可发现 `0.14.4`；GitHub Release 资产摘要可用于 SHA-256 校验。
- 真实 Windows x64 仍需运行新版 `install.cmd` 验收目标目录复制自愈。

## 发布

- 源码提交：`f6932ca798de50795783b52356f986850fa2d55f`。
- 源码标签：`v0.14.4`。
- Windows SHA-256：`e8beccc4e9b50f88d22a9b71f2a9ed598b88acd7fb6d659c5732c388cd811842`。
- macOS SHA-256：`b215f623ac798f6de257f3476e28366deeb88b570f98180f4e6d2ba219fa1848`。
- 运行指纹：`b3f42ab8fbd6438f06d82ce9038fbab695729d2d0f5aa206520e4dd47489475f`。
- 正式 Release：`https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/tag/v0.14.4`。
- 5 个资产全部为 `uploaded`。

## 安全

- 未读取、保存或输出 MCP token、Cookie、Authorization、密码或验证码。
- 未执行任何天源线上写入。
