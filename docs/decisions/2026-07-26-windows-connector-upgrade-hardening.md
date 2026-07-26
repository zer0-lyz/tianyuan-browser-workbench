# Windows Connector 升级与进程启动加固

日期：2026-07-26

## 背景

Windows 实机从旧版升级时出现：

- `CONNECTOR_VERSION_MISMATCH`
- `CONNECTOR_START_TIMEOUT`

用户提供的报告封面日期为 `2026-07-27`，晚于当前日期 `2026-07-26`。本项目将其按 Windows 测试机时钟提前一天记录，不作为发布时点。

原始报告已归档：

`docs/test-evidence/2026-07-26-Windows-Connector修复报告-用户测试.docx`

## 根因复核

1. 旧扩展和新 Native Helper 被分开复制，升级中断后会形成半安装状态。
2. Node 脚本模式启动 Connector 时，Windows 分支没有传入 `native_host.js` 路径。
3. Windows CLI 可能通过 `.cmd` 或 `.bat` 包装器提供，Node 不能像执行 EXE 一样直接执行。
4. 旧 `runtime-config.json` 使用 `cli`、`python` 键，新版使用 `tycpvBin`、`pythonBin`。
5. 运行配置默认只按 `process.execPath` 查找，在 Node 脚本模式下会错误指向 `node.exe` 目录。

## 决策

### 双运行模式

Native Host 自动识别两种运行方式：

- 独立 Windows SEA EXE：子进程参数只传 `--connector-bridge`。
- Node 脚本：子进程参数传 `native_host.js --connector-bridge`。

不得把脚本路径无条件加入独立 EXE 参数。

### CLI 包装器

- `.exe` 继续使用直接参数数组执行。
- `.cmd`、`.bat` 通过固定 PowerShell 包装器执行。
- 命令和参数使用 Base64 JSON 环境变量传递。
- 不启用 `shell:true`，避免输出目录或其他参数中的 shell 元字符被解释。

### 配置兼容

- 同时读取新版 `tycpvBin`、`pythonBin`、`printSkillsDir`。
- 兼容旧版 `cli`、`python`、`printSkills`。
- 优先使用 `TIANYUAN_RUNTIME_CONFIG_PATH`。
- 未设置环境变量时，Node 脚本按脚本目录查找，独立 EXE 按 EXE 目录查找。

### 原子升级

Windows 安装器必须：

1. 读取 40415 健康接口，确认服务确实是天源 Connector。
2. 停止旧 Connector。
3. 将扩展和 Native Helper 复制到同卷暂存目录。
4. 保留 Agent 来源、凭据引用、绑定和本机日志。
5. 整体切换正式目录。
6. 校验扩展版本、Native Helper 版本和 `runtimeBuildId`。
7. 自检并启动新 Connector。
8. 任一步失败时恢复旧目录，并尝试重新启动旧 Connector。

不得先删除正式目录后逐文件复制。

## 版本

- 产品版本：`0.12.1`
- 构建编号：`2026072605`
- 发布通道：`stable`
