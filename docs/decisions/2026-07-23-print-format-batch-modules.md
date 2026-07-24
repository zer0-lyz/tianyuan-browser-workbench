# 打印格式批处理模块决策

日期：2026-07-23

## Skill 来源

本次接入两个外部 Skill：

- `appraisal-detail-print-format_20260721.tar.gz`
- `appraisal-declaration-print-format_20260721.tar.gz`

源码迁入：

- `skills/appraisal-detail-print-format/`
- `skills/appraisal-declaration-print-format/`

运行副本安装在：

`~/.tianyuan-workbench/dependencies/天源评估系统/print-format-skills/`

## 功能页面

首页新增：

- 明细表打印格式；
- 申报表打印格式。

两个页面均支持：

- 选择一个或多个 `.xlsx`、`.xlsm` 文件；
- 选择文件夹并递归批量发现工作簿；
- 覆盖源文件；
- 在源文件夹创建打印版副本；
- 保存到用户选择的新位置；
- 文件级进度、日志和最终结果清单。

## 输出规则

- 副本默认命名为 `原文件名-打印版.xlsx` 或 `.xlsm`。
- 名称冲突时自动生成 `-打印版 (2)` 等递增名称。
- 文件夹扫描跳过临时文件、Skill 备份文件和已经生成的打印版。
- 单次任务最多处理 500 个工作簿。

## 安全规则

- 浏览器不直接获得任意磁盘访问能力，文件和目录必须通过 macOS 选择器授权。
- 覆盖源文件时，先复制到同目录临时文件，在临时文件上运行脚本并通过 ZIP 完整性检查，再原子替换源文件。
- 副本或新目录模式处理失败时删除临时文件，不留下半成品。
- Skill 业务规则保持原样；Native Host 只负责选择、复制、调度、进度和完整性验证。
- `.xlsm` 使用 `keep_vba=True` 加载，避免丢失 VBA 包。

## 集成调整

- 申报表脚本不再依赖固定用户目录 `~/.codex/skills`，改为读取同一运行包中的明细表基础脚本。
- 明细表脚本补充 `.xlsm` 的 VBA 保留模式。
