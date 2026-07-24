# 本机运行依赖迁移验证记录

验证时间：2026-07-23 01:38 CST

## 迁移目标

云盘项目只保留基础项目信息、源码、文档和测试证据；底层依赖、运行副本、日志、缓存和快照迁移到本机目录。

## 本机目录

- `~/.tianyuan-workbench/native-helper/`
- `~/.tianyuan-workbench/dependencies/天源评估系统/`
- `~/.tianyuan-workbench/project-snapshots/天源评估系统/`

## 已迁移内容

- `tycpv-setup-0.1.0-macos-arm64.pkg`
- `macos-tycpv-agent-cli-guide.md`
- `valuation-declaration-table-json/`
- `valuation-json-to-excel/`
- `.snapshots/`

## 验证结果

- OneDrive 项目根目录未发现：
  - `node_modules/`
  - `.venv/`
  - `venv/`
  - `.cache/`
  - `.snapshots/`
  - `*.pkg`
  - `*.log`
- 本机 Native Host 目录存在：
  - `native_host.js`
  - `server.js`
  - `native_host_launcher.sh`
  - `server_launcher.sh`
  - `native_host.log`
- Chrome Native Messaging 注册文件路径为：

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tianyuan.workbench.helper.json
```

注册文件中的 `path` 指向：

```text
~/.tianyuan-workbench/native-helper/native_host_launcher.sh
```

## 静态检查

```bash
node --check native-helper/native_host.js
node --check native-helper/server.js
```

结论：通过。
