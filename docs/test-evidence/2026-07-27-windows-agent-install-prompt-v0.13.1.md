# Windows Agent 一键安装提示词包验证

日期：2026-07-27 CST

## 范围

- 工作台本地测试版本：`0.13.1`
- 构建编号：`2026072704`
- Connector 版本：`0.4.2`
- 功能源码提交：`73f91a9ec23d66e40581a629f72f6022370b0d1b`
- `source_dirty=false`
- 运行指纹：`2c1b0e89b01acbfe72a6ec2927b5c4c4a93bc56b416f82071dd67f4260ed1a32`
- 源码与测试证据已推送源码仓库 `main`
- 未发布 `v0.13.1` GitHub Release

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
  `733612dc1737a9ba85bd1005d05fa4c3b45953f446fb5712764a68d25d46e243`
- ZIP 内 `START_WITH_AGENT.txt` 已确认包含公开更新源、SHA-256 校验和只读操作门禁。

## 边界

- 当前仅完成 macOS 静态打包、ZIP 元数据和内容验证。
- 仍需真实 Windows x64 环境执行 `install.cmd` 完成首次实机回归。
