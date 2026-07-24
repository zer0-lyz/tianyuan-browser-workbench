# 决策：MCP token 改为面板内临时配置

日期：2026-07-22

## 背景

用户反馈通过终端或系统环境变量配置 MCP token 不符合插件使用习惯。期望在连接断开或未配置时，点击配置、输入 token、确认后即可自动连接。

## 决策

- 面板新增“配置 MCP”按钮。
- 点击后弹出 token 输入框。
- token 默认只保存在当前侧边栏页面的运行内存中。
- 用户可显式勾选“记住本机”，将 token 保存到 Chrome 本地扩展存储。
- 面板调用 Native Host 时，把本次 token 作为 Native Messaging 消息字段临时传入。
- Native Host 接收本次 token 后仅在进程内存中使用，不写入文件。
- 未勾选“记住本机”时，关闭面板、刷新扩展或清除配置后，token 失效。
- 已勾选“记住本机”时，token 会在本机 Chrome 扩展存储中保留，点击“清除”可删除。

## 安全边界

- 默认不写入项目文件。
- 不写入 Chrome Native Host 注册文件。
- 不写入 helper 日志。
- 不保存 Cookie、Authorization、密码或验证码。
- token 只有在用户明确勾选“记住本机”后，才保存到 Chrome 本地扩展存储。
- 证据 JSON 不包含 token。
