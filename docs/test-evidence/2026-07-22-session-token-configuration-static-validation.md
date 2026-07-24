# MCP 临时 token 配置静态验证记录

日期：2026-07-22

## 验证对象

- `extension/src/sidepanel/index.html`
- `extension/src/sidepanel/sidepanel.js`
- `extension/src/sidepanel/styles.css`
- `native-helper/native_host.js`

## 验证结果

- 新增“配置 MCP”按钮和 token 输入弹窗。
- token 在侧边栏内存变量中临时保存，不落盘。
- Native Messaging 消息携带本次 token，Native Host 仅在进程内存中使用。
- 执行 `native-helper/install_native_host.sh` 后，本机 Native Host 副本已更新。
- `native-helper/native_host.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 扫描项目文件、Chrome Native Host 注册文件和本机 Native Host 安装目录，未发现完整 MCP token 落盘。

## 后续验证

- 重新加载扩展后，点击“配置 MCP”，输入真实 token，确认连接。
- 预期连接状态变为 Helper 已启动、MCP 已连接、CLI `0.1.0`。
