# CLI 授权流程静态验证记录

日期：2026-07-22

## 验证对象

- `native-helper/native_host.js`
- `extension/src/sidepanel/index.html`
- `extension/src/sidepanel/sidepanel.js`

## 验证结果

- 面板新增“授权 CLI”按钮。
- Native Host 新增 `cli_login` 动作，执行 `/usr/local/bin/tycpv login`。
- Native Host 副本已重新安装到 `~/.tianyuan-workbench/native-helper/`。
- `native-helper/native_host.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 扫描项目文件、Chrome 注册文件和本机 Native Host 安装目录，未发现完整 MCP token 落盘。

## 后续验证

- 重新加载扩展后点击“授权 CLI”，验证是否打开 `tycpv login` 授权页面。
- 授权完成后点击“启动/检查”，确认 CLI 显示可用。
