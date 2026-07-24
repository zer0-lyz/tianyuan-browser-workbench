# 天源浏览器插件新项目上下文交接包

整理时间：2026-07-22

## 用途

这个目录用于迁移当前关于“天源系统浏览器插件 / 天源系统浏览器工作台”的全部关键上下文。新开独立项目时，建议把本目录整体复制到新项目的 `docs/context/` 或 `项目管理/` 下，再以此初始化新项目记忆。

## 文件清单

| 文件 | 用途 |
|---|---|
| `天源浏览器插件可行性与架构草案.md` | 插件总体可行性、推荐架构、MVP、风险和路线图 |
| `天源评估核实附件上传能力记录.md` | 已验证的评估核实附件上传链路、接口、规则和限制 |
| `ego_asset_check_upload_template.sh` | ego 脚本化上传模板，可作为插件页面适配器原型参考 |
| `tianyuan-asset-draft-save.SKILL.md` | 现有天源资产基础法底稿保存 skill 说明 |
| `save_asset_draft.js` | 现有 DevTools 控制保存底稿脚本，可迁移保存逻辑 |

## 已验证事实

1. 天源资产基础法底稿页面使用 SpreadJS，页面内可通过 `GC.Spread.Sheets.findControl(document.querySelector('.spreadWrapper'))` 获取工作簿对象。
2. 评估核实阶段的“查证资料索引”不能写死列号，必须按表头定位。
3. “查证资料索引”单元格使用 `operation-upload-cell` 自定义 cellType。
4. 稳定打开上传弹窗的方法是调用 cellType 的 `activateEditor(true, null, null, { sheet, row, col })`。
5. `uploadFile` 只完成前端文件注入；必须触发弹窗“保存”逻辑，才会调用附件上传和分类批次接口。
6. `/ty/api/attach/upload` 成功只代表附件入库。
7. `/ty/api/assignment_draft/cell_file/classify_upload` 成功只代表分类批次生成。
8. `/ty/api/assignment_draft/save` 成功并回读目标字段一致，才算正式底稿落库。
9. 编辑锁是硬门禁。正式插件不能通过前端改只读状态绕过编辑锁。
10. 不要误走 `注释文件/ZSWJ`，评估核实资料上传入口是 `查证资料索引/CZZLSY`。

## 建议新项目结构

```text
tianyuan-browser-workbench/
  README.md
  docs/
    context/
      README.md
      天源浏览器插件可行性与架构草案.md
      天源评估核实附件上传能力记录.md
    decisions/
    test-evidence/
  extension/
    manifest.json
    src/
      background/
      content/
      injected/
      sidepanel/
      shared/
  native-helper/
  skills/
    tianyuan-asset-check-attachment-upload/
    tianyuan-browser-control/
  prototypes/
    ego_asset_check_upload_template.sh
    save_asset_draft.js
```

## 新项目初始化建议

1. 先创建独立仓库或项目目录，例如：

```bash
mkdir -p /Users/zer0y/Library/CloudStorage/OneDrive-个人/共享/Codex/tianyuan-browser-workbench
```

2. 复制本交接包：

```bash
cp -R "/Users/zer0y/Library/CloudStorage/OneDrive-个人/共享/2026-天源/20260529 中显光电/项目管理/_work/tianyuan_browser_extension/context_handoff" \
  "/Users/zer0y/Library/CloudStorage/OneDrive-个人/共享/Codex/tianyuan-browser-workbench/docs/context"
```

3. 在新项目中创建项目记忆文件：

```text
项目管理/AGENTS.md
项目管理/PROJECT_MEMORY.md
项目管理/PROJECT_STATE.md
项目管理/TASK_LOG.md
```

4. 新项目第一轮目标建议：

- 搭建 Chrome Manifest V3 插件骨架。
- 实现 content script 与 MAIN-world injected script 的消息桥。
- 实现“读取当前天源资产基础法页面上下文”。
- 实现“识别当前 sheet、阶段、表头、活动行、编辑锁”。
- 暂不做写入，先只读验证。

## MVP 动作协议草案

```json
{
  "action": "upload_asset_check_attachment",
  "projectId": "165353602809858",
  "companyId": "165353602809933",
  "subjectCode": "C5-10-3",
  "rowNumber": 2,
  "fieldTitle": "查证资料索引",
  "moduleName": "凭证",
  "fileName": "ego_upload_test.pdf",
  "mode": "dry_run"
}
```

## 新项目第一条 AGENTS.md 建议规则

```markdown
# 天源浏览器工作台项目规则

- 先做只读页面适配器，再做写入动作。
- 所有写入动作必须有预演、执行、回读三个阶段。
- 不保存 Cookie、Authorization、密码、验证码或 token。
- 编辑锁不是可绕过问题，正式功能必须停止并提示。
- 不写死坐标、列号或压缩类名；优先使用 URL、表头、字段编码、稳定 DOM 和接口回读。
- 上传功能必须区分：前端文件回显、附件入库、分类批次生成、底稿保存落库。
```

## 下一步

建议新项目从 `extension/` 骨架开始。第一版只实现只读上下文面板，确认可以在天源页面显示：

- 项目 ID
- 主体 ID
- subjectCode
- 当前 sheet
- 当前阶段
- 当前活动单元格
- 是否找到 `查证资料索引`
- 保存按钮是否可用
- 编辑锁显示文本
