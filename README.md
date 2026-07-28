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

安装本机运行组件后，批量上传等页面写入模块不需要配置 Codex、WorkBuddy 或其他 Agent MCP。扩展会自动注册“天源工作台本机脚本”来源；首次执行写入时只需确认当前页面控制权。仅加载扩展文件而未注册 Native Messaging Host 时，文件夹选择和本机 Bridge 不会工作。

版本更新模块通过公开发行仓库 `zer0-lyz/tianyuan-browser-workbench-releases` 的 GitHub Releases 检查新版本，不使用 MCP token。`0.13.0` 起可在侧栏点击“更新全部组件”，自动下载对应平台完整包、校验 SHA-256，并同步扩展、Native Helper、Bridge、Connector、`~/plugins/` 与 Codex 插件缓存；完成后自动重新加载扩展。

`0.14.1` 起可先点击“测试更新模块”：它会下载当前平台完整包，验证 GitHub 下载、SHA-256、解压和安装包文件完整性，但不会安装、改变版本或重启，测试文件完成后自动删除。完整包约 100–130 MB。

`0.14.3` 修复 Windows 安装器把“CLI 文件存在”误判为“CLI 可运行”的问题。安装器会逐个执行 `--version` 验证候选；天源 CLI 修复失败时仅提示 CLI 导出暂不可用，不再阻断扩展、Native Helper、Connector 和打印组件更新。

`0.14.2` 修复 Windows Excel/WPS 对申报表“一页宽”设置识别不稳定的问题，统一写入 `fitToPage`、`autoPageBreaks`、`fitToWidth` 和 `fitToHeight`。明细表仍按既定规则保持 100% 比例，不改为强制缩放。

`0.12.2` 及更早版本的 Native Helper 不包含完整安装动作，因此首次升级到 `0.13.0` 仍需手动运行一次新版安装包。完成这次引导升级后，后续版本可直接使用侧栏一键更新。更新不会静默执行，开始前必须由用户明确确认。

反馈模块支持功能建议、配置问题、故障反馈和使用体验。草稿只保存在扩展本机存储；用户确认隐私声明后，反馈通过 `https://feedback.zer0y.com/api/feedback` 写入 Cloudflare 私有 D1 数据库并返回匿名反馈编号。浏览器扩展不保存 Cloudflare 或 GitHub token，公网不提供反馈读取接口；服务端源码和部署说明见 `feedback-service/README.md`。

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

Codex 安装时自动注册本机来源并继续读取本机项目/对话目录。WorkBuddy 来源注册后，侧栏可只读加载 `~/.workbuddy/workbuddy.db` 中的工作区和会话元数据，选择后再确认绑定；如果本机目录不可用，可退回手动填写。该配置只引用本机 `credentialRef`，不包含密钥或 MCP token。

## 统一 MCP 能力

浏览器扩展、Native Helper、Bridge 和 `tianyuan-browser-connector` 是共享运行层；Codex、WorkBuddy 和后续 Agent 使用同一份工具定义和同一套只读/控制门禁，不分别开发上传、查证核对或清理能力。WorkBuddy 的 `connector-proxy` 会聚合这套 MCP 工具，Agent 只携带自己的来源身份和页面绑定。

若 WorkBuddy 已连接但工具没有出现在 Agent 工具列表，优先检查其自定义 MCP 是否已启用并通过 Trust；不要重新开发或复制 Connector 工具。
