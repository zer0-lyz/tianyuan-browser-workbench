# Windows Agent 一键安装提示词包验证

日期：2026-07-27 CST

## 范围

- 工作台本地测试版本：`0.13.1`
- 构建编号：`2026072705`
- Connector 版本：`0.4.2`
- 功能源码提交：`7aa2c7e2bb7d86fbd5feac2484ceb76b107588ed`
- `source_dirty=false`
- 运行指纹：`96c2cfe8cb07643469c476a39e5ebcb2cfabab987e0f2cfe4ec9eed8a2488eb4`
- 源码与标签已推送源码仓库
- 公开发行仓库 `v0.13.1` 已发布并标记为 Latest

## 包内入口

- `install.cmd`：安装入口。
- `uninstall.cmd`：卸载入口。
- `START_WITH_AGENT.txt`：UTF-8 BOM 纯文本，可直接复制给 Agent。
- `AGENT_INSTALL_PROMPT.md`：同内容 Markdown 备用文件。
- `INSTALL_README.md`：UTF-8 BOM 安装说明。
- ZIP 内部所有文件名均为 ASCII，避免 Windows 解压器显示乱码。

## 提示词要求

- 有完整解压包时直接执行安装。
- 无本地包时查询公开 Latest Release，下载 Windows x64 ZIP 并校验 SHA-256。
- 自动安装和检查 Helper、Connector、Native Host、扩展运行目录与只读 MCP 状态。
- MCP token、账号密码和验证码必须由用户本人输入。
- 不执行天源线上写入。

## 验证

- `tests/windows-agent-install-prompt.test.cjs`：通过。
- `tests/windows-package-encoding.test.cjs`：通过；确认 `START_WITH_AGENT.txt` 有 UTF-8 BOM。
- `tests/static-extension-contract.test.cjs`：通过。
- ZIP 完整性：通过。
- ZIP 内部条目数：`365`；非 ASCII 文件名数量：`0`。
- ZIP SHA-256：
  `4ff45d6b5a947bd5aff8235c042d221de7eda90c8b8a35649219dcdb28db5b3f`
- ZIP 内 `START_WITH_AGENT.txt` 已确认包含公开更新源、SHA-256 校验和只读操作门禁。
- 在线更新检查：`0.13.0` 返回 `updateAvailable=true`，`0.13.1` 返回 `updateAvailable=false`。

## 边界

- 当前仅完成 macOS 静态打包、ZIP 元数据和内容验证。
- 仍需真实 Windows x64 环境执行 `install.cmd` 完成首次实机回归。

## 后续故障

- Windows 用户在 `0.13.1` 安装时反馈：Step `2/7 安装或检查天源 CLI` 检测到已有 CLI 后失败，错误为“无法在管道中间运行文档：D:\tycpv\tycpv.ico”。
- 该问题已确认为安装器 `Find-Tycpv` 误把注册表 `DisplayIcon` 的 `.ico` 当作 CLI 候选，且旧逻辑只识别 `tycpv.exe`、不识别 Node 封装形式 `tycpv.cmd`。
- 修复进入后续 `0.13.2`。
