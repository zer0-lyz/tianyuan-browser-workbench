# 天源浏览器工作台：交给 Agent 自动配置

把下面这段话交给对方电脑上的 Agent。Agent 应在下载或克隆本仓库后执行。

```text
请帮我安装并配置“天源浏览器工作台”。

要求：
1. 不要把运行文件放到 OneDrive、企业微信缓存、微信缓存或临时下载目录中。
2. 运行文件统一复制到本机目录：
   - macOS：~/.tianyuan-workbench/projects/天源评估系统/
   - Windows：%LOCALAPPDATA%\\TianyuanWorkbench\\projects\\天源评估系统\\
3. 在仓库根目录执行：
   node scripts/install-local-runtime.mjs
4. 执行完成后，读取脚本输出的 extensionPath。
5. 打开 Chrome 扩展程序页面，开启开发者模式，选择“加载未打包的扩展程序”，加载 extensionPath 对应目录。
6. 打开天源系统页面后，打开“天源浏览器工作台”侧栏，进入连接配置，点击启动或绑定当前页面。
7. MCP token 只能由使用者本人在插件面板中输入；不要读取、索取、记录或写入 token、Cookie、Authorization、密码或验证码。
8. 验证：
   - Helper/Connector 显示已连接；
   - 当前页面能显示项目、公司和科目；
   - 不做正式保存、上传或退出编辑，除非使用者明确要求。
9. 后续更新优先使用侧栏“版本更新 -> 更新全部组件”。如果当前版本为 `0.12.2` 或更早，需要先手动运行一次 `0.13.0` 完整安装包。
```

## 安装后目录

- Chrome 扩展目录由安装脚本输出的 `extensionPath` 给出。
- Native Host 注册文件由安装脚本自动配置。
- Connector 插件会复制到用户目录下的 `plugins/tianyuan-browser-connector`。

## 安全边界

- 安装脚本不会写入 MCP token。
- 安装脚本不会保存 Cookie、Authorization、密码或验证码。
- 正式执行上传、保存、退出编辑等动作前，必须由使用者明确确认。
