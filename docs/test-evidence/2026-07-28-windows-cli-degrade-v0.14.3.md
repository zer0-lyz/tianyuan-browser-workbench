# Windows CLI 独立降级 v0.14.3 测试证据

## 问题

- Windows 安装包完成 `1/7 校验核心文件`。
- `2/7 安装或检查天源 CLI` 显示检测到已有 CLI，随后报“天源 CLI 无法运行”并终止。
- 测试环境实际已配置天源 CLI，本轮目标是保证 CLI 独立异常不阻断其他工作台组件更新。

## 根因

- `Find-Tycpv` 只检查候选文件存在且后缀为 `.exe` 或 `.cmd`。
- 第一个存在候选可能是失效包装器、旧注册表路径或当前用户不可运行的 CLI。
- 主流程直接执行该候选，失败后抛出致命错误，扩展、Native Helper、Connector 和打印组件均未进入安装阶段。

## 修复

- 新增 `Get-TycpvVersionInfo`，逐个执行 `--version`，只返回真正可运行的候选。
- `.cmd` 候选通过受控 `cmd.exe /d /s /c` 运行。
- 无可运行候选时先尝试包内 CLI 安装器修复。
- 可运行候选的绝对路径写入本机 `runtime-config.json`，供 Native Helper 稳定复用。
- 包内修复仍失败时不再终止整包安装，不设置无效 `TYCPV_BIN`。
- 安装报告新增 CLI 状态和修复提示；其余组件完成后仍返回安装成功。

## 验证

- `tests/windows-installer-cli-degrade.test.cjs` 覆盖 CLI 候选运行验证、硬失败移除、环境变量清理、报告状态和完成提示。
- 根目录 `14` 个测试文件全部通过，覆盖 Windows 编码、Native Helper 启动、更新器、Connector、打印模块和 CLI 独立降级。
- 反馈服务 `7` 项测试全部通过。
- Windows 和 macOS ZIP 均通过 SHA-256 与压缩完整性检查，包内 `source_dirty=false`。
- Windows 包内 `install.cmd` / `uninstall.cmd` 为 ASCII + CRLF，`install.ps1` / `uninstall.ps1` 为 UTF-8 BOM。
- 匿名在线更新检查确认 `0.14.2 / 2026072803` 可发现 `0.14.3 / 2026072804`，当前 `0.14.3` 不重复提示。
- 真实 Windows x64 仍需用户运行新版 `install.cmd` 完成实机回归。

## 发布

- 源码提交：`a8c458d0755b7eb59f9f750c125ad4f32afb7e49`。
- 源码标签：`v0.14.3`。
- Windows SHA-256：`a304c21a92d161df1cad7364b637bdb388d3a46110f442d582cf4efe87681f56`。
- macOS SHA-256：`8bd2b782921820fbd0416b59636e79b8bcb5f0ddde985b589bd8a5c042350b74`。
- 运行指纹：`b09882582a15d2ef1b9582b2cb4ea8e4906773627d8066a7b6318625f8729bd9`。
- 正式 Release：`https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/tag/v0.14.3`。
- 5 个资产全部为 `uploaded`。

## 安全

- 修复未读取、保存或输出 MCP token、Cookie、Authorization、密码或验证码。
- 未执行天源线上上传、保存、清理或退出编辑。
