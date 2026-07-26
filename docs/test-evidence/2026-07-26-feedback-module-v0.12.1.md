# 反馈模块 v0.12.1 测试证据

日期：2026-07-26

## 版本

- 产品版本：`0.12.1`
- Chrome 版本：`0.12.1`
- 构建编号：`2026072605`
- 发布通道：`stable`

## 插件验证

- 反馈模块拥有独立模板、样式、状态、存储和生命周期。
- 首页模块数从 9 个更新为 10 个。
- 本机草稿可恢复、保存和清空。
- 标题、详细说明和隐私确认均为提交门禁。
- 可选安全环境信息只包含固定白名单字段。
- 疑似 Bearer token、`zhmcp_` token、Cookie、Authorization 和本机路径会被阻断。
- 服务未配置时“提交反馈”禁用，仍可复制反馈文本。
- 安装器完整性校验已包含 `feedback.json` 和反馈模块文件。

## 服务验证

- 严格拒绝未知顶层字段和未知诊断字段。
- 请求大小限制、来源限制和匿名限流生效。
- 服务端会再次脱敏凭据和本机路径。
- 反馈类型正确映射到私有仓库标签。
- 成功响应生成 `TYF-YYYYMMDD-XXXXXXXX` 匿名反馈编号。
- 单元测试使用注入式 Issue Client 验证，未向真实 GitHub 创建测试 Issue。

## 测试命令与结果

以下测试全部通过：

- `tests/module-architecture.test.mjs`
- `tests/updates-module.test.mjs`
- `tests/feedback-module.test.mjs`
- `tests/static-extension-contract.test.cjs`
- `feedback-service/test/feedback-service.test.js`
- JavaScript 语法检查

## 未完成验证

- 尚未部署 HTTPS 反馈服务。
- 尚未创建和安装 GitHub App。
- 尚未进行真实插件到私有 GitHub Issue 的端到端提交测试。
- 因此当前自动提交按钮保持禁用，不宣称自动同步已完成。

## 本机运行同步

- 安装脚本执行成功。
- 本机扩展版本回读：`0.12.1`。
- 本机反馈模块文件数：3。
- Connector 已受控重启，PID：`50206`。
- 运行指纹：`e54f3743a5865da20252d7a6c71db262bc07fca1f817203d0b6073852b69dfc6`。
- 运行目录：`~/.tianyuan-workbench/projects/天源评估系统/extension`。
