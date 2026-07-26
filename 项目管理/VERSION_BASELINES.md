# 版本基线记录

## 2026-07-22

基线名称：`baseline-subject-company-selection-20260722`

用途：

- 固定当前“批量保存底稿”面板版本。
- 科目：保留折叠层级；父级可作为无复选框层级标题；只有显示状态过滤后的科目有复选框并进入批量保存。
- 科目父级名称：先用 MCP 全量科目建立 `科目代码 -> 科目名称` 映射，再做显示状态过滤。
- 公司：显示 `公司编号 + 公司简称`；按真实编码补层级。
- 后续若改乱，可回退到该基线。

回退方式：

```bash
git reset --hard baseline-subject-company-selection-20260722
```

如不想使用 Git，也可从 `.snapshots/tianyuan-workbench-baseline-20260722.zip` 恢复。

## 2026-07-23

基线名称：`baseline-page-tree-mirror-20260723`

固定提交：本文件提交后的 Git commit，同时创建同名 Git tag。

用途：

- 固定当前已通过初步测试的天源浏览器工作台版本。
- 科目范围、父级层级和显示顺序以天源页面已展开科目树为准。
- 只将页面显示状态下的叶子科目作为可勾选批量处理项。
- 父级保留为层级标题，不参与执行。
- 科目编号不在面板显示；可靠编号、页面路径和 `treepath` 仅保留作内部执行映射。
- 现有批量保存和批量退出编辑模块从该版本继续扩展。

回退方式：

```bash
git reset --hard baseline-page-tree-mirror-20260723
```

查看基线：

```bash
git show --stat baseline-page-tree-mirror-20260723
```

## 2026-07-23 Windows x64 测试版

基线名称：`baseline-workbench-0.3.0-windows-test-20260723`

用途：

- 固定 Windows x64 发行适配源码和安装工具。
- 包含 Windows Native Host、PowerShell 文件选择器、便携 Python、CLI 安装、当前用户 Native Messaging 注册和 Agent 安装提示词。
- 保留扩展版本 `0.3.0` 和固定扩展 ID `lkflndcnklpeaejohaacoaolnmhgigoc`。

回退方式：

```bash
git reset --hard baseline-workbench-0.3.0-windows-test-20260723
```

## 2026-07-23 Windows x64 快速安装 r2

基线名称：`baseline-workbench-0.3.0-windows-test-r2-20260723`

用途：

- 固定 Windows 安装器自动双模式。
- 已有 CLI、Python 和打印依赖时走快速安装。
- 缺少打印依赖时优先离线补齐，失败才回退便携 Python。
- 核心文件和备用依赖分层按需校验。
- 安装报告记录安装模式与耗时。

回退方式：

```bash
git reset --hard baseline-workbench-0.3.0-windows-test-r2-20260723
```

## 2026-07-24 Windows x64 稳定功能包 r4

对应源码基线：`baseline-workbench-0.8.3-stable-20260724`

发行文件：

- `天源浏览器工作台-v0.8.3-Windows-x64-测试版-r4-20260724.zip`
- SHA-256：`8c697f907a57ea0f1f90ae3c1dea522fc62e33a6c4a6eccd6f6b6bec47dd11f1`

固定内容：

- 扩展 `0.8.3` 八个功能模块；
- 扩展、Native Host 与 Connector 共享 `runtimeBuildId`；
- 页面重复注入保护；
- 同一行多附件一次保存；
- 批量清理核实程序和资料索引并保留核对情况；
- Windows 快速安装与便携依赖回退。

## 2026-07-26 GitHub 更新模块正式版

产品版本：`0.9.0`

构建编号：`2026072601`

正式发行：

- 已建立 `extension/version.json` 单一版本源；
- 已实现 GitHub Releases 检查和 SemVer 比较；
- 已实现九模块更新页面和顶部版本状态；
- 已同步本机运行目录；
- 私有源码标签：`v0.9.0`；
- 源码提交：`d0695d2f7e44e42a2e67bc243e4e4e1643f2c04b`；
- 公开发行仓库：`zer0-lyz/tianyuan-browser-workbench-releases`；
- 公开 Release：`v0.9.0`；
- 运行指纹：`64b2cf6befaf748d38bd052da412171d3d781c6268188d3711e4a522251c07a2`。

## 2026-07-26 跨平台 Native Helper 开发版

产品版本：`0.10.0`

构建编号：`2026072602`

当前状态：

- 已建立共享 Helper 核心和 Windows/macOS 平台适配层；
- 已增加 Windows DPAPI、macOS Keychain 和统一文件选择、进程控制接口；
- 已增加统一安装后自检；
- 已通过源码、平台适配器、Connector 和更新模块回归；
- 本机运行副本已同步；
- 最终源码提交、运行指纹和测试包 SHA-256 待重新构建后固定；
- 尚未建立正式标签或 GitHub Release。

## 2026-07-24 评估核实批量上传与本机运行基线

基线名称：`baseline-audit-upload-cleanup-local-runtime-20260724`

用途：

- 固定当前已验证的评估核实附件批量上传能力。
- 已在 `其他应收款-其他应收款` 第 2、3 行完成“测试附件上传 -> 分类批次 -> 底稿保存 -> 资料索引回读 -> 查证核对情况填写 -> 保存 -> 回读”闭环。
- 已完成测试数据清理：`P2/P3`、`Q2/Q3`、`R2/R3` 清空并保存回读，最终 `rowsWithIndex=0`、`rowsNeedingCheck=0`。
- 固定 `clear_audit_test_rows` 受控清理动作，清理前可校验测试批次号。
- 固定空资料索引 `tag:{isClear:true}` 不视为已有资料的扫描口径。
- 固定本机运行目录口径：运行文件放在 `~/.tianyuan-workbench/projects/天源评估系统/`，OneDrive 只保留说明、决策、测试证据和项目记忆。

回退方式：

```bash
git reset --hard baseline-audit-upload-cleanup-local-runtime-20260724
```

查看基线：

```bash
git show --stat baseline-audit-upload-cleanup-local-runtime-20260724
```
