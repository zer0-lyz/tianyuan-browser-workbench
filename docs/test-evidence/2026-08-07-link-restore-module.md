# 明细表公式恢复模块接入与端到端验证

日期：2026-08-07

## 接入范围

- `skills/asset-link-restore/`（SKILL.md、restore_links.py、audit_restore.py、verify_formulas.py、references/structure.md）
- `native-helper/native_host.js`：`LINK_RESTORE_SCRIPT`、`uniqueLinkRestoreTarget`、
  `runPythonLinkRestoreScript`、`runLinkRestore`、`run_link_restore` 消息路由、self-test 字段。
- `native-helper/install_native_host.sh`：安装运行副本时复制 asset-link-restore。
- `scripts/install-local-runtime.mjs`：print-format-skills 复制清单加入 asset-link-restore。
- `extension/src/sidepanel/index.html`：首页卡片 `openLinkRestore` + 页面 `page-link-restore`（功能 7）。
- `extension/src/sidepanel/sidepanel.js`：elements、`printTaskStates.link`、`printFormatUi("link")`、
  `run_link_restore`/`batch_link_restore` 动作、监听器。
- `tests/link-restore-module.test.cjs`：新增 4 组静态接线测试。

## 静态验证

- `node --check native-helper/native_host.js`、`bash -n install_native_host.sh`、
  `node --check scripts/install-local-runtime.mjs`、`node --check sidepanel.js` 全部通过。
- 全量回归 `37/37` 通过（含新增 link-restore 测试）。

## 端到端烟测（合成模板工作簿）

运行环境：`~/.tianyuan-workbench/python/bin/python3`（Python 3.14）+ openpyxl 3.1.5。

输入：合成“样例公司-明细表.xlsx”，含 `1-汇总表/2-分类汇总/3/4/5/6-分类汇总/3-1货币资金汇总表/3-1-1现金`。

执行 `skills/asset-link-restore/scripts/restore_links.py` 结果：

- 输出《样例公司-明细表_链接恢复.xlsx》与《样例公司-明细表_链接恢复对比报告.xlsx》；
- 共写入链接/公式 18 处，一致 18，不一致 0；
- 叶子表合计验证 1 张，不一致 0。

公式回读（四层链条逐层确认）：

| 层 | 单元格 | 公式 |
|---|---|---|
| 叶子→二级汇总 | 3-1货币资金汇总表 D7 | `='3-1-1现金'!D8` |
| 二级→分类汇总 | 3-流动资产汇总 D7 | `='3-1货币资金汇总表'!D9` |
| 分类→2-分类汇总 | 2-分类汇总 C8 | `='3-流动资产汇总'!D7` |
| 2-分类汇总→1-汇总表 | 1-汇总表 D8 | `='2-分类汇总'!C8/10000` |

## 待办（需用户本机验收）

- 真实天源导出明细表尚未在 Chrome 侧栏“明细表公式恢复”页面实测；建议先用
  单文件 + 副本模式验证，再使用覆盖模式。
- 本机运行副本需重新同步（重跑安装脚本或安装包更新）后生效。
