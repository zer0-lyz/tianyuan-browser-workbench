# 交给 Agent 安装与只读验收

不要只提供说明，请实际执行已授权范围内的操作；先保护正在使用的正式环境。当前 build 2026102601 为本地测试候选，标记 NOT_APPROVED_FOR_DISTRIBUTION，不得上传或替换官方 Release。

1. 确认 Windows x64、Chrome/Edge、完整安装包来源及 SHA-256。优先使用当前文件同目录、已经完整解压的包。公开分发仓库为 `tianyuan-browser-workbench-releases`，正式资产通常命名 `tianyuan-workbench-v*-windows-x64.zip` 并附 `.sha256` / `update-manifest.json`；测试候选按交接文件中的明确文件名选择，不拿 lite 当 full。
2. 安装根默认采用当前解压目录。不要放进会被自动清理的 `%TEMP%\TW-install` 暂存位置；可用它做纯预检，但实际安装应在用户准备保留的目录中运行。默认浏览器路径为 `<安装根目录>\extension`，运行态为 `<安装根目录>\workbench-runtime`，不会强制部署到 C 盘 AppData。
3. 若当前用户已有正式安装，完整安装仍会改写用户级 Native Messaging、共享 Connector、Codex 缓存和桌面/文档入口。InstallRoot 不能隔离这些影响。实机验收须使用干净 VM 或可回滚专用测试机；环境不满足就报告“未覆盖”，不擅自覆盖。
4. 先可设置 `TIANYUAN_PREFLIGHT_ONLY=1` 并执行 `install-agent.cmd`，查看“预检结果.json”。`installed=false` 仅为预检；正式安装前清除变量。完整安装执行 `install-agent.cmd` 或 `install.cmd /Agent`，正常双击体验使用 `install.cmd`。
5. 轻量包由 VERSION.txt 自动识别。应从当前工作台更新，或执行 `install.ps1 -Agent -InstallRoot '用户明确的现有根'`。根无法确定或 Node/Python/Native Host 等必需环境不完整就停止，使用同版本完整包。
6. 完整安装必须验证 Node.js、Python 及全部业务依赖（pythonDependencies：requests、urllib3、certifi、charset_normalizer、idna、openpyxl、et_xmlfile、lxml、python-docx、typing_extensions）、Native Helper、Native Messaging、Connector 和 Codex 缓存。
7. 天源 CLI 为可选外部依赖；完整/轻量包不包含其安装器，不自动下载、安装、修复或卸载。缺少 CLI 时给中文提示，请用户单独安装；已有 CLI 只做只读探测。缺失不得阻断核心安装，也不得被误报为已安装或已授权。
8. 读取 `<安装根目录>\安装检查结果.json` 和 `<安装根目录>\安装检查结果.txt`。成功要求 status=success、allComponentsReady=true（readinessScope=required-components-only）、所有必需组件通过、Connector health 正常。optionalDependencies.cli.required=false；CLI unavailable 可以与核心成功同时存在。核心失败必须非零退出。控制台/重定向日志按 UTF-8 读取，JSON 报告为机器判定依据。
9. 在浏览器扩展管理页手动加载报告 paths.extension，核对真实路径，不进入旧的隐藏目录。桌面“天源工作台-浏览器扩展”入口和文档中的路径说明可帮助定位；OneDrive 重定向时入口也会被写入对应位置。不要编辑浏览器 profile 或绕过受限页面；必要的浏览器加载由用户本人完成。
10. 核对扩展 ID `lkflndcnklpeaejohaacoaolnmhgigoc`、版本/build/runtimeBuildId、Native Host 实际调用、目录选择回显和重新打开后的持久化。目录失败要记录中文提示、阶段和 OS 错误码，保留原设置，不能凭统一错误码断言权限不足。
11. 若需要 MCP 或 CLI 授权，由用户本人完成；不得要求用户把 token 发送到聊天中，不读取、复制或输出 token、Cookie、Authorization、密码、验证码。CLI 未安装时先提示安装，不要求先授权。
12. 只读验收可执行 connection_status、list_capabilities、list_sessions、get_context。不得执行上传、保存、清理附件、退出编辑、填写结论或其他正式底稿写入。

最终报告分别给出包校验、预检、完整安装、浏览器/Native Host、CLI 可选状态和目录 GUI 场景的“通过/失败/未覆盖”，附实际路径、截图/日志、错误阶段及风险。预检通过不能记为安装器通过，源码/组件自检不能记为完整实机验收通过。
