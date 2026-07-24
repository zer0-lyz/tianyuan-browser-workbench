# 决策：用 Chrome Native Messaging 自动拉起本地 helper

日期：2026-07-22

## 背景

用户反馈手动打开终端、设置环境变量、启动 `native-helper/server.js` 过于繁琐，希望在插件面板中点击启动即可加载公司和科目清单。

## 决策

- 保留 `127.0.0.1:8765` HTTP helper 作为开发调试通道。
- 新增 Chrome Native Messaging Host 作为日常使用通道。
- 插件面板优先访问 HTTP helper；如果未启动，则自动通过 `chrome.runtime.sendNativeMessage` 拉起 Native Host。
- 面板按钮从“检查”改为“启动/检查”。
- 扩展加入固定 `key`，对应扩展 ID：`lkflndcnklpeaejohaacoaolnmhgigoc`。

## 文件

- Native Host：`native-helper/native_host.js`
- 注册脚本：`native-helper/install_native_host.sh`
- Chrome 注册文件：`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tianyuan.workbench.helper.json`

## 安全边界

- Native Host 注册文件不包含 MCP token。
- Native Host 从本机环境变量 `VALUATION_MCP_TOKEN` 读取 token。
- 插件不保存 Cookie、Authorization、密码、验证码或 token。
- 如果环境中没有 `VALUATION_MCP_TOKEN`，插件会显示 Helper 已启动、CLI 可用、MCP 未配置 token。
