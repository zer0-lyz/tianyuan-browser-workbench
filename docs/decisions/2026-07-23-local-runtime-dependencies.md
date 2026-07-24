# 本机运行依赖目录决策

日期：2026-07-23

## 背景

用户要求底层依赖安装在本地，不安装在 OneDrive 云盘项目中；云盘只存储基础项目信息。

## 决策

OneDrive 项目目录只保留：

- 插件源码；
- native-helper 源码；
- 项目管理文件；
- 上下文、决策、测试证据文档；
- 轻量原型和模板。

本机运行态统一放在：

```text
~/.tianyuan-workbench/
```

具体分区：

- `~/.tianyuan-workbench/native-helper/`：Native Host、HTTP helper 的运行副本、launcher 和日志。
- `~/.tianyuan-workbench/dependencies/天源评估系统/`：CLI 安装包、外部工具目录、重型依赖材料。
- `~/.tianyuan-workbench/project-snapshots/天源评估系统/`：本机快照。

## 已迁移材料

- `tycpv-setup-0.1.0-macos-arm64.pkg`
- `macos-tycpv-agent-cli-guide.md`
- `valuation-declaration-table-json/`
- `valuation-json-to-excel/`
- `.snapshots/`

## 规则

- 不在 OneDrive 项目目录运行 `npm install`、创建 Python 虚拟环境或保存大型二进制依赖。
- 不在 OneDrive 项目目录写运行日志、缓存、临时下载或本地快照。
- Native Host 注册文件必须指向本机目录下的 launcher，而不是 OneDrive 项目路径。
- 源码更新后，通过 `native-helper/install_native_host.sh` 同步到本机运行副本。

## 验证

后续验证项：

- 项目根目录不出现 `node_modules/`、`.venv/`、`.cache/`、`.snapshots/`、`*.pkg`。
- Chrome Native Messaging 注册文件指向 `~/.tianyuan-workbench/native-helper/native_host_launcher.sh`。
- 本机目录存在 `native_host.js`、`server.js`、`native_host_launcher.sh` 和 `server_launcher.sh`。
