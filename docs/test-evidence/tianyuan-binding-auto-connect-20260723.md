# 天源绑定按钮自动连接验证

日期：2026-07-23

## 问题

连接配置页已经加载 Codex 项目和对话，但当前天源页面尚未建立 Connector session 时，点击“保存绑定”或“绑定当前对话”没有可见反馈。

旧逻辑只把缺少 session 的提示写到连接页顶部。用户滚动到绑定区域后看不到顶部提示，因此表现为按钮没有反应。

## 修复

- 扩展版本升级为 `0.4.1`。
- 两个绑定按钮都会先自动检查 Connector。
- Connector 未运行时，通过 Native Messaging 自动启动本地 Bridge。
- 自动读取当前活动的天源标签页并注册页面 session。
- 页面 session 建立后，再保存 Codex 项目或对话绑定。
- 按钮下方新增就近反馈，显示启动、页面绑定、保存、成功或失败状态。
- 仅复用与当前标签页 `tabId` 一致的 session，避免切换页面后误绑旧 session。

## 验证结果

- `native-helper/native_host.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过，版本为 `0.4.1`。
- Git 差异格式检查通过。
- 侧栏 HTML 共 155 个 ID，JavaScript 的 155 个 `getElementById` 引用全部存在。
- Connector `/health` 返回正常，当前服务可访问。
- Connector `/api/protocol` 返回正常，项目绑定、对话绑定和页面上下文读取能力已声明。
- Native Messaging `start_connector_bridge` 返回正常；Bridge 已运行时返回 `started: false`，并附带正常健康状态。
- 项目源码与本机安装的 Native Host 文件哈希一致。

## 真实界面回测

重新加载 Chrome 中的天源浏览器工作台后：

1. 打开一个天源系统页面。
2. 进入工作台“连接配置”。
3. 选择 Codex 项目和对话。
4. 直接点击“保存绑定”或“绑定当前对话”，无需预先点击“绑定当前页面”。
5. 按钮下方应立即显示处理进度。
6. 成功后，“页面连接”显示已绑定，Session 和 Binding ID 不再为 `-`。

当前 Codex 的 Chrome 控制通道未连接，因此真实侧栏点击仍需在 Chrome 中完成一次回测。
