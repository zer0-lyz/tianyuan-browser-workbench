# 天源浏览器工作台

天源浏览器工作台（Tianyuan Browser Workbench）用于在天源评估系统页面中执行受控的批量操作、打印格式处理、连接绑定和对话式浏览器脚本能力。本项目为开源软件，采用 MIT 许可证（见 [LICENSE](./LICENSE)）。

实际运行文件应安装到本机目录，不要直接从云盘、企业微信缓存、微信缓存或临时下载目录运行。

> **开源说明**：本仓库仅保留源码、公开说明与架构决策。内部项目记忆、业务接口资料和测试证据不随仓库公开；`feedback-service` 反馈模块依赖私有 Cloudflare 服务，开源版默认不提供该服务，如需自建请参考该目录内 README。

## 许可证

本项目使用 [MIT](./LICENSE) 许可证。使用本项目或其衍生代码时，请遵守许可证条款，并对在天源评估系统等线上系统中的操作自行负责。

## 免责声明

- 本项目仅提供受控的浏览器操作能力，不保证与任何特定系统版本的兼容性。
- 在天源评估系统等线上系统中的任何操作，请在充分了解业务规则、确认页面与编辑锁状态后进行；本项目不对线上数据损失负责。
- 本项目不收集、不上传任何 MCP token、Cookie、Authorization、密码或验证码。
- 反馈服务为可选模块，默认指向私有服务；自建或关闭后，插件其余功能不受影响。

## 贡献

欢迎通过 GitHub Issue 提交缺陷与建议，通过 Pull Request 贡献代码。提交前请：

- 不提交任何真实凭据、Cookie、Authorization、密码、验证码或 MCP token；
- 不提交个人本机路径（如 `/Users/<用户名>`、云盘路径）；
- 为新增功能补充测试，并保证 `node --test tests/*.test.cjs tests/*.test.mjs` 通过。

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

`0.14.9` 起支持轻量更新包和国内静态镜像清单。首次安装仍使用完整安装包；后续更新可只下载扩展、Native Helper、Connector、skills 和安装脚本，复用本机已安装 Node、Python/openpyxl 和天源 CLI。镜像源可使用 Gitee 仓库 raw 文件，失败时自动回退 GitHub，下载仍受域名白名单、文件大小和 SHA-256 校验保护。

`0.14.1` 起可先点击“测试更新模块”：它会下载当前平台完整包，验证 GitHub 下载、SHA-256、解压和安装包文件完整性，但不会安装、改变版本或重启，测试文件完成后自动删除。完整包约 100–130 MB。

`0.14.8` 修复旧版 Windows 更新器仍无法识别兼容入口的问题。此前 macOS `/usr/bin/zip` 未给中文文件名写入 UTF-8 标志，PowerShell `Expand-Archive` 会把 `安装.ps1` 解压为乱码；Windows 包现改用 Python `zipfile` 生成，并对精确文件名和 UTF-8 标志做正式包回归验证。

`0.14.7` 修复 Windows 在线更新误报“安装包中缺少安装程序”的第一层路径问题。新更新器优先定位 ASCII `install.ps1`；Windows 包同时保留一次旧版更新器自举所需的 `安装.ps1` 兼容别名。

`0.14.6` 完全移除 Windows 本机目录同步中的 `fs.cpSync`。安装器改为逐目录创建、逐文件复制、单文件大小校验和整棵目录清单比对，避免该 Windows 环境中 `fs.cpSync` 静默不创建 `skills.staging-*`。

`0.14.5` 修复 Windows 将 `skills.staging-*` 原子重命名为正式目录时出现 `ENOENT` 的问题。临时目录会先经过存在性门禁；原子替换失败时自动从已校验安装源直接覆盖正式目录并回读。

`0.14.4` 修复 Windows 第 `5/7` 步本机组件同步时，目标目录瞬时缺少必需文件导致的失败。目录复制增加三次重试与必需文件单独补拷；失败报告改为结构化单行原因，不再只显示 Node 堆栈第一行。

`0.14.3` 修复 Windows 安装器把“CLI 文件存在”误判为“CLI 可运行”的问题。安装器会逐个执行 `--version` 验证候选；天源 CLI 修复失败时仅提示 CLI 导出暂不可用，不再阻断扩展、Native Helper、Connector 和打印组件更新。

`0.14.2` 修复 Windows Excel/WPS 对申报表“一页宽”设置识别不稳定的问题，统一写入 `fitToPage`、`autoPageBreaks`、`fitToWidth` 和 `fitToHeight`。明细表仍按既定规则保持 100% 比例，不改为强制缩放。

`0.12.2` 及更早版本的 Native Helper 不包含完整安装动作，因此首次升级到 `0.13.0` 仍需手动运行一次新版安装包。完成这次引导升级后，后续版本可直接使用侧栏一键更新。更新不会静默执行，开始前必须由用户明确确认。

反馈模块支持功能建议、配置问题、故障反馈和使用体验。草稿只保存在扩展本机存储；用户确认隐私声明后，反馈通过 `https://feedback.zer0y.com/api/feedback` 写入 Cloudflare 私有 D1 数据库并返回匿名反馈编号。浏览器扩展不保存 Cloudflare 或 GitHub token，公网不提供反馈读取接口；服务端源码和部署说明见 `feedback-service/README.md`。

“微信文件归档”模块支持 macOS 本机微信和企业微信下载目录检测、文件稳定性判断、去重、复制、SHA-256 校验、后台状态和失败记录。第二阶段已加入会话清单、搜索、多选、目录绑定和高置信度匹配接口；但当前本机微信/企业微信会话数据库为加密格式，面板会明确提示暂时无法可靠加载清单，不会猜测群聊或联系人。没有精确文件消息元数据时仍进入 `来源未知待确认` 目录。详细边界见 `docs/decisions/20260803-file-archive-mvp.md` 和 `docs/decisions/20260804-file-archive-phase2.md`。

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
