# 报告写作 Connector：当前能力与验收边界

**状态：部分实机验收通过；完整报告写作实机验收未通过。** 本文为匿名能力矩阵，不代表全部报告命令或发布门禁已通过。

## 版本与回归证据

- 当前版本：`0.14.35`；build：`2026110101`。
- 最终全量 Node 回归：`403 tests / 395 pass / 0 fail / 8 conditional skip`；结构 / adapter / pipeline 专项 `163/163`，Windows handoff 专项 `1/1`。条件 skip 不计为 pass。
- 当前候选 fingerprint：`b2c3e0fe814d7cb0ae6ecbe92822201bdc8affd295b05d4d684c5a92bf6df50b`。最终源码 commit SHA 以 `v0.14.35` tag 实际指向的 commit 为准；不预填或推测 SHA。

## 接口范围

Sidepanel 通过受限 Connector Bridge 将报告动作路由到当前页面。动作范围包括只读探查与节点读取、导航、预演与执行，以及编辑器开启、命令、保存、关闭和刷新回读。页面路由、报告范围、目标节点和当前 Agent 控制绑定均须匹配；写入动作需经过独立预演与明确确认。

当前 Bridge action type 名称：`report_inspect`、`report_navigate`、`report_node_read`、`report_preview`、`report_execute`、`report_save`、`report_readback`、`report_editor_open`、`report_editor_command`、`report_editor_save`、`report_editor_close`、`report_reload`。动作被枚举或进入路由不代表对应能力已通过实机验收。

本地 Native Helper 持有 pending journal 与报告快照接口，用于在不确定结果时保留 `pendingVerify` 状态，并以精确报告/节点身份、控制绑定和刷新后的回读证据判定是否归档。隔离测试覆盖错配拒绝、重复执行阻止和回读不一致拒绝；这不等于已在真实页面完成保存闭环。运行时 journal、快照和报告正文属于本地数据，不应提交到代码仓库。

## 能力矩阵

| 项目 | 当前证据 | 状态 |
| --- | --- | --- |
| 精确 scope gate / `enter_edit_mode` | 已在绑定页面观察到与本任务匹配的 scope gate | `PASSED; BOUND SCOPE ONLY` |
| 设置编号“否”→“是”及刷新持久化 | 单次提交后刷新，只读核验持久化成功 | `PASSED; SETTINGS ONLY` |
| 冷启动设置打开 | 冷启动后设置打开流程通过 | `PASSED; SETTINGS ONLY` |
| 自动重载绑定恢复 | 自动重载后恢复原绑定；只证明绑定恢复 | `PASSED; BINDING RECOVERY ONLY` |
| 当前结构实机状态 | 新增空子节点已持久化，但标题未写；保留 `titlePending` 保护锁 | `PARTIAL; TITLE NOT WRITTEN` |
| 旧结构 journal 续验 | 严格匹配 legacy 无证据形态的只读入口已验证可读；真实 journal 未修改，须 fresh 完整 scope 与空只读模型证据后才允许 partial 归档 | `READ-ONLY COMPATIBILITY VERIFIED; REAL READBACK PENDING` |
| Legacy 无证据兼容窄修 | 结构 / adapter / pipeline 自动回归通过；不等于已在实机归档或写入标题 | `AUTOMATED REGRESSION PASSED` |
| 标题激活、同级新增、删除 | 完整真实执行与刷新回读尚未完成 | `PENDING REAL ACCEPTANCE` |
| 四种格式操作 | 完整真实执行、保存、刷新与回读尚未完成 | `PENDING REAL ACCEPTANCE` |
| 全部报告命令实机支持 | 回归测试、参数接受或命令枚举不等于实机支持 | `NOT CLAIMED` |

## 测试证据

- 最终全量 `403/395/0/8`、结构 / adapter / pipeline 专项 `163/163`，Windows handoff 专项 `1/1` 通过。条件 skip 不计为通过，代码回归也不替代 Windows 包或真实报告页验收。
- 设置编号“否”→“是”及刷新持久化、冷启动设置打开、自动重载后的绑定恢复已通过；这些结果不代表报告结构或正文保存闭环通过。
- 新增空子节点已持久化但标题未写。旧 journal 缺少 `partialReadbackEvidence`；严格 legacy 只读兼容回归已通过，真实 journal 仅验证可读且未修改。partial 归档仍须 fresh 完整 scope、精确新增 ID、placeholder 与空只读模型证据。`titlePending` 锁保持原样，不清理 journal、不重提保存。
- 当前候选 fingerprint：`b2c3e0fe814d7cb0ae6ecbe92822201bdc8affd295b05d4d684c5a92bf6df50b`；最终 commit SHA 以 `v0.14.35` tag 实际目标为准。

## 剩余边界

- legacy 无证据兼容自动回归已通过；仍由用户安排真实 scope readback / partial 归档及标题激活、同级新增、删除和四种格式的完整实机验收。
- 代码回归门禁通过可用于源码发布流程；不得据此宣称真实报告写作实机全通过或 24 条命令全部支持。
- 当前不发布 `0.14.35` 平台资产，不声称自动更新可发现。本文不包含真实报告、公司或节点标识、报告正文、哈希值或本机私有路径。
