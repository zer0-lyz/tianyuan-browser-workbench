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
- 在 macOS Keychain（不可用时为 `~/.tianyuan-workbench/` 的受限本机运行态）注册 Codex 本机实例身份；
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

- 页面访问按已注册 Agent 来源和 `agentBinding` 隔离；仅 `127.0.0.1` 不是来源授权。
- 扩展与 Bridge 通过固定扩展 ID、扩展版本和本机 `runtime-compat.json` 握手；版本不一致会明确提示重新加载扩展，不会静默降级。
- 同一浏览器页面可授予多个来源只读权限，但任一时刻只允许一个来源拥有控制权限；切换控制者必须在侧栏确认，并会取消旧控制者未执行的队列任务。
- MCP token 只能由使用者本人在插件面板中输入；默认仅当前会话使用，勾选“记住本机”时仅保存到 Chrome 扩展本机存储，清除后立即删除。
- 正式保存、上传、退出编辑等动作必须经过明确确认。
- 上传成功必须同时满足附件入库、分类批次、底稿保存和单元格回读一致。

## 其他 Agent

Codex 安装时自动注册本机来源并继续读取本机项目/对话目录。WorkBuddy 尚未集成其项目或对话 API；请在侧栏“Agent 控制者管理”添加手动来源，填写本机可见的工作区/对话标识，然后使用侧栏生成的 stdio MCP 配置。该配置只引用本机 `credentialRef`，不包含密钥或 MCP token。
