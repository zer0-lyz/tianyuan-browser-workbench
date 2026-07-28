# Windows 更新器自举修复 v0.14.7 测试证据

## 用户现象

- Windows 当前版本 `0.14.2`。
- 可以发现新版本、显示 Windows x64 资产并完成更新检查。
- 点击“更新全部组件”后显示：`安装包中缺少安装程序，已停止安装`。
- macOS 同一功能正常。

## 根因

- `0.13.1` 为避免 Windows 中文文件名乱码，将入口改为 `install.ps1` / `install.cmd`。
- Windows 更新器仍硬编码搜索、校验和启动 `安装.ps1`。
- 现有测试只覆盖 macOS `安装.command`，没有覆盖 Windows 安装器名称。

## 修复

- Windows 新更新器候选顺序为 `install.ps1`、`安装.ps1`。
- 包根目录发现、完整性校验和实际启动共享同一候选规则。
- 新发布包以 `install.ps1` 为正式脚本。
- 同时生成 UTF-8 BOM 的 `安装.ps1` 兼容别名，供已安装旧更新器完成一次自举升级。
- `install.cmd` 和 `uninstall.cmd` 继续保持 ASCII + CRLF，不恢复中文 CMD 入口。

## 自动验证

- Windows 模拟包使用 ASCII 顶层目录和 `install.ps1`，更新器成功定位并传给启动器。
- 历史模拟包仅包含 `安装.ps1`，更新模块完整性测试通过。
- 兼容别名确认带 UTF-8 BOM；除该受控兼容文件外，其余 Windows 顶层文件名保持 ASCII。
- 根目录 `16` 个测试文件和反馈服务 `7` 项测试全部通过。
- 静态门禁确认 Windows 更新器不存在将 `安装.ps1` 作为唯一入口的旧逻辑。

## 安全

- 更新仍要求 GitHub Release 资产 SHA-256 校验通过。
- 未读取、保存或输出 MCP token、Cookie、Authorization、密码或验证码。
- 未执行任何天源线上写入。
