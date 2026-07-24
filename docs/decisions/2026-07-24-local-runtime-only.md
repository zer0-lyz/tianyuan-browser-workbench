# 本机运行目录与 OneDrive 项目边界

日期：2026-07-24

## 决策

天源浏览器工作台的运行文件统一放在本机目录，不再以 OneDrive 同步目录作为浏览器插件、Native Host、Connector 或脚本的实际运行来源。

## 本机运行目录

- 本机项目运行根目录：`~/.tianyuan-workbench/projects/天源评估系统/`
- 浏览器扩展加载目录：`~/.tianyuan-workbench/projects/天源评估系统/extension`
- Native Host 运行目录：`~/.tianyuan-workbench/native-helper/`
- Connector 插件运行目录：`~/plugins/tianyuan-browser-connector/`
- Codex 插件缓存运行目录：`~/.codex/plugins/cache/personal/tianyuan-browser-connector/0.3.0/`

## OneDrive 目录用途

OneDrive 项目目录只保留说明、决策、测试证据、交接资料和项目记忆，不作为扩展、Helper、Connector、脚本或依赖的运行来源。

## 加载要求

Chrome 加载未打包扩展时请选择：

`~/.tianyuan-workbench/projects/天源评估系统/extension`
