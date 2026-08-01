# Windows 安装器反馈修复验证 v0.14.15

## 来源

- 实测反馈包：`tianyuan-workbench-v0.14.14-windows-x64-20260729.zip`
- Windows 11 x64；Chrome 和 Edge 均已安装。
- 反馈重点：CLI `--version` 探测卡住、递归搜索误执行第三方程序、Agent 被 `pause`/GUI 阻塞、缺少 JSON 安装报告、包标记 `source_dirty=true`。

## 修复

- Windows 安装器 CLI 候选只接受已知天源安装目录中的严格文件名 `tycpv.exe` 或 `tycpv.cmd`。
- 删除 CLI 的 Program Files 递归搜索和模糊扩展名执行逻辑，注册表只读取 DisplayName 以 `tycpv` 开头的安装项。
- CLI 探测改用隐藏窗口、只读 `--help`、最长 5 秒等待；超时后使用 `taskkill /PID /T /F` 终止进程树，继续安装其他工作台组件。
- Windows Native Host 健康检查同步使用 `--help` 探测和 5 秒超时；版本优先从 CLI 已知目录的 `app/package.json` 或 `package.json` 读取。
- 新增 `install-agent.cmd`，`install.cmd /Agent` 也可进入 Agent 模式；Agent 模式无 `pause`、无 Explorer/Chrome/Edge 自动启动、返回稳定退出码。
- 新增 `%LOCALAPPDATA%\TianyuanWorkbench\安装检查结果.json`，区分安装状态、组件状态、Connector 健康、warnings、manualActions 和安全字段；原文本报告保留。
- Native Host 在浏览器 stdin 关闭时主动退出，避免旧进程阻塞后续更新。

## 验证

- `node tests/windows-installer-safety.test.cjs`
- `node tests/windows-installer-cli-degrade.test.cjs`
- `node tests/windows-agent-install-prompt.test.cjs`
- `node tests/windows-package-encoding.test.cjs`
- `node tests/windows-release-zip.test.cjs`
- `node tests/windows-runtime-launch.test.cjs`
- `node tests/windows-lite-release.test.cjs`
- `node tests/static-extension-contract.test.cjs`
- Native Host、平台适配、Agent Bridge、本机运行复制、更新模块和打印模块回归测试均通过。
- `node --check`、`git diff --check` 通过。

## 输出

- `/Users/zer0y/Downloads/tianyuan-workbench-v0.14.15-windows-x64-20260802.zip`
- `/Users/zer0y/Downloads/tianyuan-workbench-v0.14.15-windows-x64-20260802.zip.sha256`
- SHA-256：`b09ad643e0f794a3084a92667589302cfad9f0a084be685ddb43fdf4a963f0fd`
- 构建号：`2026080201`
- 运行指纹：`29a69ecb5aa57dd4f7a9780f7915380bef5baa5781ba3d677b34a438ab6ba2d0`

## 边界

- tycpv CLI 是外部二进制，当前源码仓库没有其入口源码，无法直接修改 CLI 的 `--version` 实现；本版本在工作台安装器和 Native Host 侧绕开该探测并提供超时保护。
- 仍需在真实 Windows x64 机器验证：Agent 无交互安装、重复安装、已有/缺失 CLI、卡住 CLI、JSON 报告、Native Messaging 和浏览器手工加载扩展。
- MCP token、账号授权、验证码和浏览器“加载已解压扩展”继续是人工步骤。
