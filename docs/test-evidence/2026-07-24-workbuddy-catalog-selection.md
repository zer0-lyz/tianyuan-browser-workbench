# WorkBuddy 项目对话自动加载验证

日期：2026-07-24

## 验证范围

- 使用临时 SQLite 数据库模拟 WorkBuddy `workspaces` 和 `sessions` 表。
- 通过 Bridge `GET /api/catalog?providerId=workbuddy` 读取项目与对话元数据。
- 校验侧栏选择项目/对话后仍由用户点击确认绑定。
- 校验返回字段不包含对话正文、Cookie、Authorization、密码、验证码或 MCP token。

## 结果

- Bridge 返回 `providerId=workbuddy`。
- 项目和对话均可加载。
- 对话返回 `threadId`、标题、工作区标识、路径、状态和时间，不返回正文。
- 既有 Agent 隔离、只读不能写、控制权冲突和旧队列取消测试继续通过。

## 已知限制

- WorkBuddy 本机数据库属于本地应用数据格式，字段变化时目录适配器会返回 `WORKBUDDY_CATALOG_UNAVAILABLE`，不会猜测其他文件。
- 需要重新加载浏览器扩展到本机运行路径 `~/.tianyuan-workbench/projects/天源评估系统/extension` 才能看到新控件。
