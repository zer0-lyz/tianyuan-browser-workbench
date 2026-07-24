# MVP 决策：先做只读上下文面板

日期：2026-07-22

## 结论

第一版插件只读取当前天源资产基础法底稿页面上下文，不执行上传、保存或任何写入动作。

## 原因

- 交接包已证明上传弹窗和附件接口可触达，但正式落库仍受编辑锁和 `/assignment_draft/save` 成功回读约束。
- 页面适配器稳定性是后续上传和保存动作的前置条件。
- 只读面板可以先验证 URL 解析、SpreadJS 访问、表头定位、上传 cellType 检测、保存按钮和编辑锁提示。

## 实现边界

- 使用 Chrome Manifest V3。
- 使用 Side Panel 展示上下文。
- Content Script 负责扩展侧通信。
- 页面适配器以脚本标签注入 MAIN world，读取页面内 `GC.Spread.Sheets`。
- 只支持 `https://excel.zhrdc.net/ty/*`。
- 不保存 Cookie、Authorization、密码、验证码或 token。

## 当前采集项

- `projectId`
- `companyId`
- `subjectCode`
- 是否资产基础法底稿路由
- 当前 sheet
- 当前活动单元格
- 第一行表头，最多 120 列
- “查证资料索引”列和目标行单元格
- `operation-upload-cell`、`activateEditor`、`isReadOnly`
- 保存按钮可见性
- 登录、编辑锁和权限相关页面文本

## 后续进入写入前的门禁

- 至少在一个真实天源资产基础法底稿页面上保存 `docs/test-evidence/` 证据。
- 确认“查证资料索引”能通过表头定位，而不是固定列号。
- 确认目标单元格 cellType 为 `operation-upload-cell` 且具备 `activateEditor`。
- 确认编辑锁状态能被面板提示。

