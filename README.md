# 天源浏览器工作台

天源浏览器工作台用于在天源评估系统页面中执行受控的批量操作、打印格式处理、连接绑定和对话式浏览器脚本能力。

当前仓库保存源码、说明、测试证据和项目记忆。实际运行文件应安装到本机目录，不要直接从 OneDrive、企业微信缓存、微信缓存或临时下载目录运行。

## 给 Agent 自动配置

把仓库下载或克隆到本机后，在仓库根目录执行：

```bash
node scripts/install-local-runtime.mjs
```

安装脚本会：

- 复制 Chrome 扩展、本地助手和 Connector 到本机运行目录；
- 同步打印格式脚本并验证本机 Python、`openpyxl` 和 `et_xmlfile`；
- 注册 Chrome Native Messaging Host；
- 输出 Chrome 需要加载的 `extensionPath`；
- 不写入 MCP token、Cookie、Authorization、密码或验证码。

更完整的自动配置提示词见：

- `交给Agent自动配置.md`
- `docs/INSTALL_FOR_AGENT.md`

## 浏览器加载

1. Chrome 打开 `chrome://extensions`，或 Edge 打开 `edge://extensions`。
2. 开启开发者模式。
3. 选择“加载未打包的扩展程序”。
4. 选择安装脚本输出的 `extensionPath`。
5. 打开天源系统页面，在侧栏中进入连接配置并绑定当前页面。

## 运行目录

- macOS：`~/.tianyuan-workbench/projects/天源评估系统/extension`
- Windows：`%LOCALAPPDATA%\TianyuanWorkbench\projects\天源评估系统\extension`

## 安全边界

- MCP token 只能由使用者本人在插件面板中输入，只在当前侧边栏会话中使用。
- 正式保存、上传、退出编辑等动作必须经过明确确认。
- 上传成功必须同时满足附件入库、分类批次、底稿保存和单元格回读一致。
