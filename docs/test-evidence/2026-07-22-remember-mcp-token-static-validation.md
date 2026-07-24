# 记住 MCP token 静态验证记录

日期：2026-07-22

## 修正内容

- `extension/manifest.json` 新增 `storage` 权限。
- “配置 MCP”弹窗新增“记住本机”选项。
- 默认仍只在当前侧边栏内存中保存 token。
- 勾选“记住本机”后，token 保存到 Chrome 本地扩展存储。
- “清除”会同时清除当前内存 token 和 Chrome 本地扩展存储 token。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 扫描项目文件、Chrome Native Host 注册文件和本机 Native Host 安装目录，未发现完整 MCP token 落盘。

## 后续验证

- 重新加载扩展后，配置 MCP 并勾选“记住本机”。
- 关闭并重新打开侧边栏，确认 MCP 不需要重复输入 token。
- 点击“清除”后重新打开侧边栏，确认恢复为未配置 token。
