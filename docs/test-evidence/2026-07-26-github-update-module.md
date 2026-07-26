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
  `64b2cf6befaf748d38bd052da412171d3d781c6268188d3711e4a522251c07a2`
- Native Messaging 调用 `check_github_update` 成功。
- 初次真实检查发现私有源码仓库对匿名请求返回 `404`。
- 已改用公开发行仓库 `zer0-lyz/tianyuan-browser-workbench-releases`。
- 匿名 GitHub API 已成功返回 `v0.9.0` Release。
- 返回结果未包含或使用 MCP token、GitHub token、Cookie 或 Authorization。

## 正式 Release

- Release：
  `https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/tag/v0.9.0`
- Windows SHA-256：
  `c24e4255736ec35c1074273faff8c0aefa7332cdcffba9df56c9c350689a542a`
- macOS SHA-256：
  `83d29b52435a1f89b792cb8150d4ac0689672e6fe5b7096c2f9d816ff5c448c5`
- 当前 `0.9.0` 实测显示无需更新。
- 模拟 `0.8.3` 实测发现新版本并正确选择 Windows x64 安装包。

## 当前边界

- Chrome 侧栏尚需重新加载扩展后进行视觉检查。
- Windows 安装仍需真实 Windows 10/11 x64 验证。
