# GitHub 检测更新模块验证

时间：2026-07-26

## 版本

- 产品版本：`0.9.0`
- Chrome 版本：`0.9.0`
- 构建编号：`2026072601`
- 通道：`stable`
- 最低支持版本：`0.8.3`

## 设计

- 在线更新源固定为 GitHub Releases。
- Native Helper 负责访问公开 GitHub API。
- 侧栏不直接保存或发送 GitHub token。
- 更新检查与 MCP、CLI 和天源登录态无关。
- 第一阶段只检测、展示和打开下载地址，不静默更新。

## 自动验证

- JavaScript 语法检查通过。
- 静态扩展契约测试通过。
- GitHub 更新检查单元测试通过。
- Connector/Agent Bridge 回归测试通过。
- Git diff 格式检查通过。
- SemVer 测试覆盖正式版、beta 和多位数字版本。
- 模拟覆盖无 Release、新版本、平台安装包、SHA-256 和运行指纹不一致。

## 本机运行验证

- 本机运行副本已同步。
- Connector 协议：`connector-agent-binding-v3`
- 扩展版本：`0.9.0`
- Runtime build：
  `f1571a7fa7c6742ada340f827de56e80efc4be71f71a1454c156792fed4aecde`
- Native Messaging 调用 `check_github_update` 成功。
- 真实 GitHub API 返回仓库尚无正式 Release。
- 返回结果未包含或使用 MCP token、GitHub token、Cookie 或 Authorization。

## 当前边界

- Chrome 侧栏尚需重新加载扩展后进行视觉检查。
- 仓库尚未发布 `v0.9.0` Release，因此当前页面应显示“尚未发布”。
- `0.9.0` Windows 和 Mac 安装包尚未构建和上传。
