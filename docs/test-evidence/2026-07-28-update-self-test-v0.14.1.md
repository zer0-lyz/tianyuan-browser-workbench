# 更新模块安全自测 v0.14.1 测试证据

日期：2026-07-28

## 目标

- 允许用户在侧栏独立测试完整更新链路。
- 自测只执行公开包下载、SHA-256、解压和文件完整性校验。
- 不安装组件、不改变当前版本、不重启浏览器或 Agent，测试文件完成后自动删除。

## 修复内容

- 完整包下载由单次请求改为最多三次自动重试。
- 主下载通道失败后切换 GitHub Asset API 备用通道。
- 下载写入 `.part` 临时文件，完成后原子替换。
- 校验 Release 记录的包大小并返回明确错误码。
- 侧栏新增“测试更新模块”按钮、风险说明、进度和可读失败原因。

## 自动测试

- 根目录 12 个 CJS/MJS 测试文件全部通过，反馈服务 7 项测试通过。
- 更新器测试覆盖网络重试、网络错误码、下载大小不一致、SHA-256 不一致和安全自测。
- 安全自测断言安装程序未启动、`installed=false`、测试目录无残留。
- 更新模块测试覆盖按钮调用、成功反馈和按钮恢复。
- 静态契约确认扩展、Native Host 和更新器均声明自测动作。

## 真实公开包自测

- 测试目标：公开 Latest Release `v0.14.0` macOS ARM64 包。
- 下载字节数：`127421471`。
- SHA-256：`7a7af43f617ed04673ccde1adda7f5c0e4096c69b63aebc90b328bc4761d52b1`。
- 结果：`phase=test_complete`、`packageValid=true`、`installed=false`。
- 解压后要求文件全部存在，测试目录已自动删除。
- 未使用或输出 MCP token、Cookie、Authorization、密码或验证码。
- 未执行任何天源线上上传、保存、清理或退出编辑动作。

## 本机同步

- 安装脚本执行成功，运行版本为 `0.14.1 / 2026072802`。
- 扩展运行目录：`~/.tianyuan-workbench/projects/天源评估系统/extension`。
- Native Host 自检通过，注册文件位于 Chrome 用户级 Native Messaging Hosts 目录。
- Connector 已重启，协议为 `connector-agent-binding-v3`，运行指纹为 `a28cf81a8bf5eab34f8a96278170789467d8a5261965f548d2b8b4da2103521b`。
- Connector 安装目录：`~/plugins/tianyuan-browser-connector`。
- Codex Connector 缓存：`~/.codex/plugins/cache/personal/tianyuan-browser-connector/0.4.2`。
- Chrome 只需在扩展管理页重新加载一次，即可由用户自行点击“测试更新模块”。
