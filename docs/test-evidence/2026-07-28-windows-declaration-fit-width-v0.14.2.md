# Windows 申报表一页宽修复 v0.14.2 测试证据

日期：2026-07-28

## 反馈

- 反馈编号：`TYF-20260728-A4E64B91`。
- 用户现象：Windows 电脑批量处理后，申报表没有稳定设置为“将所有列打印在一页中”。
- 反馈未附 Windows 工作簿、截图或复现步骤，因此本轮按脚本输出和 OOXML 语义定位。

## 根因

- Native Helper 能正常启动 Python 脚本，不属于 Windows Python 语法错误。
- 申报表脚本已写入 `fitToPage=1`、`fitToWidth=1`、`fitToHeight=0`，但 `pageSetUpPr` 缺少 `autoPageBreaks=0`。
- macOS WPS 可接受原组合；Windows Excel/WPS 对分页模式切换更依赖完整的 `pageSetUpPr` 标志，可能继续沿用自动分页或旧缩放状态。
- 明细表模块按既定规则保持 100% 打印比例，本轮不改变该业务口径。

## 修复

- 新增统一函数 `enforce_fit_all_columns`。
- 明确写入 `fitToPage=True`、`autoPageBreaks=False`、`fitToWidth=1`、`fitToHeight=0`。
- 清除固定 `scale`，避免“固定百分比”和“适合一页宽”同时存在。
- 在申报表基础处理和最终打印设置两个阶段幂等调用。

## 验证

- Python 语法编译通过。
- 新增跨平台 OOXML 回归测试，直接读取生成工作簿的 `sheet1.xml`。
- 完整申报表样本处理通过，输出为：
  - `pageSetUpPr.autoPageBreaks=0`
  - `pageSetUpPr.fitToPage=1`
  - `pageSetup.fitToWidth=1`
  - `pageSetup.fitToHeight=0`
  - 无 `pageSetup.scale`
- 未处理客户正式工作簿，未执行任何天源线上上传、保存、清理或退出编辑动作。

## 版本

- 工作台：`0.14.2`
- 构建编号：`2026072803`
- Connector：`0.4.2`
