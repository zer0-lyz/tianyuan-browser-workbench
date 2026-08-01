# Windows 明细表一页宽修复 v0.14.19 测试证据

日期：2026-08-02 CST

## 问题

Windows 版本执行“明细表打印格式”后，打印设置仍显示“无打印缩放 / 100%”，没有将所有可见列压缩到一页宽度内。

## 根因

明细表脚本此前写入 `scale=100`、`fitToWidth=0` 和 `fitToPage=False`。该组合会要求 Excel/WPS 保持固定比例，不会启用“一页宽”的 OOXML 打印模式。

## 修复

`skills/appraisal-detail-print-format/scripts/adjust_appraisal_detail_print.py` 现在统一写入：

- `pageSetUpPr.fitToPage=1`
- `pageSetUpPr.autoPageBreaks=0`
- `pageSetup.fitToWidth=1`
- `pageSetup.fitToHeight=0`
- 清除固定 `scale`

页宽限制为一页，页高保持不限，长表可以自然纵向分页。原有空列隐藏、表格边界、页脚和数据保护逻辑不变。

## 验证

- Python 语法检查通过。
- 打印页设置 XML 回读通过，申报表和明细表均为一页宽组合。
- 全部 `node --test tests/*.cjs tests/*.mjs`：21 项通过，0 项失败。
- Windows 完整包和 Lite 包 ZIP 校验通过，并包含修复后的明细表脚本。

## 实机边界

尚未在 Windows Excel/WPS 实机打开用户的原始导出文件进行最终视觉验收；本版本用于用户从 0.14.18 执行更新后验证真实打印预览。
