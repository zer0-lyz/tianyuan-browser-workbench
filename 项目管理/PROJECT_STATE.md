# 天源浏览器工作台项目状态

## 2026-08-02 Windows 更新解压修复 v0.14.20（已发布，待 Windows 实机验收）

- 已修复 Windows 更新包因长暂存路径导致 `Expand-Archive` 解压失败的问题：测试和正式更新统一使用 `LOCALAPPDATA\\TianyuanUpdate\\<短随机ID>` 暂存目录。
- 解压前读取 ZIP 条目，拦截 `..`、绝对路径、盘符路径和规范化路径穿越；目标路径超过 240 字符返回 `UPDATE_PATH_TOO_LONG`，危险条目返回 `UPDATE_ZIP_PATH_TRAVERSAL`。
- PowerShell 解压现在捕获 stdout、stderr、退出码、阶段、ZIP 路径和目标目录，错误经过脱敏后回写状态，不再只显示 `Command failed` 或 `EncodedCommand`。
- Windows runner 使用无 BOM UTF-8 原子写入状态文件；更新成功或失败后清理暂存目录，失败不会停留在假安装状态。
- 版本：`0.14.20`，构建号 `2026080208`；源码提交：`2a725e2707a70c2b3473a7f13c9936c534dd6aee`。
- GitHub Release：`https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/tag/v0.14.20`；更新清单已在线回读为 `0.14.20 / 2026080208`。
- 运行指纹：`b5f28cb293a3cd09fced0d9df122ad529b1c9fa7391617abd3e8f1d2be0f3a9f`。
- Windows 完整包：`/Users/zer0y/.tianyuan-workbench/releases/tianyuan-workbench-v0.14.20-windows-x64-20260802.zip`，SHA-256：`3d18b3c756675be37e58a452411d48041c188859b005ac4db91ffb7799faef80`。
- Windows Lite 包：`/Users/zer0y/.tianyuan-workbench/releases/tianyuan-workbench-v0.14.20-windows-x64-lite-20260802.zip`，SHA-256：`bd12d75fe6201f6e49b4cc68bc5501e7a820c7dec5ca9c72dab7b202061e55b7`。
- 本机自动化回归 `23/23` 通过；真实 Windows 10/11、PowerShell 5.1、进程占用和安装升级仍需用户实机验收。

## 2026-08-02 Windows 明细表一页宽修复 v0.14.19（已发布，待 Windows 实机验收）

- 明细表打印脚本已改为 `fitToPage=1`、`autoPageBreaks=0`、`fitToWidth=1`、`fitToHeight=0`，清除固定缩放比例，解决 Windows 打印设置仍显示“无打印缩放”的问题。
- 申报表和明细表 OOXML 回读均通过；全量自动测试 21 项通过。
- 版本：`0.14.19`，构建号 `2026080207`；GitHub Release 已发布，供 Windows `0.14.18` 测试更新。
- GitHub Release：`https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/tag/v0.14.19`。
- 完整包 SHA-256：`49f41c4d409d6c0a821d3b91bd1caea7e1fcd038d433bb052a10bf7df4f693e6`；Lite 包 SHA-256：`6050258b61038d830ec5df45b6f42f924be58383381dba3ee3cc8cb20d7e3756`。
- 更新器已将 GitHub Release 清单置于首选，并增加“镜像无新版本时继续检查 GitHub”的回归测试。
- 更新清单改用 `releases/latest/download/update-manifest.json`，后续版本不需要再次修改更新源地址。
- 已额外生成一次性修复工具：`/Users/zer0y/Downloads/tianyuan-workbench-repair-update-source.cmd`；用于已安装 0.14.18 的旧更新器切换到 GitHub 清单。

## 2026-08-02 Windows 自动更新卡 82% 修复 v0.14.18（待 Windows 实机验收）

- 根因已确认：旧 Native Host 未退出，Connector/Node 仍占用 `native_host.exe` 或 `native-helper\\node\\node.exe`；更新脚本只等待 5 秒且启动后没有真实完成/失败回写，最终表现为 `installing / 82%`。
- 已修复：更新请求返回后 Native Host 主动退出；Windows runner 使用 Stop 模式、等待父 Host 退出、捕获安装器退出码、写入安装器 PID/日志/状态，并验证最终状态必须为 `complete`。
- Windows 安装前只停止天源自己的 Connector、Native Host 和 managed Node；第三方端口占用返回 `CONNECTOR_PORT_OCCUPIED_BY_OTHER_SERVICE`，目标文件仍占用返回 `UPDATE_FILE_LOCKED`，最多重试 3 次。
- 新增状态阶段：`preparing`、`stopping_services`、`waiting_for_file_release`、`installing`、`failed`；状态超过 20 分钟自动转为 `WORKBENCH_UPDATE_TIMEOUT`，不再永久停留在安装中。
- 本机运行同步增加 Native Helper 关键文件回滚备份；版本、构建号、runtimeBuildId、Native Messaging、Python/openpyxl、Connector health 均在安装阶段验收。
- 版本：`0.14.18`，构建号 `2026080204`；源码当前只在本地修改，暂未推送 GitHub。
- Windows 完整包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.18-windows-x64-20260802.zip`，SHA-256：`251dec874764fe9222bc0d04c252144918d7ef5790ed2f9ed73b20e417d3f0d3`。
- Windows lite 包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.18-windows-x64-lite-20260802.zip`，SHA-256：`0a567414558d408c1b2747f574b41a9e65b4afa4e47854f7a929ac074060f6fa`。
- 包内回读通过：完整包 369 个条目并含 Node/Python/native_host.exe；lite 包 94 个条目且不含 Node/Python/CLI/native_host.exe；两包版本、构建号和 runtimeBuildId 一致。
- Mac 静态与全量回归通过；Windows 实际安装、Connector 停止/恢复、Node 文件占用和 Chrome 重载仍需用户在 Windows 机器上实测。

## 2026-08-02 v0.14.16 更新源修复包

- 针对 Windows `v0.14.16` 仍读取旧 Gitee 清单的问题，生成同版本更新源修复包；不回退主分支 `v0.14.17`。
- 已有安装环境建议使用轻量修复包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.16-windows-x64-lite-update-source-repair-20260802.zip`。
- 轻量修复包 SHA-256：`29eed572dff665ad9f36890d4f2f0a100580ec6853607b6659d3504a037b5f5c`。
- 全量修复包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.16-windows-x64-update-source-repair-20260802.zip`。
- 全量修复包 SHA-256：`e86ab777b282cd287b6c4eab71ec9c5756dbb1b02d0d5fb21709c339ab1e5872`。
- 修复内容仅为 `native-helper/update-sources.json`，改为读取 GitHub `v0.14.17/update-manifest.json`；包内 307/61 项校验全部通过。

## 2026-08-02 CLI 动态授权链路修复 v0.14.17

- 修复 `extension/src/sidepanel/sidepanel.js`：授权 CLI 现在等待 Native Helper 捕获 `tycpv login` 输出中的动态 `authorizationUrl`，再打开或复用唯一授权标签页。
- 连接配置页新增动态授权链接备用区域和“复制链接”按钮；自动打开失败时仍可手动完成授权。
- `extension/manifest.json` 增加 `https://mcp.zhrdc.net/*` 权限，用于复用和聚焦真实动态授权页。
- Native Helper 保留 stdout/stderr 捕获、20 秒动态 URL 超时、CLI 不存在、执行阻止、回调端口冲突、非零退出和授权状态轮询；不读取或回传 token、Cookie、Authorization、密码或验证码。
- 版本同步为 `0.14.17`，构建号 `2026080203`；源码已推送 GitHub，提交为 `88dbb26`。
- GitHub Release：`https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/tag/v0.14.17`。
- 已生成完整包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.17-windows-x64-20260802.zip`，SHA-256：`17fed0471a0da4db3f610555ab08917f58722d554872b897460db36dbc79c293`。
- 已生成轻量包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.17-windows-x64-lite-20260802.zip`，SHA-256：`e21532c63bb77f539002aacd4eddebb5580f1d6d6c66217c160239f698231d22`。
- 包内回读通过：完整包含 Node、Python、CLI 安装器和 `native_host.exe`；轻量包标记 `package_type=lite-update` 且不含上述运行时。
- GitHub Release 资产和更新清单已在线核验；Gitee 镜像因本机没有写入凭据仍停在 `0.14.12`，旧安装器若只读取 Gitee 会暂时看不到 `0.14.17`。
- 待验证：Chrome 全新重启和扩展重新加载后，Windows 更新检查、完整包下载校验、轻量更新安装及 CLI 授权场景。

## 2026-08-02 Windows 轻量更新包 v0.14.16

- 已补生成已有安装用户使用的 Windows x64 轻量更新包。
- 更新包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.16-windows-x64-lite-20260802.zip`。
- SHA-256：`cf6b05e30f5adf2874d992a036fb54e0016b415734ad32e55aefb97307ee112f`。
- 包内 `VERSION.txt` 标记 `package_type=lite-update`、`requires_existing_runtime=true`。
- 已确认不包含 Node、Python、CLI 安装器或 `native_host.exe`；包含扩展、Native Host JS、更新器、Connector、安装脚本和校验清单。
- 仅适用于已经完成完整安装的 Windows 用户；全新电脑仍必须使用完整安装包。
- 本轮未推送 GitHub Release。

## 2026-08-02 Windows 安装测试包 v0.14.16

- 已将连接授权入口修复同步进 Windows x64 完整测试包。
- 下载包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.16-windows-x64-20260802.zip`。
- SHA-256：`6445621db02f0a135e34f4c841d85db1c1c8ba04d97698700dcadbd699529df5`。
- 独立提示词：`/Users/zer0y/Downloads/天源工作台_Windows_Codex_自动安装提示词_v0.14.16.md`。
- 独立说明：`/Users/zer0y/Downloads/天源工作台_Windows_安装说明_v0.14.16.md`。
- 包内包含 `install-agent.cmd`、Node、Native Helper、扩展、离线 Python/wheel 和 CLI 安装器；新 Windows 机器使用完整包，不使用 lite 包。
- 待 Windows 实机执行 `install-agent.cmd`，再回读 `%LOCALAPPDATA%\\TianyuanWorkbench\\安装检查结果.json`。

## 2026-08-02 连接授权入口修复 v0.14.16

- 修复连接配置页“授权 CLI”只启动本地 `tycpv login`、不打开授权网页的问题。
- CLI 授权按钮现在打开 `https://mcp.zhrdc.net/connect?source=valuation&tab=cli`，并保留本地 CLI 登录作为辅助动作。
- MCP 配置按钮现在打开 `https://mcp.zhrdc.net/connect?source=valuation`，同时保留 token 输入弹窗；弹窗内增加重复打开接入页入口。
- 版本同步为 `0.14.16`，构建号 `2026080202`；本轮只更新本机运行副本，暂不推送 GitHub。
- 已通过 sidepanel 语法检查、静态扩展契约、Agent Bridge、更新检查器、更新安装器和 `git diff --check`。
- 待用户重新加载本机扩展后，分别点击“授权 CLI”和“配置 MCP”确认网页能打开。

## 2026-07-30 待办：Windows 开发验收机配置

- 用户计划准备一台 Windows 电脑安装 Codex，用于检查配置、真实运行 Windows 安装流程，并生成或验收 Windows 安装包。
- 已确定协作方式：Mac 主开发，Windows 实机验收，GitHub 作为唯一代码同步中心。
- OneDrive 继续只存项目基础说明、项目管理记录和交接资料，不存运行依赖、构建缓存或本机运行目录。
- 待 Windows 电脑可用后，需要提供一份可直接交给 Windows Codex 执行的配置提示词。
- 该提示词应覆盖：拉取 GitHub 最新代码、安装或检查 Git/Node/Python/Chrome/Edge/tycpv CLI、运行 Windows bootstrap、注册 Native Messaging、安装本机运行副本、启动 Connector、输出扩展加载路径、跑 Windows 测试和生成安装包。
- 建议后续落地脚本：`scripts/bootstrap-windows-dev.ps1`、`scripts/bootstrap-macos-dev.sh`、`scripts/release-check.mjs`。
- 发布门禁保持双系统验收：Mac 通过通用功能和 macOS 更新，Windows 通过安装包、Native Helper、Connector、CLI/Python、轻量更新和文件选择等系统相关功能。

## 2026-08-02 Windows 全新机器安装测试包已准备

- 测试版本：`0.14.14`，Windows x64 完整安装包，构建编号 `2026072902`。
- 下载包：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.14-windows-x64-20260729.zip`。
- SHA-256：`5079ed95d27ea00a759c31ad142c0dcdec908b50b3d4f411766ccf8b58984dc5`。
- 校验文件：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.14-windows-x64-20260729.zip.sha256`。
- 单独提示词：`/Users/zer0y/Downloads/天源工作台_Windows_Codex_自动安装提示词_v0.14.14.md`。
- 安装说明：`/Users/zer0y/Downloads/天源工作台_Windows_安装说明_v0.14.14.md`。
- 新机器必须使用完整包，不使用 `lite` 包；完整包包含 Node、Native Helper、扩展和离线 Python/CLI 回退资源。
- 已通过 Windows ZIP 编码、Windows Release ZIP、安装器 CLI 降级、运行启动、Agent 安装提示词和 lite 包测试。
- 这是本机测试构建，`VERSION.txt` 标记 `source_dirty=true`；暂不作为 GitHub 正式 Release。

## 2026-08-02 Windows 测试反馈已修复，待实机验证 v0.14.15

- 已处理反馈中的 CLI 探测卡住、误执行第三方程序、Agent `pause`/GUI 阻塞和缺少 JSON 报告问题。
- 新增严格 CLI 白名单和已知目录解析；CLI 探测改为 5 秒 `--help`，超时终止进程树后不阻断其他工作台组件安装。
- 新增 `install-agent.cmd`、`install.cmd /Agent` 和 JSON 安装结果；Agent 模式不自动打开浏览器或资源管理器。
- Native Host Windows CLI 健康检查与安装器保持一致，使用 `--help` 探测，stdin 关闭时主动退出。
- 新版本已生成并放入下载目录：`/Users/zer0y/Downloads/tianyuan-workbench-v0.14.15-windows-x64-20260802.zip`。
- 新包 SHA-256：`b09ad643e0f794a3084a92667589302cfad9f0a084be685ddb43fdf4a963f0fd`；构建号 `2026080201`；运行指纹 `29a69ecb5aa57dd4f7a9780f7915380bef5baa5781ba3d677b34a438ab6ba2d0`。
- 自动化回归通过：Windows 安装器安全、CLI 降级、Agent 提示词、ZIP 编码、Release ZIP、Runtime 启动、静态契约、Native Host、Agent Bridge、更新模块和打印模块。
- 待真实 Windows 电脑用 `install-agent.cmd` 完成首次安装，重点回读 `安装检查结果.json`、退出码、CLI 探测是否在 5 秒内结束、是否启动无关程序和是否自动打开 GUI。
- 当前仍未推送 GitHub；先完成 Windows 实机验收。

## 2026-07-29 当前状态：本机与 Windows 测试包已修复到 v0.14.14

- Windows 新用户测试失败现象：`1/7` 到 `4/7` 均通过，第 `5/7` 步报错 `spawnSync C:\Users\Lenovo\AppData\Local\TianyuanWorkbench\native-helper\native_host.exe EPERM`。
- 已修复 Windows 安装器：安装开始和同步后都会自动解除下载阻止标记，减少微信、浏览器和压缩包分发导致的 exe 启动阻止。
- 已修复本机同步脚本：复制 `native_host.exe` 后立即解除阻止，自检失败时给出 `WINDOWS_NATIVE_HOST_EXECUTION_BLOCKED` 可读错误。
- 当前源码和本机运行副本版本均为 `0.14.14`，构建编号 `2026072902`。
- 当前本机运行兼容指纹为 `bafc003713e99d619a2b18b1032e2a31773868853771cf871e1f6457d8cb04e8`，Connector PID `62551`。
- 已生成 Windows 测试包：
  - `/Users/zer0y/Downloads/tianyuan-workbench-v0.14.14-windows-x64-20260729.zip`
  - `/Users/zer0y/Downloads/tianyuan-workbench-v0.14.14-windows-x64-lite-20260729.zip`
- 新用户测试应发送完整包，不发送 lite 包。
- 当前暂未推送 GitHub；等 Windows 新用户确认 `0.14.14` 可安装后再发布正式 Release。

## 2026-07-29 当前状态：本机已修复到 v0.14.13

- 用户截图现象：侧栏显示当前 `v0.14.11` 或 `v0.14.12`、发现新版但更新失败，状态码 `WORKBENCH_UPDATE_FAILED`。
- 已确认根因：`0.14.12` macOS 轻量更新脚本误判 Python，只检查固定 Python.framework 3.14 路径，没有复用本机可用 `/usr/bin/python3`。
- 已修复 `release/macos-arm64/安装.command`：新增可用 Python 探测和复用逻辑，更新模式不再因缺少固定路径而失败。
- 当前本机运行副本：`~/.tianyuan-workbench/projects/天源评估系统/extension`，版本 `0.14.13`，构建编号 `2026072901`。
- 当前 Native Helper：`~/.tianyuan-workbench/native-helper`，运行兼容指纹 `99106db7100efe4e33b63fb0e82694b902d280abdf88e119e52f2daaf28bf493`。
- Connector 已启动：`/usr/local/bin/node ~/.tianyuan-workbench/native-helper/native_host.js --connector-bridge`，PID `43774`。
- 直接更新检查结果：公开最新 `0.14.12`，当前本机 `0.14.13`，`updateAvailable=false`，`repairRequired=false`。
- 通过验证：macOS 安装脚本语法、更新模块语法、Native Helper/更新器语法、静态扩展契约、更新检查器、更新安装器、更新清单、更新模块、macOS 轻量包和 `git diff --check`。
- 待用户在 Chrome `chrome://extensions` 重新加载“天源工作台”，确认侧栏显示 `v0.14.13` 且不再显示 `WORKBENCH_UPDATE_FAILED`。
- 当前暂未推送 GitHub；等用户确认本机 UI 正常后，再决定是否发布正式 `v0.14.13`。

## 2026-07-28 更新按钮不可用检查与 v0.14.11 同步

- 截图现象：`0.14.9` 显示发现 `v0.14.11`，但提示“未找到当前平台安装包”，导致“测试更新模块”和“更新全部组件”不可用。
- 根因：`0.14.9` 的 Native Helper 已支持 Gitee 更新源，但侧栏前端仍只允许 `github.com` URL，Gitee 安装包 URL 被过滤为空。
- GitHub 最新源码 `0.14.11` 已修复该问题，侧栏安全 URL 白名单已包含 Gitee 和 GitHub 相关下载域名。
- 本地源码已快进到 `e8d11dc42ff7a1c029b3c55cb6cfaba2e48ec53b`。
- 本机运行副本已安装到 `0.14.11`，构建编号 `2026072812`，运行兼容指纹 `1d577f005c3f39a73e59ce4bdbba0efdaca5e713bd1b3f79ff0aa0554bfac6f5`。
- Connector 已重启，PID `83461`，Native Helper 自检通过。
- 验证通过：更新检查器、更新安装器、更新清单、更新模块、静态扩展契约、macOS 轻量包、Windows 轻量包和 `git diff --check`。
- 当前本机更新检查回读：最新版本 `0.14.11`，当前版本 `0.14.11`，`updateAvailable=false`。
- 待用户在 Chrome `chrome://extensions` 对“天源工作台”点击重新加载，刷新侧栏后应显示已是最新版本。

## 2026-07-28 GitHub 最新版同步到 v0.14.9

- 本地源码已从 `8cc51043e8d0d64182874e4d0f6adb5b111c8baf` 快进到 GitHub `main` 最新提交 `99fcfa29cdb1b852510ea2fc9fc892626054c741`。
- 当前版本为 `0.14.9`，构建编号 `2026072810`，发布通道 `stable`。
- 公开 Release 已核对：`v0.14.9`，5 个资产均为 `uploaded`。
- 本机运行副本已重新安装到 `~/.tianyuan-workbench/projects/天源评估系统/extension`。
- Native Helper 已同步到 `~/.tianyuan-workbench/native-helper`，自检通过。
- Connector 在线，PID `84925`，协议 `connector-agent-binding-v3`，运行兼容指纹 `468c82cd2104f9522fb9edab6c9c000cf717a52cedc8780b8657cc6b9b8185d8`。
- 打印格式依赖通过：Python 可用，`openpyxl 3.1.5` 可用，天源 CLI `0.1.0` 可用。
- 自动验证通过：扩展静态契约、Agent/Connector Bridge、平台适配、更新检查器、更新安装器、Windows runtime/ZIP/编码/轻量包/Agent 安装提示/CLI 降级、本地运行复制、模块化、反馈模块、打印格式页设置和 `git diff --check`。
- 待用户在 Chrome `chrome://extensions` 对“天源工作台”点击重新加载，或重新加载未打包目录：`~/.tianyuan-workbench/projects/天源评估系统/extension`。
- 本地仍有未跟踪用户目录 `天源 cli 安装文件/`，本轮未处理。
- 普通 Git HTTPS 拉取在本机网络下连接 GitHub 443 超时；本次通过 GitHub API 校验同步，最终本地 `HEAD` 和 `origin/main` 已一致。

## 2026-07-28 Windows ZIP 文件名编码修复 v0.14.8

- 当前开发版本：工作台 `0.14.8` / 构建 `2026072809`，Connector 保持 `0.4.2`。
- 正式 `0.14.7` ZIP 中 `安装.ps1` 被解码为 `σ«ëΦúà.ps1`，旧更新器无法找到安装程序。
- Windows 发布包已从 macOS `/usr/bin/zip` 切换为 Python `zipfile`。
- 新测试要求中文兼容入口设置 ZIP UTF-8 标志，并可按精确文件名解压。
- 定向更新器、启动器编码和 ZIP 编码测试已通过。
- 待完成全量测试、双平台构建、正式包回读和发布。

## 2026-07-28 Windows 更新器自举修复 v0.14.7

- 当前开发版本：工作台 `0.14.7` / 构建 `2026072808`，Connector 保持 `0.4.2`。
- Windows 侧栏更新失败根因已确认：更新器查找 `安装.ps1`，实际包只有 `install.ps1`。
- 新更新器优先使用 `install.ps1` 并兼容历史名称。
- Windows 新包增加旧更新器自举所需的 `安装.ps1` 兼容别名；用户手动入口仍为 `install.cmd`。
- Windows 新路径启动测试和旧包兼容测试均通过。
- 根目录 `16` 个测试文件和反馈服务 `7` 项测试全部通过。
- `v0.14.7` 源码提交和标签已推送，公开 Release 已上线，5 个资产均为 `uploaded`。
- Windows/macOS SHA-256 分别为 `98971b91a4bc919f0e246935ad49cae656fa9bc53088db389f66c9df289d641d` / `0a439ce0b74d218caae28af87ef716849febad94576537140468c6c574d8365f`。
- 在线检查确认 Windows `0.14.2` 可发现 `0.14.7`；正式包已通过旧更新器自举路径验证。

## 2026-07-28 Windows 确定性目录复制 v0.14.6

- 当前开发版本：工作台 `0.14.6` / 构建 `2026072807`，Connector 保持 `0.4.2`。
- `0.14.5` Windows 实机确认 `fs.cpSync` 可无异常返回但完全不生成 `skills.staging-*`。
- 已排除 `skills` 软链接、发行 ZIP 漏项、CLI、Python 和前置校验问题。
- 所有管理目录改为逐目录创建、逐文件复制、文件大小校验和完整树清单比对。
- 实际四棵源码目录复制回读一致，测试中强制禁止调用 `fs.cpSync`。
- 根目录 `16` 个测试文件和反馈服务 `7` 项测试全部通过。
- 当前处于全量回归阶段，尚未发布 `v0.14.6`。

## 2026-07-28 Windows staging 重命名回退 v0.14.5

- 当前开发版本：工作台 `0.14.5` / 构建 `2026072806`，Connector 保持 `0.4.2`。
- `0.14.4` Windows 实机确认失败原因为 `skills.staging-* -> skills` 原子重命名 `ENOENT`。
- 已为 staging 目录增加存在性门禁，空校验清单不再跳过目录检查。
- 原子替换失败时直接从安装源覆盖正式目录；成功后删除备份，失败则恢复旧目录。
- 动态故障注入测试已覆盖 rename 消失与首次 staging 复制消失。
- 根目录 `16` 个测试文件和反馈服务 `7` 项测试全部通过。
- `v0.14.5` 源码提交和标签已推送，公开 Release 已上线，5 个资产均为 `uploaded`。
- Windows/macOS SHA-256 分别为 `c2071d3b094dceb4c843589eaa13231106198e5d67146bb75a2bf845d9b4d39c` / `13b7c87e718ffccc7d71e6c7290028644e4d6cf777c02c09c8493a456b99f714`。
- 在线检查确认 `0.14.4` 可发现 `0.14.5`。
- 待用户在真实 Windows x64 上运行新版 `install.cmd` 完成实机验收。

## 2026-07-28 Windows 本机组件同步修复 v0.14.4

- 当前开发版本：工作台 `0.14.4` / 构建 `2026072805`，Connector 保持 `0.4.2`。
- Windows `0.14.3` 实机确认 CLI 与 Python 均正常，失败点进入第 `5/7` 步本机组件同步。
- 已核对正式 ZIP 的 32 个必需源文件全部存在，排除发行包漏文件。
- 本机目录复制增加三次重试和必需文件单独补拷。
- 失败输出改为可解析的单行 JSON，后续报告会显示真实路径和原因。
- 根目录 `15` 个测试文件和反馈服务 `7` 项测试全部通过。
- `v0.14.4` 源码提交和标签已推送，公开 Release 已上线，5 个资产均为 `uploaded`。
- Windows/macOS SHA-256 分别为 `e8beccc4e9b50f88d22a9b71f2a9ed598b88acd7fb6d659c5732c388cd811842` / `b215f623ac798f6de257f3476e28366deeb88b570f98180f4e6d2ba219fa1848`。
- 在线检查确认 `0.14.3` 可发现 `0.14.4`，当前 `0.14.4` 无版本更新。
- 待用户在真实 Windows x64 上运行新版 `install.cmd` 完成实机验收。

## 2026-07-28 Windows CLI 独立降级 v0.14.3

- 当前开发版本：工作台 `0.14.3` / 构建 `2026072804`，Connector 保持 `0.4.2`。
- 已确认 Windows 安装失败发生在第 `2/7` 步：安装器选中存在但不可运行的 CLI 后，将其作为整包致命错误。
- 已改为逐个执行 `--version` 验证 CLI 候选；失效候选不会再被复用。
- 已验证 CLI 的绝对路径会固定到 Windows 本机运行配置，Native Helper 后续直接复用。
- CLI 包内修复失败时继续更新扩展、Native Helper、Connector 和打印组件，安装报告显示 CLI 独立待修复。
- 根目录 `14` 个测试文件和反馈服务 `7` 项测试全部通过。
- `v0.14.3` 源码提交和标签已推送，公开 Release 已上线，5 个资产均为 `uploaded`。
- Windows/macOS SHA-256 分别为 `a304c21a92d161df1cad7364b637bdb388d3a46110f442d582cf4efe87681f56` / `8bd2b782921820fbd0416b59636e79b8bcb5f0ddde985b589bd8a5c042350b74`。
- 匿名更新检查确认 `0.14.2` 可发现 `0.14.3`，当前 `0.14.3` 无更新。
- 待用户在真实 Windows x64 上运行新版 `install.cmd` 完成实机验收。

## 2026-07-28 Windows 申报表一页宽修复 v0.14.2

- 当前开发版本：工作台 `0.14.2` / 构建 `2026072803`，Connector 保持 `0.4.2`。
- 修复反馈 `TYF-20260728-A4E64B91`：Windows Excel/WPS 可能未稳定识别申报表所有列一页宽。
- 新增完整 `pageSetUpPr` 和 `pageSetup` OOXML 标志，并保持明细表 100% 比例规则不变。
- 根目录 13 个测试文件、反馈服务 7 项测试、Python 编译和 OOXML 回归测试全部通过。
- `v0.14.2` 源码、标签和公开 Release 已上线，5 个资产均为 `uploaded`。
- Windows/macOS SHA-256 分别为 `943b437a872e70b00be734494f2ce247e40b5ab08b5834128ee186c0a66b3961` / `48ae731c7594556f60e4ef68ca6924a28806ff53fd237eb78c7bd161bc1d151a`。
- 匿名在线检查确认 `0.14.1` 可发现 `0.14.2`；已安装 `0.14.1` 更新器对正式包自测通过。
- 反馈状态已更新为 `resolved`。
- 本机保持 `0.14.1 / 2026072802`，等待用户亲自点击更新，不由 Agent 代为安装。

## 2026-07-28 更新模块安全自测 v0.14.1

- 当前开发版本：工作台 `0.14.1` / 构建 `2026072802`，Connector 保持 `0.4.2`。
- 侧栏新增“测试更新模块”，测试下载、SHA-256、解压和安装包完整性，不执行安装。
- 下载增加三次重试、GitHub 备用通道、临时文件原子替换和大小校验。
- 自动测试覆盖成功、自清理、安装程序未启动、SHA 不一致、大小不一致及网络错误码。
- 真实公开 `v0.14.0` macOS 包自测通过，下载 `127421471` 字节，`packageValid=true`、`installed=false`。
- 根目录 12 个测试文件与反馈服务 7 项测试全部通过。
- 本机运行副本已同步为 `0.14.1`，Native Host 自检通过，Connector 已重启。
- 当前仅需在 Chrome 扩展管理页重新加载一次；尚未提交、打包或发布 GitHub。

## 2026-07-28 私有反馈服务 v0.14.0

- 当前开发版本：工作台 `0.14.0` / 构建 `2026072801`，Connector 保持 `0.4.2`。
- Cloudflare Worker 和私有 D1 已部署，生产地址为 `https://feedback.zer0y.com/api/feedback`。
- 反馈提交不依赖 GitHub、Agent、MCP 或用户 token，成功时返回匿名反馈编号。
- 扩展已切换到 `deliveryMode: service`，并加入固定反馈域名权限。
- 服务端固定校验扩展来源、字段白名单、大小限制、二次脱敏和匿名限流。
- 全部本地测试与反馈服务 7 项测试通过。
- 线上模拟提交、D1 回读和测试记录清理通过；未执行天源线上写入。
- 本机运行副本已同步到 `0.14.0`，Native Host 与 Connector 自检通过。
- 源码提交和标签为 `09f80e0c2da955f0694514d355ee1369fe16683a` / `v0.14.0`。
- Windows 正式包 SHA-256 为 `0e958366ea515df692604647b7ed93c9d2f8f986056118cacb6dcc3e36ed1487`。
- macOS 正式包 SHA-256 为 `7a7af43f617ed04673ccde1adda7f5c0e4096c69b63aebc90b328bc4761d52b1`。
- 两个平台包均为 `source_dirty=false`，运行指纹为 `9e4300d474c0c4a5e5fe83e5c5627ff8901dad098465f7eac9aed685500406b2`。
- 公开 `v0.14.0` Release 已发布为 Latest，5 个资产均为 `uploaded`。
- 在线检查确认 `0.13.2` 可发现 `0.14.0`，`0.14.0` 无重复更新提示。

## 2026-07-27 Windows tycpv CLI 识别修复

- 当前发布版本：工作台 `0.13.2` / 构建 `2026072706`，Connector 保持 `0.4.2`。
- 修复 Windows 安装器误把注册表 `DisplayIcon` 的 `D:\tycpv\tycpv.ico` 当作 CLI 执行的问题。
- Windows 安装器现在只接受 `tycpv.exe` 和 `tycpv.cmd`，并支持 Node 封装形式的 `D:\tycpv\tycpv.cmd`。
- Native Helper 的 Windows CLI 候选同步加入 `tycpv.cmd`，运行阶段不再只找 `tycpv.exe`。
- Connector 版本不一致提示改为引导用户完全退出 Chrome/Edge 后运行最新 `install.cmd`。
- 正式 Windows 包：`tianyuan-workbench-v0.13.2-windows-x64.zip`，SHA-256 为 `9a0ba31fe1bd85098b78ec5f1ec968a731ba25a40c5937255227a3473dbe5b43`。
- 源码提交和标签：`2d8bf7cfea2d8ecae5d3168317f883905becd3e2` / `v0.13.2`。
- 正式包为 `source_dirty=false`，运行指纹为 `bc67fa74717cfaff4930006e43cd1c878283f5922a22f4f8062377d5e9ff0b2a`。
- Windows ZIP 内部条目数 `365`，非 ASCII 文件名数量 `0`；公开发行仓库 `v0.13.2` 已发布并标记为 Latest。
- 在线检查已确认 `0.13.1` 可发现 `0.13.2`，`0.13.2` 不会重复提示更新。

## 2026-07-27 Windows Agent 一键安装提示词包

- 当前发布版本：工作台 `0.13.1` / 构建 `2026072705`，Connector 保持 `0.4.2`。
- Windows 包根目录、入口文件和说明文件均改为 ASCII 名称；`START_WITH_AGENT.txt`、`AGENT_INSTALL_PROMPT.md` 和 `INSTALL_README.md` 带 UTF-8 BOM。
- 提示词支持两种入口：已解压包直接安装；无本地包时查询公开 Latest Release、下载、SHA-256 校验、安装并执行只读验收。
- 正式 Windows 包：`tianyuan-workbench-v0.13.1-windows-x64.zip`，SHA-256 为 `4ff45d6b5a947bd5aff8235c042d221de7eda90c8b8a35649219dcdb28db5b3f`。
- 源码提交和标签：`7aa2c7e2bb7d86fbd5feac2484ceb76b107588ed` / `v0.13.1`。
- 正式包为 `source_dirty=false`，运行指纹为 `96c2cfe8cb07643469c476a39e5ebcb2cfabab987e0f2cfe4ec9eed8a2488eb4`。
- ZIP 内部条目数 `365`，非 ASCII 文件名数量 `0`；已完成提示词、编码、静态契约、ZIP 完整性和更新检查验证。
- 公开发行仓库 `v0.13.1` 已发布并标记为 Latest；`0.13.0` 可发现 `0.13.1`，`0.13.1` 不会重复提示更新。

## 2026-07-27 完整更新正式发布

- 当前本地开发版本：工作台 `0.13.0` / 构建 `2026072703`，Connector `0.4.2`。
- 已实现完整组件更新协议、SHA-256 校验、双平台安装启动器、更新状态轮询和扩展自动 reload。
- 发行包构建脚本已包含 Connector、统一安装脚本、完整 skills；Windows 包包含受控 Node 运行时。
- 自动测试已覆盖更新成功、SHA 不一致拒绝、旧 Connector 行为修正和既有 Agent 绑定回归。
- Windows 实机截图暴露的 CMD 编码故障已修复；包内中英文 `.cmd` 均为 ASCII/CRLF，`.ps1` 均带 UTF-8 BOM。
- `v0.13.0` 已在公开发行仓库发布并标记为 Latest，五个发行资产均为 `uploaded`。
- Windows 正式包 SHA-256：`f49777a1e7f59496ca924d071bc601dc25eb721119f5dbaed9a996e0ece03b8e`。
- macOS ARM64 正式包 SHA-256：`d59d35d53eb27eb901abf58ebca69cec2d8663fab66bbb0cc6748dad5c018d69`。
- 在线检查已确认 `0.12.2` 能发现 `0.13.0`，当前 `0.13.0` 不会重复更新。
- `0.12.2` 及更早版本首次升级仍需手动安装 `0.13.0`；之后可在侧栏使用“更新全部组件”。

## 2026-07-26 侧栏紧凑布局

### 已完成

- 压缩顶部状态区。
- 将版本更新和反馈移到顶部工具区。
- 首页从 10 项调整为 8 个实际业务功能。
- 420px 和 720px 截图验证通过，无横向溢出。
- 模块与静态契约测试通过。
- 本机运行副本已同步到 `0.12.2`，运行指纹为 `df1ecf1b7b21bd74c0e83608e3f31fc92eec8adc604b00d1dce035a1e9f84c7e`。

### 待确认

- 用户重新加载扩展后查看真实侧栏效果。
- 确认 420px 左右实际侧栏中，顶部两行状态文字清晰可读。

### 发布状态

- 用户要求公开安装版同步到 `0.12.2`。
- `0.12.2` 已切换为 `stable` 并完成 Windows、macOS 正式发布。
- 指定发布日期为未来日期 `2026-07-27`，构建编号 `2026072701`。
- 公开 `v0.12.2` Release 已上线，5 个资产在线回读均为 `uploaded`。
- 当前版本更新检查显示已是最新版；`0.12.1` 可发现 `0.12.2`。

## 2026-07-26 Windows Connector 复测

### 已完成

- 读取并归档 Windows 用户修复报告。
- 修复 Connector Node 脚本启动参数。
- 增加 SEA EXE / Node 脚本双模式识别。
- 增加 Windows `.cmd/.bat` CLI 安全包装。
- 加固 Windows 原子升级、状态保留、契约校验和失败回滚。
- 本机 Node 脚本模式 Connector 回归通过。
- 重新构建 Windows x64 `0.12.1` 测试包并放入下载目录。

### 待验证

- Windows 10/11 x64 运行新版 `安装.cmd`。
- 核对安装报告中的版本 `0.12.1`、构建编号 `2026072605` 和运行指纹。
- 核对 Connector 自动启动不再出现版本不一致或超时。
- Chrome 和 Edge 分别重新加载扩展并检查连接状态。
- 验证 CLI 为 EXE 和 `.cmd` 包装器两种环境时的版本检查、授权和导出。

### 发布状态

- 用户决定直接正式发布，后续依据用户反馈迭代。
- 私有源码仓库 `main` 已推送提交 `c7d2705`。
- 源码标签 `v0.12.1` 已推送。
- 公开发行仓库正式 `v0.12.1` Release 已上线。
- Windows 和 macOS 正式包及 SHA-256、更新清单均已发布。

## 2026-07-26 反馈模块

### 已完成

- 新增独立反馈模块和首页入口。
- 新增本机草稿、隐私确认、安全诊断、复制反馈和敏感内容拦截。
- 新增反馈服务源码和测试。
- 创建私有 GitHub 反馈仓库并启用 Issues、配置分类标签。
- 正式版本统一为 `0.12.1` / `2026072605`。
- 本机运行副本已同步，运行指纹为 `e54f3743a5865da20252d7a6c71db262bc07fca1f817203d0b6073852b69dfc6`。

### 待完成

- 选定 HTTPS 托管平台并部署 `feedback-service/`。
- 创建 GitHub App，只授权私有反馈仓库 `Issues: write`、`Metadata: read`。
- 在部署环境配置 App ID、Installation ID、私钥、仓库和允许的扩展 ID。
- 把正式 HTTPS 地址加入 `manifest.json` 的 `host_permissions` 和 `feedback.json`。
- 完成一次真实反馈提交、GitHub Issue 回读和隐私字段复核。

### 当前门禁

- 自动提交按钮保持禁用。
- 反馈模块已随 `v0.12.1` 正式发布；自动提交服务仍保持禁用。

更新时间：2026-07-26 CST

## 当前阶段

项目进入 `0.11.0` 浏览器功能模块化验证阶段。跨平台 Native Helper 保持不变，侧栏已建立模块注册、生命周期、独立存储和功能开关；“版本更新”完成首个独立模块迁移，其余八个功能通过兼容模块清单继续运行。

## 2026-07-26 模块化单体第一阶段

- 新增 `extension/src/core/` 模块基础设施。
- 新增 `extension/src/app/legacy-feature-modules.js`，集中描述八个既有功能的路由、范围和挂载位置。
- 新增 `extension/src/modules/updates/`，更新功能的 JS、模板和 CSS 已离开主侧栏文件。
- 主侧栏从约 `5930` 行降到约 `5679` 行。
- 首页模块数量由注册中心计算，不再写死运行数量。
- 支持 `stable/beta/disabled` 本机功能开关。
- 版本升级为 `0.11.0`，构建编号 `2026072603`。
- 本机运行指纹为 `edbae1f8c20a6ab8fe7c755c78b77734049631bf727fb75e8b596c6129bfad7a`。
- Connector 当前 PID `82777`。
- 自动测试全部通过；尚需在 Chrome 扩展页重新加载后做视觉确认。
- 更新模块会校验当前版本、构建编号和运行指纹，不复用不匹配的旧更新缓存。
- 本轮未执行线上写入，也未构建安装包或推送 GitHub。

## 2026-07-26 跨平台适配层

- 新增 `native-helper/platform/common.js`、`windows.js`、`macos.js`、`unsupported.js` 和 `index.js`。
- `native_host.js` 已移除直接 PowerShell、AppleScript、`netstat`、`taskkill`、`lsof` 和进程终止分支，改走统一平台接口。
- `connector_bridge.js` 已统一运行目录和凭据接口。
- Windows 新凭据优先使用当前用户 DPAPI；macOS 继续使用钥匙串。
- 本机安装器、macOS 安装脚本和 Windows 包均复制完整平台目录。
- 安装后统一自检会显示平台适配器、文件选择、凭据存储、进程控制和依赖状态。
- 开发版本升级为 `0.10.0`，构建编号 `2026072602`，尚未发布 GitHub Release。
- 本机运行指纹已固定为 `d508d40fe7d7fba7c0ff7ec50d94c1ce81a709eababfa8b04d7d0c251cffa646`。
- 构建缓存和测试包输出已从 OneDrive 迁到 `~/.tianyuan-workbench/`。
- 功能提交固定为 `4f1c456239d44223e2fc173e4a79c71af8bfdcce`。
- Windows 和 macOS 最终测试包已从该提交重新构建，外层和包内哈希、日期、提交号、运行指纹均一致。
- Windows SHA-256：`d3379a9941e06483776d5858fba95204bf7f0e199157f5a358559e66fe506354`。
- macOS SHA-256：`247ee1a9e88ac62fdb1ac6b86d1cf36ec5675d51241322f300c24e107d521c3e`。
- 安装器已实现自检后自动启动 Connector，当前 PID `79593`。

## 本轮稳定性审计结论

- 反复出现问题的主要原因不是单一业务逻辑，而是多份运行副本和旧监听并存：
  - manifest 版本相同，但源码已经变化；
  - Connector 后台进程仍运行安装前的内存代码；
  - content script 或 page adapter 重复注入后旧监听未被可靠替换；
  - 安装器先删除再复制，Chrome 可能读取到半安装目录。
- 已新增统一代码指纹 `runtimeBuildId`。扩展和 Connector 当前共同指纹为 `d75cba0b35c7ec5c6864bf24936d3933c711fb35bb8031c9bf3153dcd48f5edd`。
- Connector 旧进程 PID `7862` 已通过 Native Host 受控替换为 PID `14423`，新进程健康信息已回读相同代码指纹。
- 页面适配器升级为 `v29-replaceable-listeners`：
  - content script 使用 IIFE，避免顶层常量重复声明；
  - 重复执行时移除旧 Chrome message listener；
  - MAIN-world adapter 重复注入时移除旧 context/action listener；
  - 上下文请求超时后允许下一次重新注入。
- 安装器改为 staging 校验后整体替换，并对 Native Helper 单文件使用临时文件原子替换；安装失败时保留旧运行目录。
- 批量上传不再只验证单元格非空：
  - 从分类接口响应提取分类批次值；
  - 统一保存时按行传入预期批次值；
  - 保存成功后逐行回读并验证每个预期批次值；
  - 缺少批次值或回读不一致时明确失败，不报告假成功。
- 新增 `tests/static-extension-contract.test.cjs`，覆盖 manifest 文件、HTML ID、JS 控件引用、适配器版本、Connector 协议、插件版本、重复注入、运行路径和安装契约。
- 当前自动验证全部通过：
  - JavaScript 语法检查；
  - 静态扩展契约测试；
  - Agent/Connector Bridge 回归测试；
  - `git diff --check`；
  - 本机运行文件与源码逐文件一致；
  - Native Host 自检：Python、打印脚本和 CLI 均可用。

## 待完成真实回归

- 2026-07-24 23:15 截图确认 Chrome 仍加载 OneDrive 源码目录中的扩展，该目录没有安装器生成的 `runtime-compat.json`，因此侧栏正确阻断并显示运行副本不一致。
- 必须先移除当前扩展，再从 `~/.tianyuan-workbench/projects/天源评估系统/extension` 加载未打包扩展。
- 在 `chrome://extensions/` 对“天源浏览器工作台”点击重新加载。
- 刷新当前天源底稿页，确认扩展错误列表为空。
- 打开侧栏，确认 Connector 自动识别新运行副本，重新绑定当前对话。
- 只读确认当前科目和 Sheet 识别正常。
- 正式上传测试按以下顺序进行：
  - 单文件单行；
  - 两个文件不同两行；
  - 两个文件同一行不同分类，确认系统单元格是否能同时保留两个分类批次。
- 同一行多文件在真实回读规则未验证前，不应作为已稳定能力发布。

## 2026-07-24 23:27 批量上传按行执行修复

- 用户确认天源规则：同一行支持多个文件，但必须一次选择多个分类文件后点击一次保存；已有附件的行不能追加。
- 当前失败原因已确认：旧插件按文件逐个打开弹窗并保存，同一行第二个文件触发分类接口业务 code 500。
- 已改为按行分组：
  - 同一行所有文件一次性传入浏览器；
  - 按映射注入不同上传分类；
  - 确认所有文件名均在弹窗显示后，只点击一次保存；
  - 每行只接收并回读一个最终分类批次号。
- 执行前新增空白行预检；目标行已有资料索引时直接停止，不调用上传接口。
- 当前真实页面读回：
  - `Q2=fda54185-6b17-41d5-b0b4-908c12f057ab`；
  - `Q3=ed76f919-4e84-4ca0-b460-f73b11027ede`；
  - 两行核实程序均为“凭证/合同”。
- 本机运行副本已同步，Connector PID 为 `18629`。需要重新加载扩展后使用空白行做真实回归。
- 用户重新加载并实测后确认“可以了”。Connector 回读显示当前 session 在线、当前对话绑定有效、SpreadJS 和编辑门禁状态正常。本轮按行一次上传修复视为真实界面初步验收通过。

## 2026-07-24 23:44 批量清理附件临时功能

- 首页新增第 8 个功能模块“批量清理附件”。
- 功能处理当前 Sheet 联动的“查证类核实程序”和“查证资料索引”两列：
  - 自动识别当前科目、Sheet 和资料索引列；
  - 列出资料索引非空或核实程序仍有残留的明细行；
  - 支持全选、全不选和逐行勾选；
  - 确认后统一清空所选行的核实程序、资料索引和附件关联 tag 并保存；
  - 逐行回读两列均为空，同时确认“查证核对情况”未改变。
- 清理动作保留“查证核对情况”，不删除附件库物理文件。
- 正式执行携带扫描时的行号、资料索引值和核实程序值；若执行前任一数据发生变化，按不一致停止。
- 静态扩展契约、Connector/Agent Bridge 回归和 JavaScript 语法检查均通过。
- 本机运行副本已同步，Connector PID `21929`，`runtimeBuildId` 为 `b35c755df6614332019cda22f6fa4e51cb8ac6e77b53df3f870eb6597a9b7204`。
- 尚需重新加载扩展后做一次界面和真实清理回读测试。
- 首次界面测试发现识别页面停在“正在扫描”：清理识别函数设置全局忙碌后，Connector 动作队列按忙碌门禁暂停，形成自锁。已将识别过程纳入 `batchCleanupState.running` 放行条件并重新安装；当前 Connector PID `22644`，`runtimeBuildId` 为 `e9039552c3b8dbd9f5ce2adec0788282dad0f84cb9960eab2705cb838580ee0b`。
- 首次真实清理后，资料索引已清空，但核实程序仍残留“凭证/合同”等文本。根因是旧口径只清理资料索引，并且后续扫描只识别资料索引非空行。
- 已调整为扫描“资料索引或核实程序任一有值”的行，清理时同时清空两列并保留核对情况；执行前校验两列原值，保存后验证两列为空且核对情况未改变。
- 2026-07-24 用户重新加载扩展并复测后确认“可以了”，本轮批量清理联动逻辑完成真实界面验收。
- 当前固定基线建议标记为 `baseline-workbench-0.8.3-stable-20260724`；本轮验收后不再修改执行代码。

## 当前新增成果

- 连接配置页增加 Connector 状态、启动、绑定当前页面、session、项目/公司/科目摘要和最后心跳。
- 顶部连接栏增加 Connector 状态，所有功能页持续可见。
- 新增本地 Bridge 协议：健康检查、能力协议、session 注册、heartbeat、session 读取。
- Native Messaging 支持点击“启动 Connector”自动拉起本地 Bridge。
- 能力矩阵明确显示读取、预演、确认后执行、本机执行和暂不支持边界。
- Connector 暂不接入浏览器内 Agent 对话和任意浏览器自动化。

## 2026-07-26 GitHub 检测更新模块

- 产品版本升级为 `0.9.0`，构建编号 `2026072601`。
- 首页模块由 8 个增加为 9 个，新增“版本更新”入口。
- 顶部连接栏新增版本状态，持续显示当前版本、发现更新、必须更新或组件需修复。
- 新增独立更新页面，显示当前版本、最新版本、通道、构建编号、平台、最后检查、更新说明、安装包、大小和 SHA-256。
- Native Helper 新增 `check_github_update` 白名单动作，固定读取公开 GitHub Releases，不接受任意仓库或 URL。
- 更新比较支持标准 SemVer，包括预发布版本，避免 `1.10.0` 与 `1.9.0` 字符串比较错误。
- 支持可选 `update-manifest.json`；没有清单时回退 GitHub Release 标签、正文和资产列表。
- 新增 `scripts/generate-update-manifest.mjs`，根据单一版本配置和 `dist/` 当前版本安装包生成 Release 更新清单。
- 本机运行目录已同步到扩展 `0.9.0`；Connector PID `52560`，运行指纹 `64b2cf6befaf748d38bd052da412171d3d781c6268188d3711e4a522251c07a2`。
- 已创建公开发行仓库 `zer0-lyz/tianyuan-browser-workbench-releases`，源码仓库继续保持私有。
- 已发布公开 `v0.9.0` Release：
  `https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/tag/v0.9.0`
- 匿名 GitHub API 回读成功，不需要 GitHub token。
- 当前 `0.9.0` 检查结果为“已是最新版”；模拟 `0.8.3` 检查结果为发现 `0.9.0`，并返回正确的 Windows x64 安装包和 SHA-256。
- 私有源码仓库中的重复 Release 已删除，源码标签 `v0.9.0` 保留并指向提交 `d0695d2f7e44e42a2e67bc243e4e4e1643f2c04b`。
- 下一步只需重新加载本机扩展目录，检查真实侧栏布局和“已是最新版”显示。
- 扩展开发版本升级为 `0.4.0`，固定扩展 ID 不变。
- 连接配置页已增加 Codex 项目、对话、绑定范围和解除绑定控件。
- Connector Bridge 已持久化 Codex 绑定，并支持项目/对话目录读取。
- WorkBuddy 来源注册后，Bridge 只读读取 `~/.workbuddy/workbuddy.db` 的 `workspaces` 和 `sessions` 元数据；侧栏可加载项目/对话列表，用户选择后确认绑定。
- WorkBuddy 目录读取不扫描窗口、不读取对话正文、不读取凭证；数据库不可用时保留手动绑定兜底。
- Codex、WorkBuddy 和后续 Agent 共用同一份 Connector 工具定义；WorkBuddy 通过 `connector-proxy` 聚合工具，不再复制开发。
- Connector MCP server 已实现标准 `ping`，避免 WorkBuddy 健康检查误判断线；统一架构决策见 `docs/decisions/2026-07-24-unified-agent-mcp-architecture.md`。
- 新增 Codex 只读 MCP 插件源码：`plugins/tianyuan-browser-connector/`。
- 当前 MCP 工具仅读取连接状态、session、上下文和能力，不执行天源写入。
- `tianyuan-browser-connector@personal` 已安装并启用；新建 Codex 对话后可加载新工具。
- 连接按钮无反馈问题已修复：扩展 `0.4.1` 会自动启动 Connector、绑定当前页面，再保存项目/对话绑定，并在按钮下方显示结果。
- 已完成 `0.4.1` 静态与服务验证：侧栏 155 个控件引用完整，Native Messaging 自动启动和 Connector 健康/协议检查通过；等待重新加载扩展后的真实界面回测。
- 新增对话控制评估核实附件上传基础能力：
  - 扩展升级为 `0.5.0`；
  - 连接器插件升级为 `0.2.0`；
  - 新增上传预演和确认后上传并保存两个 MCP 工具；
  - 新增绑定 session 动作队列、临时文件传输、浏览器脚本上传、网络结果核验和单元格回读；
  - 静态、本地协议和真实天源页面验证均已通过；
  - 已在 `应付职工薪酬` 的 `I2`、`工资计提表` 分类完成测试 PDF 上传；
  - 附件入库、分类批次、底稿保存和单元格回读闭环一致。
- 新增对话控制“查证核对情况”联动写入能力：
  - 已在当前 `应付职工薪酬` Sheet 第 2 行定位 `查证核对情况` 为 `J2`；
  - 已将测试结论写入为 `不一致`；
  - `/assignment_draft/save` HTTP 200 且业务 code 200；
  - `J2` 回读 text/value 均为 `不一致`；
  - 该能力限制为固定字段写入，不支持任意单元格写入。
- 新增当前科目“查证资料索引”批量核查能力：
  - 新增只读扫描动作，可批量读取当前科目的“查证资料索引”和“查证核对情况”；
  - 新增确认后批量填写动作，仅处理“资料索引有内容且核对情况为空”的行；
  - 当前 `长期待摊费用` 已验证：`查证资料索引` 为 `N` 列、`查证核对情况` 为 `O` 列，21 个数据行中资料索引有内容的行数为 0；
  - 本次批量处理正确空跑，未写入任何行，未触发底稿保存。
- 完成小批量真实模拟测试：
  - 第 2 行测试附件上传、分类、保存、`N2` 回读成功；
  - 批量填写将 `O2` 设置为 `不一致`，保存成功且回读一致；
  - 第 3 行附件入库成功但分类批次接口返回系统异常，未形成资料索引回读，未保存到底稿；
  - 已补强页面适配器，避免失败弹窗残留文件输入造成后续重复上传/分类。
- 本机 Native Host 已同步到 `~/.tianyuan-workbench/native-helper/`。

## 已完成

- 已确认 `extension/` 是 Chrome/Edge 通用的 Chromium Manifest V3 浏览器扩展源码目录。
- 已生成 Edge 可提交/传输用压缩包：
  - `dist/天源浏览器工作台-v0.3.0-Edge-插件-20260723-1624.zip`
  - 包内 `manifest.json` 位于根目录；
  - 已校验 manifest 可解析，版本为 `0.3.0`，`manifest_version` 为 `3`。
- 已新增两个打印格式批处理模块：
  - 首页新增“明细表打印格式”和“申报表打印格式”；
  - 支持选择多个文件或文件夹递归批处理；
  - 支持覆盖源文件、源文件夹打印版副本和新存放位置；
  - 支持 `.xlsx` 和 `.xlsm`；
  - 显示文件级进度、日志、成功数、失败数和输出路径；
  - 覆盖模式采用临时副本处理、ZIP 验证和原子替换；
  - 扩展版本升级为 `0.3.0`。
- 已迁入并安装两个打印格式 Skill：
  - `skills/appraisal-detail-print-format/`
  - `skills/appraisal-declaration-print-format/`
  - 本机运行副本位于 `~/.tianyuan-workbench/dependencies/天源评估系统/print-format-skills/`。
- 已新增两个 CLI 表格导出模块：
  - 首页新增“导出明细表”和“导出申报表”；
  - 进入功能页后自动加载当前项目公司清单；
  - 两个导出模块只选择公司，不显示科目范围；
  - 公司确认后可通过 macOS 文件夹选择器选择存放目录；
  - 导出过程通过持续 Native Messaging 返回日志和阶段进度；
  - 进度条显示当前百分比和最新状态；
  - 完成后记录输出目录、生成文件清单和 CLI 退出码；
  - 扩展版本升级为 `0.2.0`。
- 已扩展 Native Host：
  - 新增 `select_export_directory`；
  - 新增 `run_cli_export`；
  - 仅允许明细表和申报表两个 CLI 子命令；
  - 校验项目 ID、公司 ID 和真实输出目录；
  - 使用参数数组执行 CLI，不通过 shell；
  - 已同步安装到 `~/.tianyuan-workbench/native-helper/`。
- 已完成多页面侧栏工作台改造：
  - 顶部在所有页面持续显示 Helper、MCP、CLI 当前连接状态；
  - 新增首页功能中心，展示“批量保存底稿”和“批量退出编辑”入口；
  - 新增独立连接配置页，集中处理 MCP token、CLI 授权和连接检查；
  - 批量保存和批量退出编辑分别进入独立功能页；
  - 两个功能页分别保存公司、科目、确认状态、日志和证据，不互相覆盖；
  - 返回首页或连接页后，再进入原功能可恢复该功能的工作范围；
  - 任务执行期间禁止页面跳转，避免运行状态漂移；
  - 执行日志和证据 JSON 默认折叠。
- 已调整侧边栏交互结构：
  - 公司和科目从“保存功能配置”中拆出，成为独立的“工作范围”；
  - 工作范围顺序改为先公司、后科目；
  - 公司确认后自动收起公司范围并展开科目范围；
  - 科目确认后自动收起科目范围；
  - “保存底稿”改为“功能模块”下的第一个模块，后续功能可继续并列加入。
- 已新增第二个功能模块“退出编辑”：
  - 放在“功能模块”区域，与“保存底稿”并列；
  - 复用已确认的公司范围和科目范围；
  - 支持预演模式，只定位“退出编辑”按钮，不点击；
  - 支持正式执行模式，必须勾选确认后才会点击；
  - 正式执行前会沿用公司范围选择和读回校验逻辑；
  - 每个科目独立执行，单个科目失败后继续下一个科目；
  - 批量结果写入扩展本地存储 `tianyuanWorkbenchLastBatchResult`。
- 已修复部分公司执行不按面板勾选范围的问题：
  - 面板不再只传公司名称，而是传结构化公司选择对象；
  - 执行层按公司编号、简称、全称、标题、ID 多字段匹配天源公司弹窗；
  - 正式保存前会把弹窗选择状态调整为“只选面板确认的公司”；
  - 保存前读回弹窗实际勾选结果，若与面板选择不一致则停止保存并记录差异。
- 已修复科目清单漏掉“其他应付款”等显示科目的问题：
  - 科目加载不再先用 MCP 显示字段裁剪；
  - MCP 负责提供全量代码和名称；
  - 天源页面左侧展开后的真实显示树负责最终过滤；
  - 只把页面显示树中的叶子科目作为可勾选保存项；
  - 同名父子科目按页面层级深度匹配，避免父级“其他应付款”和子级“其他应付款”混淆。
- 已修复批量保存执行控制：
  - 单个科目失败、超时或页面上下文未就绪时，不再直接中断整个科目队列；
  - 后续科目继续执行，并在结果 JSON 和任务日志中记录失败原因；
  - 批量执行中的页面上下文刷新不再清空已确认的科目和公司选择；
  - 最近一次批量结果会写入扩展本地存储，便于后续恢复核查。
- 已固定当前版本基线：
  - Git 仓库已初始化；
  - 基线标签：`baseline-subject-company-selection-20260722`；
  - 压缩快照：`.snapshots/tianyuan-workbench-baseline-20260722.zip`；
  - 后续改动如导致回归，可按 `项目管理/VERSION_BASELINES.md` 回退。

- 创建新项目结构：
  - `docs/context/`
  - `docs/decisions/`
  - `docs/test-evidence/`
  - `extension/`
  - `native-helper/`
  - `skills/`
  - `prototypes/`
  - `项目管理/`
- 将旧项目 `context_handoff` 中 6 个文件复制到 `docs/context/`。
- 读取 `docs/context/README.md`。
- 读取核心文件：
  - `天源浏览器插件可行性与架构草案.md`
  - `天源评估核实附件上传能力记录.md`
  - `ego_asset_check_upload_template.sh`
  - `tianyuan-asset-draft-save.SKILL.md`
  - `save_asset_draft.js`
- 建立项目管理四件套：
  - `项目管理/AGENTS.md`
  - `项目管理/PROJECT_MEMORY.md`
  - `项目管理/PROJECT_STATE.md`
  - `项目管理/TASK_LOG.md`
- 新增 Chrome Manifest V3 只读插件骨架：
  - `extension/manifest.json`
  - `extension/src/background/service_worker.js`
  - `extension/src/content/content.js`
  - `extension/src/injected/page_adapter.js`
  - `extension/src/sidepanel/index.html`
  - `extension/src/sidepanel/styles.css`
  - `extension/src/sidepanel/sidepanel.js`
- 新增 MVP 决策记录：`docs/decisions/2026-07-22-mvp-readonly-context-panel.md`。
- 新增静态验证记录：`docs/test-evidence/2026-07-22-readonly-mvp-static-validation.md`。
- 新增真实页面验证记录：
  - `docs/test-evidence/2026-07-22-readonly-mvp-live-success.md`
  - `docs/test-evidence/2026-07-22-readonly-mvp-live-success.png`
- 新增批量保存任务模板：
  - 侧边栏任务区“批量保存底稿”
  - 支持当前公司、部分公司、全部公司
  - 支持多个科目逐个打开并保存
  - 支持预演和正式执行确认
- 批量保存面板已从手工输入改为清单选择：
  - 科目使用当前页面读取的显示科目复选清单
  - 部分公司可加载公司清单并多选
  - 面板宽度改为自适应布局
- 新增批量保存决策记录：`docs/decisions/2026-07-22-batch-save-task-template.md`。
- 新增批量保存静态验证记录：`docs/test-evidence/2026-07-22-batch-save-template-static-validation.md`。
- 新增 MCP/native-helper 清单来源决策记录：`docs/decisions/2026-07-22-mcp-native-helper-list-source.md`。
- 新增 MCP/native-helper 静态验证记录：`docs/test-evidence/2026-07-22-mcp-native-helper-static-validation.md`。

## 当前结论

插件技术可行。旧项目已验证 SpreadJS 页面识别、表头定位“查证资料索引”、通过 `operation-upload-cell.activateEditor(...)` 打开上传弹窗、前端注入文件、附件上传接口和分类批次接口。

正式落库链路尚未在编辑锁释放状态下完成闭环验证；旧测试中 `/assignment_draft/save` 被编辑锁拦截，明细回读确认 `CZZLSY` 未落库。

当前只读 MVP 不执行写入，不点击保存，不调用上传接口。静态验证已通过 manifest JSON 解析和 JS 语法检查。

已修复首次加载时的 manifest 兼容问题：`web_accessible_resources.matches` 改为 `https://excel.zhrdc.net/*`，content script 仍限定 `https://excel.zhrdc.net/ty/*`。

已补强公司列表页识别：在 `/equity/list` 可显示项目 ID，并提示点击某行“资产基础法”进入底稿页；底稿 SpreadJS 采集仍等待真实底稿页验证。

已增加自动补注入：侧边栏遇到 `CONTENT_SCRIPT_UNAVAILABLE` 时，会尝试向当前天源页注入 content script 后重试读取。因 manifest 新增 `scripting` 权限，需要在扩展页点“更新”或重新加载未打包扩展。

真实底稿页验证已通过：项目 ID `166983428210689`、主体 ID `166983430307866`、科目 `C3-1-2`、Sheet `应付账款`、查证资料索引 `P` 列、目标 `P2`、上传单元格 `operation-upload-cell`、保存按钮状态均可读取。

批量保存模板已接入面板。默认预演不写入；正式执行需要选择执行模式并勾选确认。尚未做真实点击保存验证。

第二轮 UI 修正已完成：不再要求用户手工输入科目代码；公司支持清单多选；侧边栏在宽面板下可自适应排布。

第三轮交互纠偏已完成：科目和公司均为“加载到插件面板后选择”。公司选择弹窗只作为读取公司清单的数据来源，读取后关闭，不要求用户在天源原生弹窗中确认。

第四轮修复已完成：新增“加载科目”按钮，专门触发左侧科目树读取；公司清单入口查找更宽，弹窗内只抓 checkbox label，避免读成空或大段文本。

第五轮修复已完成：新增 `native-helper/server.js`，公司和科目清单改为通过 MCP 工具读取，插件面板不再点击页面弹窗或科目树来加载清单。

第六轮修复已完成：修复首次注入页面适配器时消息过早发送导致的 `TIANYUAN_WORKBENCH_GET_CONTEXT_TIMEOUT`；新增 Helper/MCP/CLI 连接状态；页面、表格、门禁诊断合并为默认折叠区。

第七轮修复已完成：新增 Chrome Native Messaging Host，插件面板在 HTTP helper 未启动时可通过“启动/检查”自动拉起本地 helper 脚本。Native Host 已注册到 Chrome，扩展 ID 固定为 `lkflndcnklpeaejohaacoaolnmhgigoc`。

第八轮修复已完成：新增“配置 MCP”弹窗。用户可在面板输入 MCP token 并确认连接；token 只保存在本次侧边栏内存和当次 Native Messaging 消息中，不写入项目文件、Chrome 注册文件或日志。

第九轮修复已完成：新增“授权 CLI”按钮，通过 Native Host 调用 `/usr/local/bin/tycpv login` 打开 CLI 授权流程。授权完成后可点击“启动/检查”刷新 CLI 状态。

第十轮修复已完成：科目清单只使用 MCP 返回结果，不再回退到页面左侧树脏文本；公司清单区域默认显示；Native Host 和 HTTP helper 增加 MCP 嵌套清单递归展开。

第十一轮修复已完成：MCP 配置新增“记住本机”。默认 token 仍只存在当前面板内存；用户勾选后保存到 Chrome 本地扩展存储，避免反复配置；“清除”会删除保存 token。

第十二轮修复已完成：科目清单改为折叠树 UI，父节点展开/折叠，科目项复选。

第十三轮修复已完成：科目树不再用硬编码中文分类猜测层级，优先使用 MCP 返回的 `parentCode/parentName/path`；过滤非科目代码，避免出现顶部 `1` 等非科目节点；加载科目后才显示“全选 / 全不选 / 确认”；批量保存只使用已确认的 MCP 科目选择；面板端和 helper 端均过滤隐藏科目，仅保留右侧显示状态科目。

第十四轮修复已完成：点击“加载科目”后立即显示任务日志反馈；helper HTTP 和 Native Messaging 增加超时，加载成功/失败都会在面板显示明确结果，避免用户点击后无响应。

第十五轮修复已完成：修复 MCP 科目返回中包含空项时前端读取 `code` 崩溃的问题；前端、Native Host 和 HTTP helper 均增加空项过滤。

第十六轮修复已完成：科目节点显示统一为 `科目代码 科目名称`；扩展 MCP 显示/隐藏状态字段识别；加载科目时用当前页面可见科目名称对 MCP 清单做二次过滤，减少隐藏科目进入批量保存清单。

第十七轮修复已完成：父级科目名称在过滤隐藏科目前从 MCP 全量结果提取并回填；父级节点应显示为 `C3 流动资产`、`C3-1 货币资金` 等，而不是只显示代码。

第十八轮修复已完成：公司选择逻辑改为与科目一致；去掉“公司范围”下拉；默认当前公司已勾选；加载公司后显示树形清单、`公司编号 公司名称`、全选/全不选/确认；批量保存底层公司范围由确认选择自动推导。

第十九轮修复已完成：公司确认动作增加标题旁反馈；公司标题改为优先展示 `公司编号 公司简称`，系统 ID 仅作内部 value；helper 透传常见编码和简称字段。

第二十轮修复已完成：公司编号进一步明确为页面表格“编码”列的层级编码，如 `1-1`、`1-3-2`；侧栏和 helper 增加层级编码字段白名单，并禁止用系统 ID 作为显示编号兜底。

第二十一轮修复已完成：科目确认反馈改为与公司一致；“显示科目”标题旁显示默认、未确认和已确认数量。

第二十二轮修复已完成：公司层级编号在 MCP 未直接返回时，可根据父子关系和接口原始顺序推导；样本验证可生成 `1-1`、`1-3-2` 这类编号。

第二十三轮修复已完成：公司编码读取改为 MCP 与页面表格合并；MCP 提供系统 ID，后台打开 `equity/list` 按表头读取页面 `编码/公司名称/公司简称/上级母公司`，再合并展示。

第二十四轮修复已完成：公司列表页读取器改为等待表格行渲染后再读取，并区分 Element UI 固定列和主表区域。编码列优先从页面真实 `编码/公司编号/层级编码/序号` 表头读取，不再把按父子顺序推导出的编号作为公司编号展示，避免出现伪造的 `1/1-1` 编号。

第二十五轮修复已完成：根据截图确认面板仍显示公司简称而未显示编码，补充 MCP 公司清单与页面公司表的按行顺序合并兜底。若页面表格已真实读到编码，且页面行数与 MCP 公司数一致，即使用页面第 N 行真实编码补充 MCP 第 N 个公司，避免名称匹配失败导致编码丢失。

第二十六轮修复已完成：新增侧栏与页面注入脚本的版本握手，避免天源页面残留旧版 `page_adapter` 导致仍按旧逻辑读取公司清单。侧栏消息升级为 V2，旧 content script 会被绕过；新版 content script 注入带版本号的页面读取器，并只接受同版本读取结果。公司清单标题旁新增编码来源状态，显示 `编码 N/M`、`页面编码 0 行` 或读取失败。

第二十七轮修复已完成：根据面板显示 `页面编码 0 行`，确认固定 `/equity/list` 后台读取未取得公司编码。公司编码读取改为临时打开活动标签页读取，读完自动回到底稿页；若公司列表页仍无编码，则回当前底稿页打开“公司主体/选择更多”弹窗兜底读取，并尝试从弹窗节点文本、title、aria-label 和 data 属性中提取 `1/1-1/1-3-2` 形式编码。页面读取失败时会输出表格诊断。

第二十八轮修复已完成：根据面板显示 `页面编码未合并：页面 10 行`，确认页面已读取到真实编码但未匹配到 MCP 公司。合并逻辑改为用页面整行文本参与名称匹配；仍未匹配时，从页面已读取的真实编码行中按顺序补给 MCP 公司，不再要求页面行数与 MCP 公司数完全一致。

第二十九轮修复已完成：修正“页面 10 行”状态口径，区分页面行数和带编码行数；页面表格读取新增宽松模式，不依赖表头，只要表格行中存在 `1/1-1/1-3-2` 形式层级编码即可提取。侧栏合并前会从 raw cells、固定列 cells、label/text 中二次提取编码。

第三十轮修复已完成：公司清单根据真实编码前缀自动补充层级关系。若 `1-3` 和 `1-3-1` 均存在，则 `1-3-1` 自动挂到 `1-3` 下；父公司仍保持可勾选。不会创建不存在的虚拟父公司。

第三十一轮修复已完成：公司清单显示口径改为 `编码 + 公司简称`。页面全称仅用于匹配和备用，不再覆盖 MCP 返回的公司简称；缺少简称时才从公司全称中移除常见后缀作为显示兜底。

第三十二轮修复已完成：科目清单过滤右侧显示科目时，会从 MCP 原始清单补回所有真实父级科目，避免 `C3/C3-1` 只作为不可勾选分组显示。仅补回 MCP 中真实存在的父级，不创建虚拟可选科目。

第三十三轮修复已完成：移除基于当前页面左侧展开分支的科目二次过滤。科目清单现在以 MCP 返回的显示状态字段为准，仅由 `isDisplayedSubject` 过滤隐藏科目，避免只加载当前展开的 `C3 -> C3-1 -> C3-1-2` 分支。

第三十四轮修复已完成：按用户澄清，撤回父级分组强加复选框的改动。科目树只显示 MCP 标记为显示状态的科目；父级若不是显示状态科目，仅作为层级容器，不作为可选保存科目。

第三十五轮修复已完成：科目树构建改为按科目代码前缀稳定建树，避免旧逻辑混用 `parentCode/path/临时路径节点` 导致顶层父级偶发丢失。`C3-1` 永远挂到 `C3`，`C3-1-2` 永远挂到 `C3-1`；显示状态过滤仍以 MCP 字段为准。

第三十六轮修复已完成：按用户最终口径，科目树只展示 MCP 标记为显示状态的科目，不再为层级完整性创建非显示父级容器。子科目仅挂到已显示的最近父级；没有已显示父级时直接显示在根层。

第三十七轮修复已完成：核对历史验证记录后恢复科目树正确口径。隐藏科目不进入批量任务，但父级可作为无复选框层级标题显示，并显示为 `科目代码 科目名称`；只有 MCP 显示状态过滤后保留的科目才有复选框并参与批量保存。

第三十八轮修复已完成：核验 CLI 当前未暴露读取科目显示状态命令。MCP 返回的显示字段与天源左侧实际“显示/隐藏”口径不一致，科目过滤改为页面左侧实际显示树优先：MCP 提供代码/名称，`context.subjectTree` 作为最终显示状态校验。

第三十九轮修复已完成：页面左侧实际显示树过滤不再只看当前可见 DOM。加载科目时会先展开左侧科目树折叠节点，再采集天源“显示/隐藏”后的完整显示科目树，用于过滤 MCP 科目清单，避免折叠下的显示科目被漏掉。

第二十四轮修复已完成：公司页面表格读取支持 Element UI 固定列拆表结构；禁用无父级关系时的平铺假编号；公司加载证据 JSON 输出页面行和最终标准化结果。

第四十轮修复已完成：新增“退出编辑”功能模块。该模块在“工作范围”确认后执行，复用已确认的公司和科目清单；预演模式不点击按钮，正式执行需要勾选确认；执行前会按保存模块同样的公司范围逻辑调整并读回天源公司选择，避免部分公司选择与面板确认不一致。

第四十一轮整理已完成：按用户要求把底层依赖和运行态从 OneDrive 项目目录迁出。项目目录只保留基础项目资料、源码、文档和测试证据；CLI 安装包、外部工具目录、运行快照、Native Host 运行副本、launcher、日志和后续依赖统一放入 `~/.tianyuan-workbench/`。

第四十二轮 UI 优化已完成：侧栏执行日志改为默认折叠，并显示日志条数；证据 JSON 也改为折叠区，需要核查时再展开。整体视觉改为更接近 Codex 的轻量面板风格：弱化厚边框、减少大块噪音、主操作按钮更明确、列表和模块更紧凑。

第四十三轮科目修正已开始：用户反馈 `其他应付款` 未加载出来。初步判断是页面显示树里该科目比普通科目多一层父子结构，且原过滤逻辑对“已匹配到其他科目”提前返回，导致同名深层节点没有机会通过宽松匹配进入清单。

第四十三轮科目修正已继续增强：在同名深层节点兜底基础上，再按“页面可见 + MCP 同名重复”保留重复同名科目，避免 `其他应付款` 这类重复名字因层级差异和提前收口再次丢失。

第四十四轮科目修正已完成：针对 `其他应付款` 仍未加载的问题，将页面左侧科目树采集从“坐标/叶子推断”升级为 Element UI 树递归读取。树节点按真实路径去重，同名父子节点不会互相覆盖；面板过滤改为所有页面可见树节点参与匹配，叶子节点不再作为唯一入口。适配器版本固定为 `2026-07-23-subject-tree-recursive-v3`，证据 JSON 会输出页面树读取数量、MCP 数量和最终科目数量。

第四十五轮科目修正已完成：截图显示科目树容器本身有滚动条，`其他应付款` 很可能位于当前可视窗口下方。已新增树容器滚动采集逻辑，加载科目时会自动滚动左侧树并合并多轮采集结果，避免仅读取首屏节点。适配器版本升级为 `2026-07-23-subject-tree-scroll-v4`。

第四十六轮科目修正已完成：用户截图显示加载后只剩 `C3` 分支，说明页面树仍不完整，且之前的“页面可见树优先”策略把 MCP 清单裁得过头。已加入页面树可用性判断：当左侧树只读到首屏碎片时，改用 MCP 显示字段生成清单，不再让不完整的页面树硬裁掉完整科目。适配器版本升级为 `2026-07-23-subject-tree-fallback-v5`。

第四十七轮修复已完成：用户截图显示侧栏刷新出现 `TIANYUAN_WORKBENCH_GET_CONTEXT_TIMEOUT`。判断是 `collectContext()` 仍然过重，导致面板读取基础上下文时超时。已把上下文改为轻量读取，默认不再把整棵 `subjectTree` 塞进刷新结果，并缩减 `controlsPreview`，适配器版本升级为 `2026-07-23-context-lite-v6`。

第四十八轮科目修正已完成：根据页面实际显示科目与面板结果对照，发现漏项还包括名称带路径、同名父子和 MCP 名称字段不完全一致的情况。科目匹配已改为名称、父级、路径和原始字段的多候选匹配；页面树不完整时，将页面明确匹配项并入 MCP 显示清单。已完成本地样例验证。

第四十九轮科目功能调整已完成：按用户要求取消“只加载显示状态科目”的硬过滤，改为加载 MCP 返回的全部科目。显示状态科目默认勾选，隐藏状态科目保留在树中、默认不勾选并显示“（隐藏）”；执行时仍只使用用户确认勾选的科目。

第五十轮父级科目修正已完成：确认父级名称错位来自路径索引方向错误。旧逻辑假设路径总是从 C4 根节点开始，实际 MCP 路径可能只返回后半段，导致最后一级子科目名称被挂到父级。现改为从路径末端按代码层级对齐，并用所有子科目路径投票确定父级名称。

第五十一轮科目边界修正已完成：按用户要求恢复“只展示显示状态科目”的清单口径。页面适配器现在返回科目真实父级路径，页面树完整时以页面显示树过滤；页面树不可用时以 MCP 显示字段兜底。隐藏科目不会进入批量处理范围。适配器版本为 `2026-07-23-page-tree-path-v7`。

第五十二轮页面科目修正已完成：确认页面读取仍漏项的直接原因是只读取名称、没有读取 `subjectCode`。名称无法与 MCP 对应时，页面显示科目会被丢弃。现已从 Vue 节点、DOM 属性和节点链接直接提取科目代码，并按代码优先判断显示状态。适配器版本升级为 `2026-07-23-page-subject-code-v8`。

第五十三轮科目架构修正已完成：取消“页面节点必须先匹配 MCP 才展示”的限制，改为直接镜像页面已展开科目树。页面树决定范围、父级和顺序；MCP 只补代码。编号仅在页面直读或 MCP 唯一同名同层级匹配时展示，不可靠时不加编号并通过完整页面路径执行。适配器版本升级为 `2026-07-23-page-tree-mirror-v9`。

第五十四轮界面调整已完成：按用户要求隐藏科目编号显示。编号和页面路径仍保留在内部执行值中，界面只显示科目名称和层级。

第五十五轮基线固定已完成：用户已对当前版本进行初步测试，当前成果固定为 `baseline-page-tree-mirror-20260723`。后续新功能从该基线继续，科目树读取、显示状态过滤、父级层级和编号隐藏作为已确认基础能力，不再随新功能改动。

第五十六轮 Windows 发行适配已完成：Native Host 增加 Windows 平台路径、PowerShell 文件选择器、Python ZIP 校验和 Windows 安全替换；制作 Windows x64 当前用户安装/卸载脚本、便携 Python、独立 Native Host、天源 CLI、中文说明和 Agent 安装提示词。测试包已生成到 `dist/天源浏览器工作台-v0.3.0-Windows-x64-测试版-20260723.zip`。

Windows 测试包已完成 ZIP 解包、266 个文件逐项 SHA-256、PE x64 架构、扩展固定 ID、凭据模式、macOS 路径残留和 Native Messaging 健康消息验证。真实 Windows 安装和六模块端到端测试仍待对方电脑执行。

第五十七轮 Windows 安装优化已完成：Windows r2 安装器不再默认重复处理 CLI 和便携 Python。安装时自动复用已有 CLI 和 Python；已有 Python 缺少打印依赖时只校验并安装两个离线 wheel；只有缺失或补齐失败才回退包内完整依赖。安装报告新增安装模式和耗时。

2026-07-24 Windows r4 已完成：基于稳定提交 `75c4072` 重新构建扩展 `0.8.3` Windows x64 测试包。构建脚本已补齐版本 2 运行契约，在扩展和 Native Host 中写入相同 `runtimeBuildId`，避免 Windows 出现旧扩展与新 Connector 混用。包内已包含八个模块、批量上传按行执行和批量清理附件联动逻辑。

- 成品：`dist/天源浏览器工作台-v0.8.3-Windows-x64-测试版-r4-20260724.zip`
- SHA-256：`8c697f907a57ea0f1f90ae3c1dea522fc62e33a6c4a6eccd6f6b6bec47dd11f1`
- 下载目录副本：`~/Downloads/天源浏览器工作台-v0.8.3-Windows-x64-测试版-r4-20260724.zip`
- 校验结果：ZIP 完整、271 个文件逐项哈希一致、核心源码与稳定提交一致、Native Host 和便携 Python 为 Windows x86-64 PE、未包含凭据或运行态文件。
- 仍需真实 Windows 10/11 x64 + Chrome/Edge 验证 PowerShell 安装、注册表、Native Messaging、CLI 授权和八个模块。

第五十八轮批量上传排查修复已完成：统一 `content.js` 和 `page_adapter.js` 适配器版本为 `2026-07-24-page-tree-mirror-v19-upload-residual-guard`；补齐批量上传工具的 `procedureText` 参数；分类失败时增加前置程序和弹窗文本诊断；上传弹窗存在残留文件时直接中止，避免重复附件入库；Native Host 与 Connector 运行副本已同步并重启 Bridge。当前 Bridge 已恢复并重新匹配到当前天源页面。

第五十九轮换科目批量上传测试已通过：当前 Sheet `其他应收款-其他应收款`，第 2、3 行以 `凭证` 分类上传测试 PDF，两个行均完成 `/attach/upload`、`/cell_file/classify_upload`、`/assignment_draft/save` 和 `Q` 列回读。批次号分别为 `c30b34ed-0db3-4e31-b6ea-964cbbcadb12`、`8a3053bb-191a-4b3c-9272-3adbfac91815`。同时已修复空资料索引 `tag:{isClear:true}` 被误判为有内容的问题，源码版本升为 `2026-07-24-page-tree-mirror-v20-index-clear-tag-fix`，重新加载扩展后生效。

第六十轮当前科目小批量核查流程已跑通：`其他应收款-其他应收款` 第 2、3 行已批量填写 `查证核对情况=不一致`，保存业务成功，`R2/R3` 回读一致，最终扫描 `rowsNeedingCheck=0`。

第六十一轮运行目录迁移已完成第一步：已建立本机运行根目录 `~/.tianyuan-workbench/projects/天源评估系统/`，并同步 `extension/`、`native-helper/`、`plugins/tianyuan-browser-connector/` 和打印格式 `skills/`。本机扩展副本已是 `v21-clear-audit-test-data`，Native Host 与 Connector 本机运行副本已包含 `clear_audit_test_rows` 清理动作。后续 Chrome 应改为加载本机扩展目录，不再从 OneDrive 加载。

第六十二轮测试数据清理已完成：当前 Sheet `其他应收款-其他应收款` 第 2、3 行的 `P/Q/R` 测试字段已清空并保存，回读为空；最终扫描 `rowsWithIndex=0`、`rowsNeedingCheck=0`。本地测试 PDF 已删除。附件库中曾经 `/attach/upload` 入库的测试附件未调用物理删除接口。

第六十三轮 GitHub 分发准备已完成：新增 `scripts/install-local-runtime.mjs` 跨平台本机运行安装脚本，新增 `交给Agent自动配置.md` 和 `docs/INSTALL_FOR_AGENT.md`。本机验证安装脚本可复制运行文件、注册 Native Host、同步 Connector，并输出 Chrome 应加载的本机扩展目录；脚本不写入 MCP token、Cookie、Authorization、密码或验证码。

第六十四轮 GitHub 首页分发入口已完成：新增根目录 `README.md`，让 GitHub 仓库首页直接展示 Agent 自动配置入口、Chrome 加载步骤、本机运行目录和安全边界。已重新执行安装脚本验证通过，敏感凭据扫描未发现明文 MCP token 或 Bearer token。基线标签为 `baseline-github-distribution-ready-20260724`。尚未推送 GitHub，原因是当前仓库未配置 remote，且本机未安装 `gh` 命令；需要目标仓库地址后执行推送。

第六十五轮侧栏界面优化已完成：参考 WPS Connector / Codex 的轻量风格，重写 `extension/src/sidepanel/styles.css`，统一浅灰背景、白色状态卡、低噪按钮、轻量功能卡片、折叠日志和证据区域。已用 Playwright 离线渲染首页和批量保存页，420px 宽度下横向溢出均为 0；已执行安装脚本同步到本机运行目录。截图证据保存到 `docs/test-evidence/2026-07-24-sidepanel-codex-style-home.png` 和 `docs/test-evidence/2026-07-24-sidepanel-codex-style-batch-save.png`。

第六十六轮首页模块入口已从大列表卡片改为应用图标宫格：6 个功能模块在 420px 宽侧栏中以两行展示，模块区高度约 185px，横向溢出为 0。图标使用本地内联 SVG 线性图标，按 Apple/Codex 的浅色圆角风格设计，不依赖外部网络。已同步本机运行目录，截图证据为 `docs/test-evidence/2026-07-24-sidepanel-app-icons-home.png`。

第六十七轮图标风格优化已完成：调研 Phosphor Icons、Tabler Icons、Heroicons 和 Lucide 后，当前不引入外部运行依赖，改用本地内联 SVG 线性图标，并将图标底板升级为彩色柔和渐变圆角小应用图标。420px 宽首页横向溢出为 0，模块区高度约 185px。已同步本机运行目录，截图证据为 `docs/test-evidence/2026-07-24-sidepanel-premium-icons-home.png`。

第六十八轮图标色调已按用户反馈改为中性玻璃风格：移除大面积蓝、紫、绿、黄、红渐变，改为灰白图标底板、细线图标和小号彩色状态点。420px 宽首页横向溢出为 0，模块区高度约 187px。已同步本机运行目录，截图证据为 `docs/test-evidence/2026-07-24-sidepanel-neutral-icons-home.png`。

第六十九轮首页图标图形已重做：不再沿用原来的软盘/线性老图标，改为填充式现代符号，包括“完成校验、退出编辑、表格导出、文档导出、明细打印、申报打印”。为避免浏览器继续读取旧样式，`extension/manifest.json` 版本升至 `0.6.1`，侧栏 CSS 增加 `styles.css?v=20260724-filled-symbols`。本机运行目录已确认同步为 `0.6.1`。

第七十轮首页图标已替换为 Phosphor Icons Duotone 风格 SVG：移除无业务意义的小圆点，图标 SVG 显示宽度放大到约 34px，首页横向溢出为 0，模块区高度约 197px。侧栏 CSS 引用更新为 `styles.css?v=20260724-phosphor-icons`，本机运行目录已确认包含 `ph-duotone` 图标路径。

第七十一轮连接配置页 UI 已优化：`操作能力` 改为默认折叠，仅显示 `20/23 项可用` 等汇总；Codex 项目和对话选择改为面板内嵌搜索选择器，原生 select 隐藏为内部状态，避免 macOS 系统下拉菜单破坏样式统一。CSS 版本更新为 `styles.css?v=20260724-connector-picker`，本机运行目录已确认同步。

第七十二轮连接配置选择器细节已优化：项目/对话列表每项增加固定行高和路径单行省略，避免文字积压；选中态从大面积蓝色改为浅色背景、细蓝边和右侧小勾。CSS 版本更新为 `styles.css?v=20260724-picker-refine`，本机运行目录已确认同步。

第七十三轮当前 UI 版本已固定到 Git：当前 `main` 提交已挂载标签 `baseline-sidepanel-app-ui-20260724`。当前仓库仍未配置 GitHub remote，无法执行 `git push`；需要提供目标 GitHub 仓库地址后才能推送 `main` 和 baseline 标签。

第七十四轮 GitHub 分发已完成：确认既有 `zer0-lyz/tianyuan-valuation-system` 不是同一项目，已新建私有仓库 `zer0-lyz/tianyuan-browser-workbench`。由于本机普通 `git push` 到 GitHub 多次超时，已改用 GitHub API 发布当前完整文件树，远端 `main` 指向提交 `cb2bdf4a760ba943896aea291ccffcb650d0860c`，并已创建标签 `baseline-sidepanel-app-ui-20260724` 和 `baseline-github-distribution-ready-20260724`。

## 待办

- 本地已修复批量上传跨科目 Sheet 状态污染：重新识别不再携带上一科目的 Sheet，优先使用当前 SpreadJS 活动 Sheet；用户主动切换 Sheet 时才保留选择。目标变化时旧文件映射和执行结果自动清空。尚未提交或推送 GitHub。
- Chrome 扩展错误页确认 `content.js:1` 报 `Identifier 'ADAPTER_VERSION' has already been declared`。本地已将 content script 包入独立作用域、增加单实例监听器门禁，并将页面消息类型改为带适配器版本的 v28 通道，防止旧页面监听器响应新动作。尚未提交或推送 GitHub。
- 本地已修复 `TIANYUAN_WORKBENCH_GET_CONTEXT_TIMEOUT`：页面适配器已升为 v27，但 content script 仍校验 v26，导致有效上下文响应被丢弃。现已统一版本并增加自动一致性测试；尚未提交或推送 GitHub。
- 本地已修复空白上传弹窗被底层隐藏 FileList 误判为 `UPLOAD_DIALOG_HAS_RESIDUAL_FILES` 的问题。真实页面需重新加载本机扩展后复测第一项；确认上传槽位为空时不再误报，且实际显示残留文件名时仍会安全中止。
- 本地已修复 Connector 版本不一致时无法自动更新的问题，当前仅同步到本机运行目录，尚未提交或推送 GitHub。真实页面应先点击侧栏“刷新”确认 Connector 变为“已启动/已绑定”，再继续批量上传测试；确认稳定后再统一发布。
- 重新加载扩展 `0.8.3` 后，在原批量上传任务点击“继续未完成项”，仅复测 `3.1.4美元招行2025年12月.pdf`；若仍失败，面板应直接显示附件上传或分类批次接口的 HTTP、业务 code 和消息。

- 重新加载扩展，进入“连接配置”，点击“启动 Connector”。
- 重新加载本机扩展目录 `~/.tianyuan-workbench/projects/天源评估系统/extension`，查看新版 Codex 风格侧栏在真实 Chrome 侧栏中的显示效果。
- Mac mini 从 `https://github.com/zer0-lyz/tianyuan-browser-workbench` 克隆后，执行 `node scripts/install-local-runtime.mjs`，再按 README 加载浏览器扩展并绑定 Connector。
- 重新加载扩展并重新绑定当前页面后，先在一个新行做单行评估核实附件上传复测；若分类批次、底稿保存和回读均通过，再做两行真实批量复测。
- 重新加载扩展后验证 v20 扫描口径：空 `tag:{isClear:true}` 不应再被计入已有资料索引。
- 在 Chrome 扩展管理页移除或停用 OneDrive 路径加载的旧扩展，重新加载本机目录 `~/.tianyuan-workbench/projects/天源评估系统/extension`。
- 本机扩展加载后，执行 `clear_audit_test_rows` 清理当前科目第 2、3 行测试数据。
- 如继续扩大测试，应先重新加载扩展以启用 v20 扫描口径，再选择新的未上传行或新的科目，避免重复污染已测试行。
- 在真实天源底稿页点击“绑定当前页面”，核对项目、公司、科目、页面类型和心跳。
- 在连接面板选择“天源评估系统”项目和当前对话，点击“保存绑定”。
- 验证 `bindingId` 显示、解除绑定和 Bridge 重启后的恢复。
- 将 `plugins/tianyuan-browser-connector/` 安装到 Codex，验证 `tianyuan.connection_status` 和 `tianyuan.get_context`。
- 只读核对当前页面能力矩阵，不执行正式保存、退出编辑或上传。
- 根据真实页面能力再决定是否设计 Agent 对话层。

- 在真实 Windows 10/11 x64 电脑解压测试包并运行 `安装.cmd`。
- 优先使用 `dist/天源浏览器工作台-v0.3.0-Windows-x64-测试版-r2-20260723.zip`，旧版仅保留回退。
- 对已安装 CLI、Python 和 openpyxl 的电脑，确认检查报告显示“快速安装（复用已有 CLI、Python 和打印依赖）”。
- 对只有 CLI 和 Python、没有 openpyxl 的电脑，确认只从离线 wheels 补齐依赖，不复制便携 Python。
- 检查 `%LOCALAPPDATA%\TianyuanWorkbench\安装检查结果.txt`。
- 完全退出并重启 Chrome，加载 `%LOCALAPPDATA%\TianyuanWorkbench\extension`。
- 验证固定扩展 ID `lkflndcnklpeaejohaacoaolnmhgigoc`。
- 验证 Windows 文件/文件夹选择器、CLI 授权、MCP 连接和六个模块。
- 首次真实测试只使用一个公司、一个科目、预演模式、临时导出目录和 Excel 工作副本。

- 重新加载扩展，确认首页显示 6 个模块。
- 使用真实导出的明细表工作副本测试“明细表打印格式”，检查 WPS 打印预览。
- 使用真实导出的申报表工作副本测试“申报表打印格式”，检查隐藏列、标题和分页。
- 工作副本验证通过后，再测试覆盖源文件模式。
- 在“导出明细表”中选择少量公司和临时目录，执行一次真实导出并核对文件数量、文件名和工作簿可打开性。
- 在“导出申报表”中重复上述小范围验证。
- 验证取消文件夹选择时页面保持原路径且不启动导出。
- 在真实底稿页运行单科目、当前公司、预演模式，保存证据 JSON。
- 用带 `VALUATION_MCP_TOKEN` 的 helper 在真实底稿页验证“加载科目”是否返回 MCP 科目复选清单。
- 选择“部分公司”后点击“加载清单”，验证 MCP 公司列表是否完整加载到面板。
- 重新加载未打包扩展后，验证面板“启动/检查”能通过 Native Messaging 从扩展侧自动拉起 helper。
- 重新加载扩展后，验证“配置 MCP”输入真实 token 后能显示 MCP 已连接。
- 重新加载扩展后，验证“授权 CLI”能打开 tycpv 授权页面。
- 重新加载扩展后，验证“加载科目”不再显示“左侧显示科目”脏文本，并验证“加载清单”可显示公司清单。
- 重新加载扩展后，验证 MCP “记住本机”和“清除”逻辑。
- 重新加载扩展后，验证科目折叠树显示、只加载右侧显示状态科目，并验证“全选 / 全不选 / 确认”流程。
- 重新加载扩展后，复核侧栏 UI：执行日志默认收起、日志计数正常、证据 JSON 可展开复制、整体宽窄面板均不拥挤。
- 重新加载扩展后，先确认侧栏刷新不再出现 `TIANYUAN_WORKBENCH_GET_CONTEXT_TIMEOUT`，然后核对 `其他应付款`、`其他流动资产`、`电子设备` 等页面显示科目是否进入清单。
- 重新加载扩展后，验证“全部科目”面板是否加载完整，隐藏科目是否正确标记且默认不勾选。
- 重新加载扩展后，复核 `C4-8` 等父级名称不再使用其最后一个子科目名称。
- 重新加载扩展后，确认隐藏科目不进入清单，批量处理只使用显示状态且经用户确认的科目。
- 重新加载扩展后，查看 `pageTreeCodeCount`，确认页面科目代码能够读取，并复核土建工程、土地使用权等科目。
- 重新加载扩展后，对照天源左侧树逐项检查面板镜像结果，查看 `pageMirrorCount` 是否等于页面叶子科目数量。
- 在确认可控范围后，运行单科目、当前公司、正式执行，并做系统回读核验。
- 重新加载扩展后，先用“退出编辑”预演模式验证能逐科目定位按钮。
- 退出编辑预演通过后，再用单公司、单科目正式执行验证，并观察编辑状态是否退出。
- 分别验证“全部公司”和“部分公司”的选择弹窗。
- dry run 通过后，再设计正式保存动作和保存后回读证据。

## 风险与待确认

- Windows `tycpv` 安装包和生成的 Native Host 未检测到可用的 Authenticode 发布者签名，Windows Defender SmartScreen 可能提示“未知发布者”；只能在确认文件来源和 SHA-256 后继续，不能要求关闭安全软件。
- 当前构建机不是 Windows，无法在本轮直接验证注册表写入、Windows Forms 对话框、CLI 浏览器授权和 Chrome 实际拉起 Native Host。

- 天源页面前端版本可能变化，不能依赖压缩类名或一次性 DOM。
- 浏览器插件读取本地目录需要用户授权或本地助手。
- 编辑锁是硬门禁，正式插件必须停止，不能前端绕过。
- 上传功能必须区分前端注入、附件入库、分类批次和底稿保存四个状态。
- 旧项目测试参数只作为证据，不作为新项目默认执行参数。
- 当前这次实际运行的侧栏即时日志没有落盘到项目目录；助手日志仅能确认 Native Host 启动，不能还原每个科目的页面内执行结果。后续批量结果已开始写入扩展本地存储。
- 科目清单必须以页面左侧真实显示树为最终依据；MCP 显示字段只能作为页面树不可用时的兜底，不能先行删除候选科目。
- 部分公司执行必须以面板已确认公司为唯一来源；正式保存前必须读回天源弹窗实际选择，选择不一致时不得继续保存。
- 侧边栏功能结构应保持“首页选择功能，再在该功能页确认工作范围并执行”；保存只是功能模块之一，每个模块独立保存自己的公司和科目范围。
- 不在 OneDrive 项目目录安装依赖或保存运行态；所有底层依赖、缓存、日志、安装包和快照应放在 `~/.tianyuan-workbench/`。

## 下一步建议

下一步建议从 `baseline-page-tree-mirror-20260723` 继续开发新的功能模块。新增模块必须复用已经确认的公司范围和科目范围，不重新改写科目树基础逻辑。

如不希望手动启动终端 helper，可改用 Native Messaging：重新加载扩展后直接点击“启动/检查”。若环境中没有 `VALUATION_MCP_TOKEN`，会显示 Helper 已启动、CLI 可用、MCP 未配置 token。

## 2026-07-24 多 Agent 来源识别、授权与页面绑定

- Connector Bridge 协议升级为 `connector-agent-binding-v2`，运行逻辑由 `native-helper/connector_bridge.js` 承担，Native Host 仅负责受控启动。
- 旧 `codexBinding` 持久记录会幂等迁移为 `agentBinding`；迁移仅在成功写出 v2 文件后替换运行态，无法读取旧记录时不删除原文件。
- `agentBinding` 保存 `agentId`、`providerId`、`displayName`、`installationId`、工作区/对话字段、范围、权限、页面键和时间戳；`codexBinding` 保留为 Codex 只读兼容字段。
- Bridge 新增注册来源查询和手动来源注册。MCP 客户端从受控本机 `agent-config.json` 声明 `providerId`、`installationId` 和 `credentialRef`；macOS 优先使用 Keychain，不以本机回环地址代替来源鉴权。
- 同一页面允许多来源 `read`，但只允许一个 `control`。侧栏确认转移控制权时，旧控制者尚未执行或已领取的队列动作会标记为 `AGENT_CONTROL_REVOKED`。
- 连接配置页新增“Agent 控制者管理”：来源状态、页面权限、控制/只读切换和 WorkBuddy 手动绑定。WorkBuddy 未集成项目或对话 API，只接受用户填写的本机可见标识。
- Connector 版本升至 `0.4.0`，扩展版本升至 `0.7.0`。
- 本地模拟验证通过：`node tests/agent-binding-bridge.test.cjs`。证据见 `docs/test-evidence/2026-07-24-agent-binding-v2-local-validation.md`。未对天源线上页面执行写入。

## 2026-07-24 扩展与 Bridge 运行契约加固

- 浏览器端身份统一为固定扩展 ID 与扩展版本请求头；不再假设 Chrome 必然发送 `Origin`。
- Native Runtime 新增 `runtime-compat.json`，安装脚本写入当前扩展版本、Bridge 协议和构建标识，并核验已安装扩展及 Bridge 身份头实现。
- Bridge 协议升级为 `connector-agent-binding-v3`；旧扩展缺少身份头返回 `EXTENSION_RELOAD_REQUIRED`，版本不一致返回 `EXTENSION_RUNTIME_VERSION_MISMATCH`。
- 侧栏启动检查会显示“需更新”，而非将运行版本不一致误报为 Connector 未启动。
- 回归测试新增无 Origin 扩展请求与版本不一致拒绝，覆盖 Chrome 扩展实际请求差异。

## 2026-07-24 MCP token 本机记住恢复

- 恢复“配置 MCP”中的“记住本机”开关；默认仍是当前侧边栏会话。
- 仅在用户主动勾选后写入 Chrome 扩展 `chrome.storage.local`；不会写入仓库、Native Helper、Bridge、日志或截图。
- 初始化不再删除本机 token；清除按钮会删除扩展本机存储并清空当前会话。
- 弹窗不回显已保存 token，只显示勾选状态。

## 2026-07-24 Agent 连接状态显示

- “Agent 控制者管理”现在对每个来源显示 MCP 已连接/未连接、最后活动、当前页面是否绑定以及只读或控制权限。
- 状态仅基于 MCP 初始化注册和 30 秒心跳，不扫描或猜测 WorkBuddy 窗口/进程来确认来源身份。
- Bridge 在 90 秒没有心跳后显示 MCP 未连接；来源仍保留为已注册，方便区分配置问题与绑定问题。

## 2026-07-24 批量上传文件界面模块

- 首页新增“批量上传文件”功能模块，扩展版本升至 `0.7.5`。
- 新模块按“目标对象 -> 文件映射 -> 执行确认”三步工作：自动读取当前科目和 Sheet，列出所有表头并识别 `operation-upload-cell` 可上传列。
- 文件夹使用浏览器授权的目录选择器读取到内存；支持多文件、扩展名和 20 MB 单文件大小校验，不保存文件路径或文件内容。
- 文件与目标行号暂时采用手工映射；执行时逐文件复用既有固定上传脚本，分别验证编辑锁、上传、分类、保存和单元格回读，并显示逐项进度与失败原因。
- 页面适配器版本升级为 `2026-07-24-page-tree-mirror-v22-batch-upload-module`；未执行真实底稿上传验证。

## 2026-07-24 批量上传目录崩溃保护

- 修复批量上传文件夹选择后侧栏可能因大目录一次性渲染而崩溃的问题。
- 扩展版本升至 `0.7.6`；目录选择增加支持格式过滤、单文件 20 MB 限制和单批最多 200 个文件限制。
- 超出上限或被跳过的文件会在界面显示数量，不再全部加载到表格。
- 已重新同步本机扩展并重启 Bridge；未执行真实上传。

## 2026-07-24 本机脚本控制模式

- 扩展版本升至 `0.7.7`，新增 `tianyuan-local-script` 本机来源。
- 侧栏自动注册本机来源；批量上传在没有 Codex、WorkBuddy 或其他 Agent MCP 时，会在首次执行前请求当前页面控制权。
- 本机脚本绑定仍受唯一控制者、编辑锁、明确确认、保存和回读门禁约束，不接受任意本机进程冒充，也不保存 MCP token。
- `node tests/agent-binding-bridge.test.cjs` 已覆盖无 Agent credential 的来源注册、控制绑定和 UI action 队列。
- 已安装到 `~/.tianyuan-workbench/` 并重启本机 Bridge；未执行真实底稿写入，未推送 GitHub。

## 2026-07-24 批量上传目标位置映射

- 扩展版本升至 `0.7.9`；“查证核对情况”明确标记为人工填写列，不进入批量上传目标列。
- 确认上传目标列后，扩展只读打开当前上传分类弹窗，读取多个目标位置并立即关闭，不注入文件、不保存。
- 文件映射表新增“目标位置”下拉框；执行时同时传递 `moduleIndex` 和 `moduleName`，兼容位置顺序变化和位置文字匹配。
- 目标行号仍由用户手工录入；未选择行号或目标位置的文件不会进入执行。
- 单文件上传和分类成功后才进入下一个文件；批量过程中不逐条保存，全部上传/分类成功后统一保存并回读。
- 上传确认采用网络结果轮询，不再无条件固定等待完整 8 秒。
- 已通过扩展、页面适配器、Bridge 语法检查和 Agent 绑定回归测试；未执行真实底稿上传。

## 2026-07-24 批量上传断点继续

- 扩展版本升至 `0.8.0`。
- 批量上传遇到首个上传或分类失败项时立即停止，不继续处理后续文件。
- 失败前已确认上传成功的文件会统一保存并回读，状态标记为“已保存”。
- 失败项和未执行项保留在当前侧栏任务中；修改行号或目标位置后，可点击“继续未完成项”。
- 继续执行会跳过“已保存”项；统一保存失败的成功项保留为“待保存”，下次只重试保存，不重复上传。

## 2026-07-24 上传弹窗关闭与结果判定

- 扩展版本升至 `0.8.1`，页面适配器升至 `v25-dialog-close-verification`。
- 目标位置只读识别完成后，按“右上角关闭 -> 取消/关闭 -> Escape -> 遮罩”顺序关闭弹窗，并等待关闭结果。
- 上传和分类网络接口成功后，不再因弹窗仍处于关闭动画或残留可见状态而误报上传失败。
- 下一个文件和整批统一保存开始前都会再次关闭并验证残留上传弹窗。
- 页面保存按钮明确排除上传弹窗内部的“保存”，避免误点重复上传。

## 2026-07-24 批量上传目标位置弹窗根节点修复

- 扩展版本升至 `0.8.2`，页面适配器升至 `2026-07-24-page-tree-mirror-v26-upload-dialog-root`。
- 不再把页面 `body.el-popup-parent--hidden` 误当作弹窗；目标位置读取优先锁定同时包含文件输入框、上传内容、保存按钮和关闭控件的最小可见弹窗外壳。
- 关闭动作支持 Element UI 标准按钮、ARIA/title、常见 close 类和可见 `×/✕/关闭` 控件，并同时验证弹窗本体及遮罩容器已隐藏或移除。
- 语法检查、`node tests/agent-binding-bridge.test.cjs` 和 `git diff --check` 通过；未执行真实上传或保存，未推送 GitHub。
