# Windows Agent 一键安装提示词包验证

日期：2026-07-27 CST

## 范围

- 工作台本地测试版本：`0.13.1`
- 构建编号：`2026072704`
- Connector 版本：`0.4.2`
- 未发布 GitHub Release

## 包内入口

- `START_WITH_AGENT.txt`：UTF-8 BOM 纯文本，可直接复制给 Agent。
- `AGENT_INSTALL_PROMPT.md`：同内容 Markdown 备用文件。
- 两个文件名均为 ASCII，避免 ZIP 中文文件名跨平台显示差异。

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
- ZIP SHA-256：
  `bf3851549e774f9b4a7137f5dcb9d42d08a4122b79116c03869a9b781022fd88`
- ZIP 内 `START_WITH_AGENT.txt` 已确认包含公开更新源、SHA-256 校验和只读操作门禁。

## 边界

- 当前仅完成 macOS 静态打包、ZIP 元数据和内容验证。
- 仍需真实 Windows x64 环境执行 `install.cmd` 完成首次实机回归。
