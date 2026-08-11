---
name: financial-statement-import
description: 将已解析的资产负债表或利润表数据，通过 valuation-mcp 预检、确认、导入并回读到天源评估系统。
---

# 天源财务报表导入

## 触发场景

用户要求把财务报表导入天源评估系统、继续导入下一家公司、导入资产负债表或利润表时使用本技能。

## 安全边界

- 先只读预检，禁止在预检阶段调用保存工具。
- 只有用户明确确认预检中的项目、公司、报表类型、年度、科目和金额后，才允许执行导入。
- 执行后必须回读并逐项核对，不能只依据“保存成功”提示报告完成。
- 不修改源 Excel/PDF，不覆盖 `~/.tycpv/` 凭据，不输出 MCP token、Cookie、Authorization、密码或验证码。
- 如果公司、年度、金额或报表口径存在歧义，停止并列出待确认事项，不猜填。

## 前置检查

1. 检查 `tycpv --version` 是否可用。
2. 确认 `~/.tycpv/auth.json` 和 `~/.tycpv/token.secret.json` 存在，且登录态未过期；过期先运行 `tycpv login`。
3. 确认源文件已经解析为结构化科目金额数据。禁止为导入流程重复 OCR；OCR 还原数据必须先人工复核。
4. 使用项目内的运行时脚本，不把 token 放入命令行历史、项目文件或日志。

脚本位置：

```text
runtime/scripts/financial-statement-import.mjs
```

脚本从 `~/.tycpv/auth.json` 和 `~/.tycpv/token.secret.json` 读取登录态，直接连接 `valuation-mcp`。错误写入 stderr，正常结果写入 stdout。

## 标准流程

### 1. 核对源数据

读取已经解析的 Excel 结构化数据，核对公司名称、报告年度、工作表名称、科目名称和金额。金额多时，将 `sheetList/detail` 保存为 JSON 文件，不在命令行中拼接大量金额。

### 2. 确认项目公司

```bash
node runtime/scripts/financial-statement-import.mjs companies \
  --project-id <项目ID>
```

按公司名称精确匹配目标公司，记录 `companyId`。同名或无法确认时停止，不按列表顺序猜测。

### 3. 预检

```bash
node runtime/scripts/financial-statement-import.mjs prepare \
  --project-id <项目ID> \
  --company-id <公司ID> \
  --file "/本地/原始报表.xlsx" \
  --type balance_sheet \
  --json "/本地/已解析报表.json" \
  --audit 2
```

利润表将 `--type` 改为 `income_statement`。预检结果必须向用户展示：

- 项目、公司和公司名称；
- 报表类型、单体/合并口径和报告年度；
- 所有金额预览；
- 科目映射、跳过的锁定计算行和缺失科目处理方式；
- `confirmationPrompt`；
- `confirmationToken`。

预检默认使用单体 `reportMode=1` 和 `missingSubjectPolicy=preserve_existing`。只有明确要求合并报表时使用 `reportMode=2`。资产负债表无审计证据时使用 `auditType=2`，表示未审定；利润表不传 `auditType`。

### 4. 明确确认后执行

用户查看预检结果并明确确认后，才运行：

```bash
node runtime/scripts/financial-statement-import.mjs execute \
  --token "<预检返回的 confirmationToken>"
```

不得把预检 token 当作 MCP 登录 token 保存。该 token 是短期一次性业务确认凭证，只用于本次执行。

### 5. 回读校验

```bash
node runtime/scripts/financial-statement-import.mjs read \
  --project-id <项目ID> \
  --company-id <公司ID> \
  --type all \
  --report-mode all
```

逐项核对 `existingYears`、`sheetCount`、非空科目数量及关键科目金额。至少核对资产负债表的资产总计、负债合计、所有者权益合计，以及利润表的营业收入、营业成本、净利润。发现差异时保留差异，不宣称导入成功。

### 6. 留痕

完成后更新项目 `项目管理/PROJECT_STATE.md` 和 `项目管理/TASK_LOG.md`，记录源文件、项目/公司、报表类型、年度、预检结果、执行结果和回读差异。不要记录 token。

## JSON 数据格式

```json
{
  "sheetList": [
    {
      "reportYear": 2024,
      "sourceSheetName": "资产负债表",
      "auditType": 2,
      "detail": [
        {"subjectName": "货币资金", "amount": 3106503.06},
        {"subjectName": "应收账款", "amount": "6125397.50", "originName": "应收账款"}
      ]
    }
  ]
}
```

金额可以是数字、数字字符串、带逗号的数字字符串或 `null`。不要在脚本中自行四舍五入、调平或补录金额。

## 默认映射口径

- 营业收入 → 主营业务收入；
- 营业成本 → 主营业务成本；
- 净利润 → 净利润报表数；
- 所得税费用、税金及附加、期间费用等按同名科目直写；
- 锁定计算行由系统预检自动跳过，不能强行写入合计行；
- 文件未提供的可编辑科目默认保留系统已有金额，除非用户明确选择 `set_null`。

## 常见问题

- `MCP_AUTH_REQUIRED` / `TYCPV_AUTH_EXPIRED`：运行 `tycpv login`，不要手工复制 token 到参数中。
- `MCP_TOOL_NOT_AVAILABLE`：检查 valuation-mcp 服务版本和工具清单，不能臆造工具名。
- 金额勾稽不平：列出差异并回到源文件核对，不自动调平。
- 公司匹配不唯一：列出公司 ID、全称和简称，请用户确认。
- 源文件为 OCR 还原：标记为待人工复核，不把 OCR 结果直接写入系统。
- 回读年度或关键金额不一致：导入视为未完成，保留预检和回读证据。
