# 天源浏览器工作台全面稳定性审计

时间：2026-07-24 23:20 CST

## 结论

本轮确认反复故障主要来自运行版本契约不足，而不是某一个功能按钮本身。相同 manifest 版本下存在扩展源码、页面旧监听和 Connector 后台进程不一致的可能；安装过程还存在短暂半复制状态。上述系统性问题已在本机源码和运行副本中修复。

## 关键修复

1. 扩展与 Connector 共享 SHA-256 `runtimeBuildId`，不再只比较 `0.8.3`。
2. content script 使用 IIFE，并在重复执行时替换旧 Chrome listener。
3. MAIN-world page adapter 保存 context/action listener 引用，重复注入时主动移除旧监听。
4. 安装器先复制到 staging，校验关键文件后整体替换，失败时恢复旧目录。
5. Native Helper 单文件采用临时文件校验后原子替换。
6. 批量上传记录分类批次值，统一保存后逐行验证所有预期值。
7. 新增静态契约测试，防止 manifest、HTML 控件、适配器版本、协议和插件版本再次漂移。

## 自动验证

- JavaScript 语法检查：通过。
- 静态扩展契约：通过。
- Connector/Agent Bridge 回归：通过。
- Git diff whitespace：通过。
- 源码与本机运行副本逐文件比较：一致。
- 安装 staging/backup/tmp 残留：无。
- Native Host 自检：通过。
- 正确 `runtimeBuildId` 访问受保护 Connector 接口：HTTP 200。
- 错误 `runtimeBuildId`：HTTP 426，原因 `EXTENSION_RUNTIME_BUILD_MISMATCH`。
- Connector 旧进程 PID `7862` 已受控替换为 PID `14423`。

## 当前运行契约

- 扩展版本：`0.8.3`
- Connector 协议：`connector-agent-binding-v3`
- Page adapter：`2026-07-24-page-tree-mirror-v29-replaceable-listeners`
- Runtime build：
  `d75cba0b35c7ec5c6864bf24936d3933c711fb35bb8031c9bf3153dcd48f5edd`

## 扩展加载路径补充

2026-07-24 23:15 的截图确认 Chrome 仍加载 OneDrive 源码目录，而不是安装器生成的本机运行目录。源码目录没有 `runtime-compat.json`，因此侧栏按安全规则阻断连接。正确加载目录为：

`~/.tianyuan-workbench/projects/天源评估系统/extension`

## 批量上传执行粒度补充

天源支持同一行多个附件，但要求在一次上传弹窗中完成所有分类文件选择并只保存一次。已有资料索引的行不能追加附件。插件已从“逐文件保存”改为“按行分组、一次注入、一次保存”，并增加目标空白行预检。

## 仍需真实页面确认

Chrome 需要重新加载扩展并刷新天源底稿页，才能清除旧页面执行上下文并重新注册 session。之后应只做聚焦回归：上下文识别、单文件单行、两文件不同行、两文件同一行不同分类。同一行多文件若不能回读所有分类批次，插件必须报告失败，不得报告部分成功。

## 后续真实页面验收

- 同一行多文件已按“一次打开弹窗、一次注入全部分类文件、一次保存”的粒度完成真实界面初步验收。
- 批量清理附件初版只清空资料索引，造成核实程序残留；截图确认资料索引为空而核实程序仍有“凭证/合同/期后回款”等文本。
- 修复后，扫描会包含资料索引或核实程序任一有内容的行。
- 正式清理同时清空“查证类核实程序”和“查证资料索引”及附件关联 tag，保留“查证核对情况”。
- 清理前逐行校验资料索引和核实程序原值；保存后要求两列回读为空且核对情况保持不变。
- 用户重新加载扩展并复测后于 2026-07-24 确认“可以了”。
- 本轮验收运行指纹：
  `7e2e3f8ba68207d5f5936f814dfb2a1f546a9de338000b4a36374ed4254771d9`
