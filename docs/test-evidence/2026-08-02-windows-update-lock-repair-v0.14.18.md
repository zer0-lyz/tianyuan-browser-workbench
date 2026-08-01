# Windows 自动更新卡 82% 修复证据

日期：2026-08-02

## 问题

Windows `v0.14.17` 更新下载、SHA-256 校验和解压均完成，但安装阶段因旧 Connector Bridge/Native Host/Node 进程仍占用文件，复现 `EBUSY: resource busy or locked`，界面长期停在 `installing / 82%`。

## 修复

- Native Host 回传更新启动结果后主动退出，Detached runner 等待旧 Host 退出。
- Windows 安装前只识别天源自己的 Connector、Native Host 和 managed Node，并最多重试 3 次停止与文件释放检查。
- 文件或进程仍被占用时返回 `UPDATE_FILE_LOCKED`；第三方占用 Connector 端口时返回 `CONNECTOR_PORT_OCCUPIED_BY_OTHER_SERVICE`。
- runner 捕获启动错误、安装器退出码、状态文件缺失和超时，并写入安装日志与结构化状态。
- Native Helper 关键文件增加回滚备份；安装后校验版本、构建号、runtimeBuildId、Native Messaging、Python/openpyxl 和 Connector health。

## 自动化验证

- `node --test tests/*.cjs tests/*.mjs`：21 项通过。
- `tests/windows-update-runner.test.cjs`：动态 Windows runner 生成契约通过。
- Windows 完整包结构、包内 `SHA256SUMS`、版本、build number、runtimeBuildId 回读通过。
- Windows lite 包结构和运行时缺失边界回读通过。

## 测试包

- 完整包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.18-windows-x64-20260802.zip`
- 完整包 SHA-256：`251dec874764fe9222bc0d04c252144918d7ef5790ed2f9ed73b20e417d3f0d3`
- lite 包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.18-windows-x64-lite-20260802.zip`
- lite 包 SHA-256：`0a567414558d408c1b2747f574b41a9e65b4afa4e47854f7a929ac074060f6fa`

## 未完成

尚未在真实 Windows 机器上验证进程停止、文件占用、Connector 恢复和 Chrome 扩展重载；因此 v0.14.18 暂不发布 GitHub Release。
