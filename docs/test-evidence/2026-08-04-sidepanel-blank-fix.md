# 侧栏空白修复测试证据

## 根因

文件归档第二阶段初始化等待 Native Messaging 会话加载；连接不可用或响应慢时阻塞整个侧栏启动流程，所有路由页面保持隐藏。

## 修复

- 页面模板和事件先完成挂载。
- 应用检测、会话加载和归档状态改为异步后台执行。
- 缺少新版文件归档页面节点时只跳过该模块，不影响其他模块。

## 验证

- 本机运行副本：`/Users/zer0y/.tianyuan-workbench/projects/天源评估系统/extension`
- Native Helper：`/Users/zer0y/.tianyuan-workbench/native-helper/`
- 全量测试：`33/33` 通过。
- `git diff --check`：通过。

## 用户操作

在 `chrome://extensions` 对“天源工作台”点击“重新加载”；若之前加载的是 OneDrive 目录，应改为加载：

```text
/Users/zer0y/.tianyuan-workbench/projects/天源评估系统/extension
```
