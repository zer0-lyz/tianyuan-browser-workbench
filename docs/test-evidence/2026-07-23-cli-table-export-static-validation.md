# CLI 表格导出静态与协议验证

日期：2026-07-23

## 已核对 CLI

本机 `tycpv` 版本：`0.1.0`。

已读取两个命令的帮助信息，确认均支持：

- `--project-id <id>`
- `--company-ids <ids>`
- `--out-dir <path>`

## 静态验证

- `native-helper/native_host.js` 通过 Node.js 语法检查。
- `native-helper/server.js` 通过 Node.js 语法检查。
- 侧栏三个 JavaScript 文件通过语法检查。
- `extension/manifest.json` 通过 JSON 解析，版本为 `0.2.0`。
- HTML 共 103 个 ID，JavaScript 共定义 103 个元素引用，未发现缺失 ID。
- `git diff --check` 通过。

## Native Messaging 协议验证

使用本地假 CLI 执行完整流式测试，没有访问真实天源项目：

- 收到 15 条阶段进度消息；
- 进度覆盖 3%、8%、14%、20%、24%、30%、53%、60%、75%、90%、98%；
- 最终完成消息为 100%；
- 成功回传 2 个模拟输出文件路径；
- 非白名单导出类型返回 `EXPORT_TYPE_NOT_ALLOWED`；
- 相对输出目录返回 `EXPORT_DIRECTORY_INVALID`。

## 本机安装验证

- 已运行 `native-helper/install_native_host.sh`。
- 项目源码与 `~/.tianyuan-workbench/native-helper/native_host.js` SHA-256 一致。
- 通过已安装 launcher 调用健康检查成功。
- CLI 返回可用，版本为 `0.1.0`。

## 界面验证

使用本机 Chrome Headless 生成首页、明细表导出页和申报表导出页预览：

- 首页显示 4 个功能模块；
- 两个导出页均只显示公司范围；
- 路径选择、导出按钮、进度条、日志和证据区域均已渲染；
- 日志和证据默认折叠。

## 验证边界

没有执行真实项目导出。重新加载扩展后，应先用少量公司测试明细表和申报表各一次，核对输出文件数量、名称和可打开性。
