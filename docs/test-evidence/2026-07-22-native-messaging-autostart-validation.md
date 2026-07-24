# Native Messaging 自动启动验证记录

日期：2026-07-22

## 验证对象

- `native-helper/native_host.js`
- `native-helper/install_native_host.sh`
- `extension/manifest.json`
- `extension/src/sidepanel/sidepanel.js`

## 验证结果

- Native Host 已注册到 Chrome：
  - `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tianyuan.workbench.helper.json`
- 注册文件允许扩展 ID：
  - `lkflndcnklpeaejohaacoaolnmhgigoc`
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 通过 Native Messaging stdio 协议直接发送 `health` 消息，Native Host 能返回状态。
- 测试时未设置 MCP token，返回 `VALUATION_MCP_TOKEN_NOT_SET`，符合安全预期。
- CLI 状态检测到 `tycpv` 版本 `0.1.0`。
- 扫描项目文件和 Chrome Native Host 注册文件，未发现完整 MCP token 落盘。
- 追加修正：面板新增当前扩展 ID 和连接错误信息显示；Chrome Native Host 注册文件临时允许旧扩展 ID `fdbllnmaaklkcmoacoapbibiggnndkfpa` 和新固定扩展 ID `lkflndcnklpeaejohaacoaolnmhgigoc`，避免 Chrome 仍打开旧面板时被 Native Messaging 拒绝。
- 追加修正：将 Chrome Native Host 注册路径从 `native_host.js` 改为 `native_host_launcher.sh`。启动器使用绝对 Node 路径 `/usr/local/bin/node`，避免 Chrome Native Messaging 的精简环境找不到 `node` 导致 `Native host has exited.`。
- 使用近似 Chrome 的空环境模拟 stdio 调用，启动器可正常返回 `health` 状态。
- 追加修正：将 Native Host 安装目标从 OneDrive 项目目录迁移到本机隐藏目录 `~/.tianyuan-workbench/native-helper/`，Chrome 注册文件改为指向该目录下的 `native_host_launcher.sh`，避免云盘/中文路径/空格路径导致 Chrome 执行 host 后立即退出。
- 新启动器会写入非敏感日志：`~/.tianyuan-workbench/native-helper/native_host.log`。

## 后续验证

- 重新加载未打包扩展后，在插件面板点击“启动/检查”，验证 Chrome 能从扩展侧自动拉起 Native Host。
- 若需 MCP 已连接，仍需通过本机环境安全提供 `VALUATION_MCP_TOKEN`。
