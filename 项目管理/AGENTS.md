# 天源浏览器工作台项目规则

本项目用于开发“天源系统浏览器插件 / 天源浏览器工作台”。插件只负责在天源页面中安全执行、回读和留痕；业务口径、任务参数、成功标准和复核门禁应由项目流程或 skill 显性定义。

## 项目结构

- `docs/context/`：旧项目交接包、已验证事实、原型脚本和上下文来源。
- `docs/decisions/`：架构选择、技术边界、接口语义和重要取舍。
- `docs/test-evidence/`：页面截图、接口日志、回读记录、测试结论。
- `extension/`：Chrome Manifest V3 插件代码。
- `native-helper/`：可选本地助手，仅用于本地文件读取和任务队列。
- `skills/`：与插件动作协议对接的 Codex skill。
- `prototypes/`：实验原型、一次性验证脚本或迁移前脚本副本。
- `项目管理/`：项目记忆、进度、日志和规则。

## 开发顺序

1. 先读取 `项目管理/` 四件套和 `docs/context/README.md`，再继续任务。
2. 先做只读页面适配器，再做写入动作。
3. 所有写入动作必须有预演、执行、回读三个阶段。
4. 没有回读验证，不得宣称上传、保存或落库完成。
5. 先保护真实底稿和线上系统，不用正式项目做无门禁破坏性测试。

## 稳定性规则

- 不写死坐标、列号或压缩类名。
- 优先使用 URL、项目/主体/科目 ID、表头文字、字段编码、稳定 DOM、SpreadJS 对象和接口回读。
- 评估核实阶段必须通过 SpreadJS 表头定位“查证资料索引”，不能假设固定列。
- 打开上传弹窗优先使用 `operation-upload-cell` 的 `activateEditor(true, null, null, { sheet, row, col })`。
- 不能把截图、前端回显或单次 DOM 结构当成长期规则。

## 上传与保存门禁

- `uploadFile` 只代表前端文件注入，不代表落库。
- `/ty/api/attach/upload` 成功只代表附件入库。
- `/ty/api/assignment_draft/cell_file/classify_upload` 成功只代表分类批次生成。
- `/ty/api/assignment_draft/save` 成功且明细回读一致，才算正式保存成功。
- “注释文件/ZSWJ”不是评估核实附件入口；评估核实资料上传入口是“查证资料索引/CZZLSY”。
- 编辑锁是硬门禁，正式插件不能绕过。

## 安全规则

- 不保存 Cookie、Authorization、密码、验证码或 token。
- 操作日志可记录接口路径、业务状态、requestId、项目/主体/科目/行字段，但不得记录完整鉴权凭据。
- 本地助手只能读取用户授权的文件或目录，不保存天源账号状态。
- 若页面显示登录失效、权限不足、编辑锁不属于当前用户或保存按钮不可用，应停止并记录原因。

## 本机运行依赖规则

- OneDrive 项目目录只保留基础项目信息、源码、文档、决策记录和测试证据。
- 2026-07-24 起，OneDrive 不再作为运行文件来源；浏览器扩展、Native Host、Connector、插件运行时、脚本和底层依赖均应放在本机目录。
- 本机项目运行根目录为 `~/.tianyuan-workbench/projects/天源评估系统/`。
- Chrome 加载未打包扩展时应选择 `~/.tianyuan-workbench/projects/天源评估系统/extension`，不要再选择 OneDrive 项目内的 `extension/`。
- 不在 OneDrive 项目目录安装 `node_modules`、Python 虚拟环境、CLI 安装包、OCR/PDF 二进制依赖、运行日志、缓存或临时快照。
- 插件本地运行态统一放在 `~/.tianyuan-workbench/`。
- Native Host、HTTP helper 的运行副本、launcher 和日志放在 `~/.tianyuan-workbench/native-helper/`。
- 大型依赖、安装包和外部工具副本放在 `~/.tianyuan-workbench/dependencies/天源评估系统/`。
- 项目快照如需保留，放在 `~/.tianyuan-workbench/project-snapshots/天源评估系统/`，不要放在云盘项目根目录。
