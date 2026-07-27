# 天源浏览器工作台 v0.13.0 完整组件更新验证

日期：2026-07-27 CST

## 目标

把原来仅能检查和下载版本的功能改为经用户确认后更新全部本机运行组件，避免只重新加载扩展而 Connector、Native Helper 和 Agent 插件缓存仍停留在旧版。

## 实现

- 工作台版本：`0.13.0`
- 构建编号：`2026072703`
- Connector 版本：`0.4.2`
- 固定更新源：`zer0-lyz/tianyuan-browser-workbench-releases`
- 更新范围：扩展、Native Helper、Bridge、Connector、用户插件目录、Codex 插件缓存
- 校验：平台 ZIP 的 SHA-256
- 完成动作：重启 Connector、自动 reload 扩展

## 自动验证

- `tests/update-installer.test.cjs`
  - 完整包下载、校验、解压和安装启动通过
  - SHA-256 不一致时返回 `UPDATE_SHA256_MISMATCH`，不启动安装
- `tests/update-checker.test.cjs`
  - SemVer、平台资产和运行指纹修复判断通过
- `tests/updates-module.test.mjs`
  - 更新模块初始化、状态和新增控件通过
- `tests/static-extension-contract.test.cjs`
  - 更新动作、安装脚本、发布包内容和 Connector 缓存契约通过
- `tests/agent-binding-bridge.test.cjs`
  - 既有 Agent 隔离、只读、控制冲突、队列取消和错误码回归通过
- `tests/windows-package-encoding.test.cjs`
  - 中英文 CMD 均为 ASCII/CRLF，不依赖代码页切换
  - 中英文 PowerShell 文件均带 UTF-8 BOM

## 兼容边界

- `0.12.2` 及更早 Native Helper 不支持 `install_workbench_update`，无法直接获得新的一键安装动作。
- 因此首次升级到 `0.13.0` 必须手动运行一次完整安装包。
- 完成引导升级后，后续版本可直接使用侧栏“更新全部组件”。

## 安全

- 更新动作不读取、保存或输出 MCP token、Cookie、Authorization、密码或验证码。
- 不接受任意仓库或任意下载 URL。
- 本轮未执行天源页面上传、保存、清理、退出编辑或其他线上写入。

## 发布状态

- 本地开发、安装同步和自动测试完成。
- 用户已确认正式发布，当前进入干净提交、重建包和公开 Release 流程。
