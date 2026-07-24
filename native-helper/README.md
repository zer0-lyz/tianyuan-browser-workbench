# 天源本地 Helper

本地 Helper 负责把浏览器插件和天源 MCP、天源 CLI 隔开：MCP token 只放在本机运行态里，插件只访问 `127.0.0.1` 或 Chrome Native Messaging。

项目目录只保留源码和说明；实际运行副本、日志、缓存和后续依赖统一放在：

```text
~/.tianyuan-workbench/
```

## 启动

推荐先安装本机运行副本：

```bash
native-helper/install_native_host.sh
```

Chrome Native Messaging 会使用：

```text
~/.tianyuan-workbench/native-helper/native_host_launcher.sh
```

如需开发调试 HTTP helper，可启动本机副本：

```bash
export VALUATION_MCP_TOKEN="你的 MCP token"
~/.tianyuan-workbench/native-helper/server_launcher.sh
```

默认地址：`http://127.0.0.1:8765`

## 接口

- `GET /health`
- `GET /projects/:projectId/companies`
- `GET /projects/:projectId/companies/:companyId/asset-subjects`

Native Messaging 额外支持：

- `select_export_directory`：调用 macOS 文件夹选择器，由用户明确授权导出目录。
- `run_cli_export`：仅允许执行资产基础法明细表或申报表导出，并持续返回阶段进度。
- `select_print_workbook_files`：选择一个或多个待处理工作簿。
- `select_print_workbook_directory`：选择文件夹并递归发现 `.xlsx`、`.xlsm` 工作簿。
- `select_print_output_directory`：选择打印版文件的新存放位置。
- `run_print_format`：批量执行明细表或申报表打印格式调整，并持续返回文件级进度。

## 安全规则

- 不把 Cookie、Authorization、密码、验证码或 token 返回给插件。
- 不把 token 写入项目文件。
- 不在 OneDrive 项目目录安装依赖、写日志或保存缓存。
- CLI 导出只允许白名单子命令，使用参数数组调用，不通过 shell 拼接命令。
- 导出目录必须由用户选择且为现有本机目录。
- 打印格式覆盖模式先处理临时副本并验证完整性，再原子替换源文件。
- 打印版副本使用 `-打印版` 后缀；名称冲突时自动增加序号。
- 文件夹批处理会跳过临时文件、备份文件和已生成的打印版，最多处理 500 个工作簿。
- Helper 不执行底稿保存、附件上传或线上落库。
