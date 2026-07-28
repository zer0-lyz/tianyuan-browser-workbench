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
- 真实 Windows x64 仍需运行新版 `install.cmd` 验收目标目录复制自愈。

## 安全

- 未读取、保存或输出 MCP token、Cookie、Authorization、密码或验证码。
- 未执行任何天源线上写入。
