# Windows tycpv CLI 识别修复验证

日期：2026-07-27 CST

## 输入证据

- 用户截图显示 Windows 安装停在 Step `2/7 安装或检查天源 CLI`。
- 错误信息：`安装失败：无法在管道中间运行文档：D:\tycpv\tycpv.ico`。
- Word 反馈文档说明当前 tycpv 安装目录为 Node.js CLI 结构，存在 `tycpv.cmd`，不一定存在 `tycpv.exe`。

## 修复范围

- 工作台版本：`0.13.2`
- 构建编号：`2026072706`
- Connector 版本：`0.4.2`
- 源码提交：`2d8bf7cfea2d8ecae5d3168317f883905becd3e2`
- 源码标签：`v0.13.2`
- 运行指纹：`bc67fa74717cfaff4930006e43cd1c878283f5922a22f4f8062377d5e9ff0b2a`

## 行为变更

- `Find-Tycpv` 不再把 `DisplayIcon` 的 `.ico` 作为 CLI 候选。
- CLI 候选只接受 `.exe` 和 `.cmd`。
- `tycpv.cmd` 加入 PATH、固定安装目录、注册表 `InstallLocation` 和递归搜索候选。
- Native Helper Windows 平台适配同步加入 `tycpv.cmd`。
- Connector 版本不一致文案引导运行最新 `install.cmd`，不再暗示单纯重启 Connector 能升级文件。

## 验证

- `tests/static-extension-contract.test.cjs`：通过。
- `tests/windows-runtime-launch.test.cjs`：通过。
- `tests/windows-package-encoding.test.cjs`：通过。
- `tests/windows-agent-install-prompt.test.cjs`：通过。
- `tests/update-installer.test.cjs`：通过。
- `tests/update-checker.test.cjs`：通过。
- Windows ZIP 内部条目数：`365`；非 ASCII 文件名数量：`0`。
- Windows ZIP SHA-256：
  `9a0ba31fe1bd85098b78ec5f1ec968a731ba25a40c5937255227a3473dbe5b43`
- 在线更新检查：`0.13.1` 返回 `updateAvailable=true`，`0.13.2` 返回 `updateAvailable=false`。

## 安全边界

- 本轮没有执行天源页面上传、保存、清理、退出编辑或其他线上写入。
- 未读取、保存或输出 MCP token、Cookie、Authorization、密码或验证码。
