# 明细表公式恢复模块决策

日期：2026-08-07

## Skill 来源

接入外部 Skill 分享包（本机下载目录中的 `asset-link-restore-分享包`）：

- `SKILL.md`
- `scripts/restore_links.py`（核心，仅依赖 openpyxl）
- `scripts/audit_restore.py`（自动校对）
- `scripts/verify_formulas.py`（可选，需 formulas 库）
- `references/structure.md`

源码迁入：

- `skills/asset-link-restore/`

运行副本安装在：

`~/.tianyuan-workbench/dependencies/天源评估系统/print-format-skills/asset-link-restore/`

## 功能定义

恢复天源资产评估执业系统导出明细表中丢失的四层跨表汇总链接：

1. 叶子表合计 → 二级汇总（如 `4-8固定资产汇总`）；
2. 二级汇总 → 分类汇总表（`3/4/5/6-xx汇总`）；
3. 分类汇总表 → `2-分类汇总`；
4. `2-分类汇总` → `1-汇总表`（÷10000 万元换算）。

同时恢复增值额 `=E-D`、增值率 `=IF(D=0,"",F/D*100)`，保留原隐藏表隐藏，
产出《`<文件名>_链接恢复.xlsx`》与《`<文件名>_链接恢复对比报告.xlsx`》。

## 界面与执行协议

- 侧栏新增“明细表公式恢复”入口（功能 7），路由 `link-restore`，复用打印格式面板样式：
  选择文件 / 选择文件夹、输出方式（源文件夹副本、覆盖、新目录）、进度条、日志。
- Native Host 新增 `run_link_restore` 动作，复用打印格式的批处理机制：
  递归收集 `.xlsx/.xlsm`（跳过临时/备份/已生成打印版，单批最多 500 个）、
  随机临时文件 + zip 归档校验 + 原子替换、逐文件进度事件。
- 副本命名 `<原文件名>-链接恢复.xlsx`，名称冲突自动加序号；对比报告命名
  `<原文件名>_链接恢复对比报告.xlsx`。
- 安装器同步：`native-helper/install_native_host.sh`、`scripts/install-local-runtime.mjs`
  （Windows 安装包走 install-local-runtime 的 print-format-skills 目录）。
- Native Host `--self-test` 增加 `printScriptsAvailable.linkRestore`。

## 安全边界

- 覆盖模式：先复制到随机临时文件处理，校验通过后原子替换，失败自动恢复原文件。
- 脚本不修改金额数据、表头框架；原模板留空列保持留空；已存在公式不覆盖。
- 对比报告“不一致”条目 = 原静态值无法由底层明细重新汇总得到，需人工核实，不作为自动成功。
