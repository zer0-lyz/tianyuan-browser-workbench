import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bridgeUrl = (process.env.TIANYUAN_CONNECTOR_BRIDGE_URL || "http://127.0.0.1:40415").replace(/\/$/, "");

// 报告动作族共享 schema：绑定参数与 report_inspect 完全一致。
// reportDetailId（页面 detailId 查询参数）为可选明细身份：提供时页面适配器会与 URL 实际值比对，不一致即拒绝。
const reportIdentitySchema = {
  type: "object",
  properties: { projectId: { type: "string" }, companyId: { type: "string" }, reportType: { type: "string" }, mode: { type: "string", enum: ["add", "edit"] }, reportDetailId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,100}$" } },
  required: ["projectId", "companyId", "reportType", "mode"], additionalProperties: false,
};
const reportNodeRefSchema = {
  type: "object",
  properties: { nodePathKey: { type: "string", pattern: "^(?:0|[1-9][0-9]*)(?:/(?:0|[1-9][0-9]*))*$", maxLength: 200 }, label: { type: "string", minLength: 1, maxLength: 240 }, candidateId: { type: "string", pattern: "^[A-Za-z0-9:_-]{1,200}$" } },
  required: ["nodePathKey", "label"], additionalProperties: false,
};
const reportWriteNodeRefSchema = { ...reportNodeRefSchema, required: ["nodePathKey", "label", "candidateId"] };

export const tools = [
  {
    name: "tianyuan.connection_status",
    description: "检查当前 Agent 工作区或对话绑定的天源浏览器 session。必须先调用此工具再读取页面。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        projectPath: { type: "string" },
        threadId: { type: "string" },
        onlyOnline: { type: "boolean", default: true },
        includeSessions: { type: "boolean", default: true }
      },
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.list_sessions",
    description: "列出当前本机 Connector Bridge 中的天源浏览器 session 和绑定摘要。",
    inputSchema: {
      type: "object",
      properties: {
        includeContext: { type: "boolean", default: false }
      },
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.get_context",
    description: "读取一个已确认 session 的天源页面轻量上下文及最近一次安全捕获的选中文字。必须同时传入 sessionId 和 bindingId。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" }
      },
      required: ["sessionId", "bindingId"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.list_capabilities",
    description: "读取天源浏览器连接器的能力矩阵和安全边界。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.report_inspect",
    description: "只读探查已绑定的报告页面；节点身份和树完整性未经验证时明确返回部分结果，不修改报告。写入类动作默认被 Bridge 门禁关闭，需要运行环境显式开启；本工具只读、不受门禁限制。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        offset: { type: "integer", minimum: 0, maximum: 5000, default: 0 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        reportIdentity: {
          type: "object",
          properties: { projectId: { type: "string" }, companyId: { type: "string" }, reportType: { type: "string" }, mode: { type: "string", enum: ["add", "edit"] }, reportDetailId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,100}$" } },
          required: ["projectId", "companyId", "reportType", "mode"], additionalProperties: false,
        },
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity"], additionalProperties: false,
    },
  },
  {
    name: "tianyuan.report_capabilities",
    description: "只读返回当前报告页实时能力、settingsWritableFields 和当前绑定的作用域写门禁状态。设置写入目前仅支持‘是否编号=是’；writeEnabled 仅表示门禁和当前绑定范围匹配，不代表其他编辑操作已实现或验收。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        reportIdentity: {
          type: "object",
          properties: { projectId: { type: "string" }, companyId: { type: "string" }, reportType: { type: "string" }, mode: { type: "string", enum: ["add", "edit"] }, reportDetailId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,100}$" } },
          required: ["projectId", "companyId", "reportType", "mode"], additionalProperties: false,
        },
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity"], additionalProperties: false,
    },
  },
  {
    name: "tianyuan.report_navigate",
    description: "仅做节点树导航和进入编辑态：展开/折叠、选中、逐层定位、搜索/清空都不修改节点结构；enter_edit_mode 只切换编辑态并验证状态。节点新增、复制、移动、删除及属性修改必须另走 report_preview→report_execute，受 Bridge 写门禁和报告作用域约束；nodeRef 须匹配路径与标题。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        op: { type: "string", enum: ["expand", "select", "reveal", "expand_all", "collapse_all", "search", "clear_search", "enter_edit_mode"] },
        nodeRef: reportNodeRefSchema,
        keyword: { type: "string", minLength: 1, maxLength: 120 },
        timeoutMs: { type: "integer", minimum: 200, maximum: 30000 },
        reportIdentity: reportIdentitySchema,
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity", "op"], additionalProperties: false,
    },
  },
  {
    name: "tianyuan.report_node_read",
    description: "只读读取已绑定报告页面指定大纲节点：节点状态、白名单属性对话框字段（include 含 settings）与关联编辑器框架、正文预览和内容哈希（include 含 editor）。verifySaved 用于刷新后核验；设置写入须先经 report_execute 的单字段是否编号=是弹窗确认，再以 report_reload 和同节点 settings_open 后的 verifySaved settings 回读核验。旧版孤立保存恢复仍须按原流程执行。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        nodeRef: reportNodeRefSchema,
        include: { type: "array", items: { type: "string", enum: ["settings", "editor", "structure"] }, maxItems: 4 },
        verifySaved: { type: "boolean", description: "刷新后核验已保存内容或属性；属性核验需 include 含 settings，且目标必须与待核实记录一致。" },
        recoverPendingActionId: { type: "string", pattern: "^action_[A-Za-z0-9_-]{1,100}$" },
        reportIdentity: reportIdentitySchema,
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity", "nodeRef"], additionalProperties: false,
    },
  },
  {
    name: "tianyuan.report_preview",
    description: "只读预演真实报告修改。节点树编辑包括新增子节点/同级节点、复制、移动、删除；设置写入目前仅支持‘是否编号=是’，其他属性值会以 REPORT_SETTINGS_FIELD_UNSUPPORTED 拒绝。展开、折叠、选中、搜索不是结构编辑。每个目标须提供页面返回且当前唯一的 candidateId；该候选值尚未证明跨刷新稳定。返回差异、风险、联动范围、planHash 与内容快照；不写入页面。执行必须再调用 report_execute 并使用结构专用确认；Bridge 写门禁默认关闭。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        ops: {
          type: "array", minItems: 1, maxItems: 50,
          items: {
            type: "object",
            oneOf: [
              {
                properties: { kind: { const: "settings_open" }, nodeRef: reportWriteNodeRefSchema },
                required: ["kind", "nodeRef"], additionalProperties: false,
              },
              {
                properties: {
                  kind: { const: "settings_write" }, nodeRef: reportWriteNodeRefSchema,
                  fields: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", properties: { label: { const: "是否编号" }, value: { const: "是" } }, required: ["label", "value"], additionalProperties: false } },
                },
                required: ["kind", "nodeRef", "fields"], additionalProperties: false,
              },
              {
                properties: {
                  kind: { const: "editor_text" }, nodeRef: reportWriteNodeRefSchema,
                  mode: { type: "string", enum: ["replace_first", "replace_all", "append", "set"] },
                  find: { type: "string", maxLength: 20000 },
                  replace: { type: "string", maxLength: 20000 },
                },
                required: ["kind", "nodeRef", "mode", "replace"], additionalProperties: false,
              },
              {
                properties: { kind: { const: "editor_command" }, nodeRef: reportWriteNodeRefSchema, find: { type: "string", minLength: 1, maxLength: 20000 }, command: { type: "string", enum: ["bold", "italic", "underline", "strikethrough", "subscript", "superscript", "font_increase", "font_decrease", "align_left", "align_center", "align_right", "align_justify", "indent", "outdent"] } },
                required: ["kind", "nodeRef", "command"], additionalProperties: false,
              },
              {
                properties: { kind: { const: "editor_command" }, nodeRef: reportWriteNodeRefSchema, find: { type: "string", minLength: 1, maxLength: 20000 }, command: { const: "font_color" }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" } },
                required: ["kind", "nodeRef", "command", "color"], additionalProperties: false,
              },
              {
                properties: {
                  kind: { const: "structure_add" }, nodeRef: reportWriteNodeRefSchema,
                  position: { type: "string", enum: ["child", "after", "before"] },
                  title: { type: "string", minLength: 1, maxLength: 240 },
                },
                required: ["kind", "nodeRef", "position", "title"], additionalProperties: false,
              },
              {
                properties: { kind: { const: "structure_add_child" }, nodeRef: reportWriteNodeRefSchema, title: { type: "string", minLength: 1, maxLength: 240 } },
                required: ["kind", "nodeRef", "title"], additionalProperties: false,
              },
              {
                properties: { kind: { const: "structure_add_sibling" }, nodeRef: reportWriteNodeRefSchema, title: { type: "string", minLength: 1, maxLength: 240 } },
                required: ["kind", "nodeRef", "title"], additionalProperties: false,
              },
              {
                properties: { kind: { const: "structure_copy" }, nodeRef: reportWriteNodeRefSchema, title: { type: "string", maxLength: 240 } },
                required: ["kind", "nodeRef"], additionalProperties: false,
              },
              {
                properties: { kind: { const: "structure_move" }, nodeRef: reportWriteNodeRefSchema, direction: { type: "string", enum: ["up", "down"] } },
                required: ["kind", "nodeRef", "direction"], additionalProperties: false,
              },
              {
                properties: { kind: { const: "structure_delete" }, nodeRef: reportWriteNodeRefSchema, opConfirm: { type: "boolean" } },
                required: ["kind", "nodeRef"], additionalProperties: false,
              },
            ],
          },
        },
        reportIdentity: reportIdentitySchema,
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity", "ops"], additionalProperties: false,
    },
  },
  {
    name: "tianyuan.report_execute",
    description: "在 Bridge 写门禁开启后执行已预演的报告修改；确认文本须与预演返回的 confirmationRequired 逐字一致。结构修改须单独预演并使用\"确认执行报告结构修改\"，其他修改使用\"确认执行报告修改\"。单字段是否编号=是会在回显校验后仅确认一次并返回 pendingVerify；刷新核验前不得宣称已保存。必须先取得 planHash；结果不明时禁止盲目重试。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        planHash: { type: "string", minLength: 1, maxLength: 128 },
        confirmText: { type: "string", enum: ["确认执行报告修改", "确认执行报告结构修改"] },
        reportIdentity: reportIdentitySchema,
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity", "planHash", "confirmText"], additionalProperties: false,
    },
  },
  {
    name: "tianyuan.report_save",
    description: "在 Bridge 写门禁开启（TIANYUAN_REPORT_WRITE_GATE_OPEN=1，门禁关闭时返回 REPORT_WRITE_GATE_CLOSED；写入默认被 Bridge 门禁关闭，需要运行环境显式开启）且确认文本精确匹配（\"确认保存报告\"）后，点击报告页真实保存按钮一次（绝不重试），并以保存提示或网络证据回读验证（saved/pendingVerify）。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        confirmText: { type: "string", const: "确认保存报告" },
        reportIdentity: reportIdentitySchema,
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity", "confirmText"], additionalProperties: false,
    },
  },
  {
    name: "tianyuan.report_editor",
    description: "受控操作报告节点编辑框：open 开启，save 和 close 受安全门禁保护；直接 command 返回 REPORT_PREVIEW_REQUIRED。基本文字格式须先通过 report_preview 的 editor_command 预演并用 report_execute 执行。保存与实机写入尚未验证，结果不明不得重试。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        op: { type: "string", enum: ["open", "command", "save", "close"] },
        nodeRef: reportNodeRefSchema,
        command: { type: "string", enum: ["bold", "italic", "underline", "strikethrough", "font_increase", "font_decrease", "font_color", "align_center", "align_left", "align_right", "align_justify", "indent", "outdent", "table", "image", "formula", "field", "reference", "list_ordered", "list_unordered", "undo", "redo", "subscript", "superscript"] },
        timeoutMs: { type: "integer", minimum: 200, maximum: 30000 },
        discardConfirmed: { type: "boolean", default: false },
        confirmText: { type: "string" },
        legacyRecovery: {
          type: "object", additionalProperties: false,
          properties: {
            actionId: { type: "string" }, appendedText: { type: "string", minLength: 1, maxLength: 20000 },
            originalSnapshot: { type: "object", additionalProperties: false, properties: { snapshotId: { type: "string" }, sha256: { type: "string" }, bytes: { type: "integer" } }, required: ["snapshotId", "sha256", "bytes"] },
            currentSnapshot: { type: "object", additionalProperties: false, properties: { snapshotId: { type: "string" }, sha256: { type: "string" }, bytes: { type: "integer" } }, required: ["snapshotId", "sha256", "bytes"] },
          },
          required: ["actionId", "appendedText", "originalSnapshot", "currentSnapshot"],
        },
        reportIdentity: reportIdentitySchema,
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity", "op"], additionalProperties: false,
    },
  },
  {
    name: "tianyuan.report_reload",
    description: "仅对已提交节点保存且等待回读的报告刷新一次；调用前必须确认报告没有其他需保留的未保存内容。刷新请求不证明保存成功，随后须以 verifySaved 回读核验。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 }, reportIdentity: reportIdentitySchema, nodeRef: reportWriteNodeRefSchema,
        confirmText: { type: "string", const: "确认刷新并核验已保存报告" },
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity", "nodeRef", "confirmText"], additionalProperties: false,
    },
  },
  {
    name: "tianyuan.report_readback",
    description: "只读回读已绑定报告页面的最新内容哈希与节点内容哈希/正文预览（可用 nodeRefs 过滤），用于执行或保存后的校验；不修改页面，不宣称持久化成功。写入默认被 Bridge 门禁关闭，需要运行环境显式开启；本工具只读、不受门禁限制。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        nodeRefs: { type: "array", maxItems: 200, items: reportNodeRefSchema },
        reportIdentity: reportIdentitySchema,
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity"], additionalProperties: false,
    },
  },
  {
    name: "tianyuan.edit_block_preview",
    description: "只读预演当前已绑定天源页面中的一个 contenteditable 编辑块，返回原文、新文、差异、哈希和保存风险；不会写入页面。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        blockId: { type: "string", minLength: 1, maxLength: 500 },
        expectedHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" },
        expectedText: { type: "string", maxLength: 200000 },
        replacementText: { type: "string", maxLength: 200000 }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "blockId", "replacementText"],
      anyOf: [{ required: ["expectedHash"] }, { required: ["expectedText"] }],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.edit_block_execute",
    description: "在明确确认后，将预演中的替换文本写入当前唯一授权的 contenteditable 编辑块，触发真实编辑事件、回读并验证保存；禁止任意 DOM 或脚本操作。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        blockId: { type: "string", minLength: 1, maxLength: 500 },
        expectedHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" },
        expectedText: { type: "string", maxLength: 200000 },
        replacementText: { type: "string", maxLength: 200000 },
        previewActionId: { type: "string", minLength: 1 },
        confirmText: { type: "string", const: "确认修改编辑块" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "blockId", "replacementText", "previewActionId", "confirmText"],
      anyOf: [{ required: ["expectedHash"] }, { required: ["expectedText"] }],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.edit_block_readback",
    description: "只读回读当前绑定页面指定编辑块的内容、哈希和有效性，不修改页面。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        tabId: { type: "integer", minimum: 0 },
        blockId: { type: "string", minLength: 1, maxLength: 500 },
        expectedHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" },
        expectedText: { type: "string", maxLength: 200000 }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "blockId"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.edit_block_format_preview",
    description: "只读预演已绑定 contenteditable 编辑块的文本格式、背景高亮、行高和缩进变化，不写入页面。highlightColor 支持 transparent/none 或 #RRGGBB。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" }, tabId: { type: "integer", minimum: 0 }, blockId: { type: "string", minLength: 1, maxLength: 500 },
        expectedHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" }, expectedText: { type: "string", maxLength: 200000 },
        format: { type: "object", properties: { fontWeight: { type: "string", enum: ["normal", "bold"] }, fontStyle: { type: "string", enum: ["normal", "italic"] }, textDecoration: { type: "string", enum: ["none", "underline", "line-through"] }, textAlign: { type: "string", enum: ["left", "center", "right", "justify"] }, fontSizePx: { type: "integer", minimum: 8, maximum: 72 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, highlightColor: { type: "string", pattern: "^(?:transparent|none|#[0-9a-fA-F]{6})$" }, lineHeightPx: { type: "integer", minimum: 12, maximum: 200 }, indentPx: { type: "integer", minimum: 0, maximum: 400 } }, additionalProperties: false }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "blockId", "format"],
      anyOf: [{ required: ["expectedHash"] }, { required: ["expectedText"] }],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.edit_block_format_execute",
    description: "在固定确认文本和唯一控制权下设置已绑定编辑块的白名单文本格式及背景高亮，回读并验证保存；highlightColor 支持 transparent/none 或 #RRGGBB。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" }, tabId: { type: "integer", minimum: 0 }, blockId: { type: "string", minLength: 1, maxLength: 500 },
        expectedHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" }, expectedText: { type: "string", maxLength: 200000 },
        format: { type: "object", properties: { fontWeight: { type: "string", enum: ["normal", "bold"] }, fontStyle: { type: "string", enum: ["normal", "italic"] }, textDecoration: { type: "string", enum: ["none", "underline", "line-through"] }, textAlign: { type: "string", enum: ["left", "center", "right", "justify"] }, fontSizePx: { type: "integer", minimum: 8, maximum: 72 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, highlightColor: { type: "string", pattern: "^(?:transparent|none|#[0-9a-fA-F]{6})$" }, lineHeightPx: { type: "integer", minimum: 12, maximum: 200 }, indentPx: { type: "integer", minimum: 0, maximum: 400 } }, additionalProperties: false },
        previewActionId: { type: "string", minLength: 1 }, confirmText: { type: "string", const: "确认设置编辑格式" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "blockId", "format", "previewActionId", "confirmText"],
      anyOf: [{ required: ["expectedHash"] }, { required: ["expectedText"] }],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.edit_block_format_readback",
    description: "只读回读已绑定编辑块的文本格式、背景高亮、行高和缩进。",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" }, tabId: { type: "integer", minimum: 0 }, blockId: { type: "string", minLength: 1, maxLength: 500 }, expectedHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" }, expectedText: { type: "string", maxLength: 200000 } },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "blockId"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.table_preview",
    description: "只读预演已授权编辑块内的表格插入、单元格修改或表格格式设置。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" }, tabId: { type: "integer", minimum: 0 }, blockId: { type: "string", minLength: 1, maxLength: 500 }, expectedHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" }, caretReference: { type: "object", properties: { mode: { type: "string", const: "caret" }, baseId: { type: "string", maxLength: 500 }, blockId: { type: "string", maxLength: 500 }, containerPath: { type: "string", maxLength: 1000 }, domPath: { type: "string", maxLength: 1000 }, textOffset: { type: "integer", minimum: 0 } }, required: ["mode", "containerPath", "domPath", "textOffset"], additionalProperties: false }, tableAction: { type: "string", enum: ["insert", "update_cell", "format"] }, tableId: { type: "string", maxLength: 500 }, expectedTableHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" }, rowIndex: { type: "integer", minimum: 0, maximum: 49 }, columnIndex: { type: "integer", minimum: 0, maximum: 19 }, cellText: { type: "string", maxLength: 5000 }, rowCount: { type: "integer", minimum: 1, maximum: 50 }, columnCount: { type: "integer", minimum: 1, maximum: 20 }, cells: { type: "array", maxItems: 50, items: { type: "array", maxItems: 20, items: { type: "string", maxLength: 5000 } } }, tableFormat: { type: "object", properties: { rowHeightPx: { type: "integer", minimum: 16, maximum: 160 }, columnWidthPx: { type: "integer", minimum: 24, maximum: 600 }, borderStyle: { type: "string", enum: ["none", "solid", "dashed", "dotted"] }, borderColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, textAlign: { type: "string", enum: ["left", "center", "right", "justify"] }, verticalAlign: { type: "string", enum: ["top", "middle", "bottom"] }, fontSizePx: { type: "integer", minimum: 8, maximum: 72 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, fontWeight: { type: "string", enum: ["normal", "bold"] }, fontStyle: { type: "string", enum: ["normal", "italic"] } }, additionalProperties: false }, formatScope: { type: "string", enum: ["table", "row", "cell"], default: "table" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "blockId", "tableAction"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.table_execute",
    description: "在固定确认文本、唯一控制权和表格内容哈希未变化时，执行表格操作并回读验证保存。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" }, tabId: { type: "integer", minimum: 0 }, blockId: { type: "string", minLength: 1, maxLength: 500 }, expectedHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" }, caretReference: { type: "object", properties: { mode: { type: "string", const: "caret" }, baseId: { type: "string", maxLength: 500 }, blockId: { type: "string", maxLength: 500 }, containerPath: { type: "string", maxLength: 1000 }, domPath: { type: "string", maxLength: 1000 }, textOffset: { type: "integer", minimum: 0 } }, required: ["mode", "containerPath", "domPath", "textOffset"], additionalProperties: false }, tableAction: { type: "string", enum: ["insert", "update_cell", "format"] }, tableId: { type: "string", maxLength: 500 }, expectedTableHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" }, rowIndex: { type: "integer", minimum: 0, maximum: 49 }, columnIndex: { type: "integer", minimum: 0, maximum: 19 }, cellText: { type: "string", maxLength: 5000 }, rowCount: { type: "integer", minimum: 1, maximum: 50 }, columnCount: { type: "integer", minimum: 1, maximum: 20 }, cells: { type: "array", maxItems: 50, items: { type: "array", maxItems: 20, items: { type: "string", maxLength: 5000 } } }, tableFormat: { type: "object", properties: { rowHeightPx: { type: "integer", minimum: 16, maximum: 160 }, columnWidthPx: { type: "integer", minimum: 24, maximum: 600 }, borderStyle: { type: "string", enum: ["none", "solid", "dashed", "dotted"] }, borderColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, textAlign: { type: "string", enum: ["left", "center", "right", "justify"] }, verticalAlign: { type: "string", enum: ["top", "middle", "bottom"] }, fontSizePx: { type: "integer", minimum: 8, maximum: 72 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, fontWeight: { type: "string", enum: ["normal", "bold"] }, fontStyle: { type: "string", enum: ["normal", "italic"] } }, additionalProperties: false }, formatScope: { type: "string", enum: ["table", "row", "cell"], default: "table" }, previewActionId: { type: "string", minLength: 1 }, confirmText: { type: "string", const: "确认执行表格操作" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "blockId", "tableAction", "previewActionId", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.table_readback",
    description: "只读回读已授权编辑块内表格的结构、单元格内容、格式和哈希。",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" }, bindingId: { type: "string" }, projectId: { type: "string" }, threadId: { type: "string" }, tabId: { type: "integer", minimum: 0 }, blockId: { type: "string", minLength: 1, maxLength: 500 }, tableId: { type: "string", minLength: 1, maxLength: 500 }, expectedTableHash: { type: "string", pattern: "^fnv1a32-[0-9a-fA-F]{8}$" } },
      required: ["sessionId", "bindingId", "projectId", "threadId", "tabId", "blockId", "tableId"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.preview_batch_save",
    description: "通过已绑定的天源资产基础法底稿页面预演批量保存。逐个科目读取页面状态和保存按钮，不点击保存、不修改底稿。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCodes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100, description: "要预演的科目代码，支持 C3-1-2、tree:科目名称 或 treepath:父级/科目名称。" },
        companyScope: { type: "string", enum: ["current", "partial", "all"], default: "current" },
        companyFilters: { type: "array", items: { type: "string" }, maxItems: 100 },
        selectedCompanies: { type: "array", items: { type: "object" }, maxItems: 100 },
        companyValues: { type: "array", items: { type: "string" }, maxItems: 100 }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCodes"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.execute_batch_save",
    description: "在用户明确确认后，通过已绑定的天源资产基础法底稿页面逐科目点击保存并回传每个科目的页面成功证据。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCodes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 },
        companyScope: { type: "string", enum: ["current", "partial", "all"], default: "current" },
        companyFilters: { type: "array", items: { type: "string" }, maxItems: 100 },
        selectedCompanies: { type: "array", items: { type: "object" }, maxItems: 100 },
        companyValues: { type: "array", items: { type: "string" }, maxItems: 100 },
        confirmText: { type: "string", const: "确认批量保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCodes", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.preview_batch_exit_edit",
    description: "通过已绑定的天源资产基础法底稿页面预演批量退出编辑。逐个科目读取退出编辑按钮，不点击、不修改底稿。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCodes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 },
        companyScope: { type: "string", enum: ["current", "partial", "all"], default: "current" },
        companyFilters: { type: "array", items: { type: "string" }, maxItems: 100 },
        selectedCompanies: { type: "array", items: { type: "object" }, maxItems: 100 },
        companyValues: { type: "array", items: { type: "string" }, maxItems: 100 }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCodes"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.execute_batch_exit_edit",
    description: "在用户明确确认后，通过已绑定的天源资产基础法底稿页面逐科目点击退出编辑并回传每个科目的页面成功证据。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCodes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 },
        companyScope: { type: "string", enum: ["current", "partial", "all"], default: "current" },
        companyFilters: { type: "array", items: { type: "string" }, maxItems: 100 },
        selectedCompanies: { type: "array", items: { type: "object" }, maxItems: 100 },
        companyValues: { type: "array", items: { type: "string" }, maxItems: 100 },
        confirmText: { type: "string", const: "确认批量退出编辑" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCodes", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.preview_audit_attachment_upload",
    description: "通过已绑定的天源浏览器页面预演评估核实附件上传。只定位科目、行和查证资料索引上传分类，不注入文件、不上传、不保存。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示使用浏览器当前打开的科目，不主动导航。" },
        rowNumber: { type: "integer", minimum: 2 },
        fieldTitle: { type: "string", const: "查证资料索引", default: "查证资料索引" },
        procedureText: { type: "string", description: "可选。若目标行“查证类核实程序”为空，先填写该程序再上传。" },
        moduleName: { type: "string" },
        moduleIndex: { type: "integer", minimum: 0, maximum: 20, default: 0 }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumber"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.upload_audit_attachment",
    description: "通过已绑定的天源浏览器页面，将一个本地附件上传到资产基础法底稿评估核实的查证资料索引分类，并点击底稿保存。必须明确确认，且编辑锁、上传、分类、保存和单元格回读全部通过才算成功。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示使用浏览器当前打开的科目，不主动导航。" },
        rowNumber: { type: "integer", minimum: 2 },
        fieldTitle: { type: "string", const: "查证资料索引", default: "查证资料索引" },
        procedureText: { type: "string", description: "可选。若目标行“查证类核实程序”为空，先填写该程序再上传。" },
        moduleName: { type: "string" },
        moduleIndex: { type: "integer", minimum: 0, maximum: 20, default: 0 },
        filePath: { type: "string" },
        confirmText: { type: "string", const: "确认上传并保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumber", "filePath", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.batch_upload_audit_attachments",
    description: "通过已绑定的天源浏览器页面，按行顺序批量上传同一个本地测试附件到多行查证资料索引，并对每行分别验证上传、分类、保存和回读。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示使用浏览器当前打开的科目，不主动导航。" },
        rowNumbers: { type: "array", items: { type: "integer", minimum: 2 }, minItems: 1, maxItems: 50 },
        fieldTitle: { type: "string", const: "查证资料索引", default: "查证资料索引" },
        procedureText: { type: "string", description: "可选。若目标行“查证类核实程序”为空，先填写该程序再上传。" },
        moduleName: { type: "string" },
        moduleIndex: { type: "integer", minimum: 0, maximum: 20, default: 0 },
        filePath: { type: "string" },
        confirmText: { type: "string", const: "确认批量上传并保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumbers", "filePath", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.clear_audit_test_rows",
    description: "仅清理指定行已确认的测试资料索引、查证类核实程序和查证核对情况，保存并逐行回读。必须提供当前资料索引值以防误清理。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示当前打开科目。" },
        rowNumbers: { type: "array", items: { type: "integer", minimum: 2 }, minItems: 1, maxItems: 100 },
        expectedIndexValues: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 },
        fieldTitle: { type: "string", const: "查证资料索引", default: "查证资料索引" },
        confirmText: { type: "string", const: "确认清理测试数据并保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumbers", "expectedIndexValues", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.inspect_audit_check_row",
    description: "读取当前或指定科目某一行的查证核对情况、单元格类型、下拉选项和相邻表头，不修改底稿。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示当前打开科目。" },
        rowNumber: { type: "integer", minimum: 2 },
        fieldTitle: { type: "string", const: "查证核对情况", default: "查证核对情况" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumber"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.set_audit_check_result",
    description: "将当前或指定科目某一行的查证核对情况设置为系统允许的选项，点击底稿保存并回读。只允许修改查证核对情况字段。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示当前打开科目。" },
        rowNumber: { type: "integer", minimum: 2 },
        fieldTitle: { type: "string", const: "查证核对情况", default: "查证核对情况" },
        resultText: { type: "string" },
        confirmText: { type: "string", const: "确认填写核对情况并保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumber", "resultText", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.scan_audit_index_check_rows",
    description: "批量扫描当前或指定科目的查证资料索引和查证核对情况，只读取，不修改底稿。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示当前打开科目。" },
        fieldTitle: { type: "string", const: "查证资料索引", default: "查证资料索引" },
        maxRows: { type: "integer", minimum: 2, maximum: 5000, default: 500 }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.batch_set_audit_check_results",
    description: "批量将有查证资料索引但查证核对情况为空的行填写为指定结论，点击底稿保存并回读。只允许修改查证核对情况字段。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示当前打开科目。" },
        fieldTitle: { type: "string", const: "查证核对情况", default: "查证核对情况" },
        resultText: { type: "string" },
        rowNumbers: { type: "array", items: { type: "integer", minimum: 2 }, maxItems: 1000 },
        maxRows: { type: "integer", minimum: 2, maximum: 5000, default: 500 },
        confirmText: { type: "string", const: "确认批量填写核对情况并保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "resultText", "confirmText"],
      additionalProperties: false
    }
  }
];

let agentIdentityPromise = null;
let agentRegistrationPromise = null;

function readAgentConfig() {
  const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const candidates = [
    process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH,
    path.join(runtimeRoot, "agent-config.json"),
    path.resolve(process.cwd(), "runtime", "agent-config.json"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (value?.providerId && value?.installationId && value?.credentialRef) return value;
    } catch {
      // Continue to the next local runtime configuration candidate.
    }
  }
  return {
    providerId: process.env.TIANYUAN_CONNECTOR_PROVIDER_ID || "",
    installationId: process.env.TIANYUAN_CONNECTOR_INSTALLATION_ID || "",
    credentialRef: process.env.TIANYUAN_CONNECTOR_CREDENTIAL_REF || "",
  };
}

function resolveCredential(reference) {
  const ref = String(reference || "");
  if (ref.startsWith("keychain:")) {
    const [, service, account] = ref.split(":");
    if (!service || !account) return "";
    try {
      return execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "";
    }
  }
  if (ref.startsWith("file:")) {
    const [filePath, key] = ref.slice(5).split("#");
    try {
      const values = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return String(values?.secrets?.[key] || values?.[key] || "");
    } catch {
      return "";
    }
  }
  return "";
}

async function getAgentIdentity() {
  if (!agentIdentityPromise) {
    agentIdentityPromise = Promise.resolve().then(() => {
      const config = readAgentConfig();
      if (!config.providerId || !config.installationId || !config.credentialRef) {
        throw Object.assign(new Error("Agent runtime configuration is missing."), { code: "AGENT_CONFIG_NOT_FOUND" });
      }
      const credential = resolveCredential(config.credentialRef);
      if (!credential) {
        throw Object.assign(new Error("Agent credential is unavailable from its local credentialRef."), { code: "AGENT_CREDENTIAL_UNAVAILABLE" });
      }
      return {
        providerId: String(config.providerId),
        installationId: String(config.installationId),
        credential,
      };
    });
  }
  return agentIdentityPromise;
}

async function request(pathname, options = {}) {
  const identity = await getAgentIdentity();
  const response = await fetch(`${bridgeUrl}${pathname}`, {
    cache: "no-store",
    ...options,
    headers: {
      "content-type": "application/json",
      "x-tianyuan-agent-provider": identity.providerId,
      "x-tianyuan-agent-installation": identity.installationId,
      "x-tianyuan-agent-credential": identity.credential,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    const failure = new Error(payload?.reason || `TIANYUAN_CONNECTOR_HTTP_${response.status}`);
    failure.code = payload?.reason || "TIANYUAN_CONNECTOR_REQUEST_FAILED";
    failure.details = payload;
    throw failure;
  }
  return payload;
}

async function ensureAgentRegistered() {
  if (!agentRegistrationPromise) {
    agentRegistrationPromise = registerAgentSource()
      .catch((cause) => {
        agentRegistrationPromise = null;
        throw cause;
      });
  }
  return agentRegistrationPromise;
}

export async function registerAgentSource() {
  return await request("/api/agent-sources/register", { method: "POST", body: "{}" });
}

function bindingCandidates(session) {
  const bindings = Array.isArray(session?.agentBindings) ? session.agentBindings : [];
  if (bindings.length) return bindings;
  return session?.codexBinding ? [session.codexBinding] : [];
}

function bindingSort(left, right) {
  if (left.accessMode !== right.accessMode) return left.accessMode === "control" ? -1 : 1;
  return String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""));
}

function bindingMatches(session, binding, input = {}) {
  if (!binding) return false;
  if (input.sessionId && session.sessionId !== input.sessionId) return false;
  if (input.bindingId && binding.bindingId !== input.bindingId) return false;
  if (input.workspaceId && (binding.workspaceId || binding.projectId) !== input.workspaceId) return false;
  if (input.projectId && ![binding.workspaceId, binding.projectId, binding.pageProjectId, session?.binding?.projectId].filter(Boolean).includes(input.projectId)) return false;
  if (input.workspacePath && normalizePath(binding.workspacePath || binding.projectPath) !== normalizePath(input.workspacePath)) return false;
  if (input.projectPath && normalizePath(binding.workspacePath || binding.projectPath) !== normalizePath(input.projectPath)) return false;
  const scope = binding.scope === "workspace" || binding.scope === "project" ? "workspace" : "conversation";
  if (scope !== "workspace" && input.conversationId && (binding.conversationId || binding.threadId) !== input.conversationId) return false;
  if (scope !== "workspace" && input.threadId && (binding.conversationId || binding.threadId) !== input.threadId) return false;
  return true;
}

function bindingFor(session, input = {}) {
  const candidates = bindingCandidates(session);
  if (input.bindingId) return candidates.find((binding) => binding.bindingId === input.bindingId) || null;
  const matching = candidates.filter((binding) => bindingMatches(session, binding, input));
  return [...(matching.length ? matching : candidates)].sort(bindingSort)[0] || null;
}

function codexCompatibility(binding) {
  if (!binding || (binding.providerId && binding.providerId !== "codex")) return null;
  return {
    bindingId: binding.bindingId,
    projectId: binding.workspaceId || binding.projectId || "",
    projectName: binding.workspaceName || binding.projectName || "",
    projectPath: binding.workspacePath || binding.projectPath || "",
    threadId: binding.conversationId || binding.threadId || "",
    threadTitle: binding.conversationTitle || binding.threadTitle || "",
    scope: binding.scope === "workspace" || binding.scope === "project" ? "project" : "thread",
    createdAt: binding.createdAt || null,
    updatedAt: binding.updatedAt || null,
  };
}

function actionAuthQuery(input) {
  return new URLSearchParams({
    workspaceId: input.workspaceId || "",
    conversationId: input.conversationId || input.threadId || "",
    projectId: input.projectId || "",
    threadId: input.threadId || "",
  }).toString();
}

async function waitForAction(sessionId, actionId, input, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const query = actionAuthQuery(input);
  while (Date.now() < deadline) {
    const payload = await request(`/api/sessions/${encodeURIComponent(sessionId)}/actions/${encodeURIComponent(actionId)}?${query}`);
    if (["completed", "failed", "cancelled", "pendingVerify"].includes(payload.action?.status)) return payload.action;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Object.assign(new Error("等待天源浏览器页面执行超时。请确认工作台侧栏保持打开。"), { code: "TIANYUAN_BROWSER_ACTION_TIMEOUT" });
}

async function runBrowserAction(name, input) {
  const sessionsPayload = await request("/api/sessions");
  const session = requireBoundSession(sessionsPayload.sessions || [], input);
  if (name.startsWith("tianyuan.report_") && !session.context?.reportAuthoring?.inspectAvailable) {
    throw Object.assign(new Error("当前扩展未提供报告只读探查能力。"), { code: "REPORT_ADAPTER_NOT_AVAILABLE" });
  }
  const action = {
    "tianyuan.preview_batch_save": "preview_batch_save",
    "tianyuan.execute_batch_save": "batch_save_asset_draft",
    "tianyuan.preview_batch_exit_edit": "preview_batch_exit_edit",
    "tianyuan.execute_batch_exit_edit": "batch_exit_edit",
    "tianyuan.upload_audit_attachment": "upload_audit_attachment",
    "tianyuan.batch_upload_audit_attachments": "batch_upload_audit_attachments",
    "tianyuan.clear_audit_test_rows": "clear_audit_test_rows",
    "tianyuan.preview_audit_attachment_upload": "preview_audit_attachment_upload",
    "tianyuan.inspect_audit_check_row": "inspect_audit_check_row",
    "tianyuan.set_audit_check_result": "set_audit_check_result",
    "tianyuan.scan_audit_index_check_rows": "scan_audit_index_check_rows",
    "tianyuan.batch_set_audit_check_results": "batch_set_audit_check_results",
    "tianyuan.edit_block_preview": "edit_block_preview",
    "tianyuan.edit_block_execute": "edit_block_execute",
    "tianyuan.edit_block_readback": "edit_block_readback",
    "tianyuan.edit_block_format_preview": "edit_block_format_preview",
    "tianyuan.edit_block_format_execute": "edit_block_format_execute",
    "tianyuan.edit_block_format_readback": "edit_block_format_readback",
    "tianyuan.table_preview": "table_preview",
    "tianyuan.table_execute": "table_execute",
    "tianyuan.table_readback": "table_readback",
    "tianyuan.report_inspect": "report_inspect",
    "tianyuan.report_navigate": "report_navigate",
    "tianyuan.report_node_read": "report_node_read",
    "tianyuan.report_preview": "report_preview",
    "tianyuan.report_execute": "report_execute",
    "tianyuan.report_save": "report_save",
    "tianyuan.report_readback": "report_readback",
    "tianyuan.report_reload": "report_reload",
  }[name]
  // report_editor 是单一工具带 op 参数，映射为页面适配器的四个生命周期动作
  ?? (name === "tianyuan.report_editor" && ["open", "command", "save", "close"].includes(String(input?.op))
    ? `report_editor_${input.op}`
    : undefined);
  const submitted = await request(`/api/sessions/${encodeURIComponent(input.sessionId)}/actions`, {
    method: "POST",
    body: JSON.stringify({ ...input, action }),
  });
  let result;
  try {
    result = await waitForAction(
      input.sessionId,
      submitted.action.actionId,
      input,
      ["upload_audit_attachment", "batch_upload_audit_attachments", "clear_audit_test_rows", "set_audit_check_result", "batch_set_audit_check_results", "batch_save_asset_draft", "batch_exit_edit"].includes(action) ? 300000 : (["edit_block_execute", "edit_block_format_execute", "table_execute", "report_execute", "report_save", "report_editor_command", "report_editor_save"].includes(action) ? 90000 : 30000),
    );
  } catch (error) {
    if (!action?.startsWith("report_")) throw error;
    try {
      const stopped = await request(`/api/sessions/${encodeURIComponent(input.sessionId)}/actions/${encodeURIComponent(submitted.action.actionId)}/cancel`, { method: "POST", body: JSON.stringify({ projectId: input.projectId, threadId: input.threadId, workspaceId: input.workspaceId, conversationId: input.conversationId }) });
      result = stopped.action;
    } catch {
      result = { actionId: submitted.action.actionId, type: action, status: "pendingVerify", result: { ok: false, status: "pendingVerify", reason: "REPORT_ACTION_OUTCOME_UNKNOWN", security: { credentialsReturned: false } } };
    }
  }
  return {
    ok: result.status === "completed" && result.result?.ok === true,
    action: result,
    security: { browserScriptExecution: true, arbitraryJavaScript: false, credentialsReturned: false },
  };
}

function sessionSummary(session, includeContext = false, input = {}) {
  const page = session.binding || {};
  const binding = bindingFor(session, input);
  const reportContext = session.context?.reportAuthoring || {};
  const reportV2Available = reportContext.inspectAvailable && reportContext.adapterVersion === "report-authoring-v2";
  const scopedWriteEnabled = Boolean(reportV2Available && binding?.reportWriteGate?.open && binding?.reportWriteGate?.scopeMatches);
  const reportOperations = reportContext.inspectAvailable ? ["inspect"] : [];
  if (reportV2Available) reportOperations.push("node_read", "preview", "readback");
  if (scopedWriteEnabled) reportOperations.push("editor_open", "execute", "editor_save", "editor_close", "reload");
  const summary = {
    sessionId: session.sessionId,
    status: session.status,
    lastSeenAt: session.lastSeenAt,
    page: {
      projectId: page.projectId || "",
      companyId: page.companyId || "",
      subjectCode: page.subjectCode || "",
      pageType: page.pageType || "",
      tabId: page.tabId ?? null,
    },
    binding: binding ? {
      bindingId: binding.bindingId,
      agentId: binding.agentId || "",
      providerId: binding.providerId || "codex",
      displayName: binding.displayName || "Codex",
      installationId: binding.installationId || "",
      workspaceId: binding.workspaceId || binding.projectId || "",
      workspaceName: binding.workspaceName || binding.projectName || "",
      workspacePath: binding.workspacePath || binding.projectPath || "",
      conversationId: binding.conversationId || binding.threadId || "",
      conversationTitle: binding.conversationTitle || binding.threadTitle || "",
      scope: binding.scope || "conversation",
      accessMode: binding.accessMode || "read",
    } : null,
    capabilities: {
      ...(session.capabilities || {}),
      reportAuthoring: {
        supported: Boolean(reportContext.inspectAvailable),
        level: scopedWriteEnabled ? "confirm" : "read",
        adapterVersion: reportContext.adapterVersion || null,
        supportedOperations: reportOperations,
        pageCapabilities: reportContext.v2 || null,
        livePageVerified: false,
        writeEnabled: scopedWriteEnabled,
      },
    },
  };
  if (session.codexBinding) summary.codexBinding = binding?.providerId === "codex" ? codexCompatibility(binding) : session.codexBinding;
  if (includeContext) summary.context = session.context || {};
  return summary;
}

function normalizePath(value) { return String(value || "").replace(/[\\/]+$/, ""); }

function matchesBinding(session, input = {}) {
  return bindingCandidates(session).some((binding) => bindingMatches(session, binding, input));
}

function requireBoundSession(sessions, input) {
  const session = sessions.find((item) => item.sessionId === input.sessionId);
  if (!session) throw Object.assign(new Error(`Session not found: ${input.sessionId}`), { code: "SESSION_NOT_FOUND" });
  const binding = bindingFor(session, input);
  if (!binding) throw Object.assign(new Error("The Tianyuan session is not bound to this registered Agent."), { code: "AGENT_BINDING_MISMATCH" });
  if (binding.bindingId !== input.bindingId) throw Object.assign(new Error("bindingId does not match the selected Agent binding."), { code: "AGENT_BINDING_MISMATCH" });
  if (!matchesBinding(session, input)) throw Object.assign(new Error("workspace or conversation does not match the selected Agent binding."), { code: "AGENT_BINDING_MISMATCH" });
  return session;
}

async function connectionStatus(input = {}) {
  await ensureAgentRegistered();
  const payload = await request("/api/sessions");
  const allSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  const onlineSessions = allSessions.filter((session) => session.status === "online");
  const boundSessions = onlineSessions.filter((session) => bindingFor(session));
  const matches = boundSessions.filter((session) => matchesBinding(session, input));
  const issues = [];
  if (!onlineSessions.length) issues.push({
    code: "NO_ONLINE_SESSIONS",
    message: "没有当前 Agent 有权访问的在线天源浏览器 session。请在 Chrome 打开已登录的天源资产基础法底稿页，加载本机扩展并在连接配置中绑定当前项目/对话。",
    hint: "不要使用普通未加载扩展的标签页；绑定成功后顶部应显示已绑定，再重新调用本工具。",
  });
  else if (!boundSessions.length) issues.push({ code: "NO_AGENT_BINDINGS", message: "在线天源页面尚未绑定当前 Agent。" });
  else if (!matches.length) issues.push({ code: "NO_MATCHING_BINDING", message: "没有找到与当前工作区或对话匹配的天源页面。" });
  else if (matches.length > 1 && !input.sessionId && !input.bindingId) issues.push({ code: "MULTIPLE_MATCHING_SESSIONS", message: "匹配到多个天源页面，请明确 sessionId 或 bindingId。" });
  const recommendedSession = matches.length === 1 ? sessionSummary(matches[0], true, input) : null;
  return {
    ok: issues.length === 0,
    bridge: { url: bridgeUrl, online: true },
    counts: { online: onlineSessions.length, bound: boundSessions.length, matched: matches.length },
    issues,
    recommendedSession,
    sessions: input.includeSessions === false ? undefined : matches.map((session) => sessionSummary(session, false, input)),
    routingRule: "后续调用必须复用 recommendedSession 的 sessionId 和 bindingId；Bridge 只返回当前已注册 Agent 有权访问的页面。",
  };
}

export async function executeTool(name, input = {}) {
  await ensureAgentRegistered();
  if (name === "tianyuan.connection_status") return connectionStatus(input);
  if (name === "tianyuan.list_sessions") {
    const payload = await request("/api/sessions");
    return { ok: true, sessions: (payload.sessions || []).map((session) => sessionSummary(session, input.includeContext === true)) };
  }
  if (name === "tianyuan.get_context") {
    const payload = await request("/api/sessions");
    const session = requireBoundSession(payload.sessions || [], input);
    return { ok: true, session: sessionSummary(session, true), security: { readOnly: true, writesPerformed: false, credentialsReturned: false } };
  }
  if (name === "tianyuan.list_capabilities") {
    const payload = await request("/api/protocol");
    return { ok: true, protocolVersion: payload.protocolVersion, adapter: payload.adapter, capabilities: payload.capabilities, safety: payload.safety };
  }
  if (name === "tianyuan.report_capabilities") {
    const payload = await request("/api/sessions");
    const session = requireBoundSession(payload.sessions || [], input);
    const report = session.context?.reportAuthoring || {};
    const selectedBinding = bindingFor(session, input);
    if (!report.inspectAvailable) {
      throw Object.assign(new Error("当前扩展未提供报告编辑能力。"), { code: "REPORT_ADAPTER_NOT_AVAILABLE" });
    }
    return {
      ok: true,
      adapterVersion: report.adapterVersion || null,
      source: "page-adapter-status",
      capabilities: report.v2 || null,
      writeEnabled: Boolean(selectedBinding?.reportWriteGate?.open && selectedBinding?.reportWriteGate?.scopeMatches),
      writeGate: "写入以及可能触发页面状态变化的导航、编辑器开启和关闭需要 Bridge 写门禁开启；丢弃未保存内容不支持。",
      note: "能力矩阵来自页面适配器对当前报告页的真实检测（随扩展心跳刷新）：工具存在不代表页面支持，以本工具实时返回为准；livePageVerified=false 表示节点身份仍未与服务器端核对。",
      security: { readOnly: true, writesPerformed: false, credentialsReturned: false },
    };
  }
  if ([
    "tianyuan.preview_batch_save",
    "tianyuan.execute_batch_save",
    "tianyuan.preview_batch_exit_edit",
    "tianyuan.execute_batch_exit_edit",
    "tianyuan.preview_audit_attachment_upload",
    "tianyuan.upload_audit_attachment",
    "tianyuan.batch_upload_audit_attachments",
    "tianyuan.clear_audit_test_rows",
    "tianyuan.inspect_audit_check_row",
    "tianyuan.set_audit_check_result",
    "tianyuan.scan_audit_index_check_rows",
    "tianyuan.batch_set_audit_check_results",
    "tianyuan.edit_block_preview",
    "tianyuan.edit_block_execute",
    "tianyuan.edit_block_readback",
    "tianyuan.edit_block_format_preview",
    "tianyuan.edit_block_format_execute",
    "tianyuan.edit_block_format_readback",
    "tianyuan.table_preview",
    "tianyuan.table_execute",
    "tianyuan.table_readback",
    "tianyuan.report_inspect",
    "tianyuan.report_navigate",
    "tianyuan.report_node_read",
    "tianyuan.report_preview",
    "tianyuan.report_execute",
    "tianyuan.report_save",
    "tianyuan.report_readback",
    "tianyuan.report_editor",
    "tianyuan.report_reload",
  ].includes(name)) return runBrowserAction(name, input);
  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: "UNKNOWN_TOOL" });
}
