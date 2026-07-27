# 一键交给 Agent 自动安装

复制下面“提示词开始”到“提示词结束”的全部内容，发送给能够操作 Windows、PowerShell 和 Chrome/Edge 的 Agent。

如果本文件位于已经解压的安装包中，也可以直接把本文件交给 Agent；Agent 应优先运行同目录安装包，不必重复下载。

## 提示词开始

请在这台 Windows 电脑上自动下载、安装并只读验证“天源浏览器工作台”。不要只提供说明，请实际执行；除浏览器安全确认和用户本人输入凭据外，不要把操作转交给用户。

### 1. 确认环境

1. 确认系统为 64 位 Windows 10 或 Windows 11。
2. 确认 Google Chrome 或 Microsoft Edge 已安装。
3. 不要把运行文件安装到 OneDrive、企业微信缓存、下载目录、ZIP 预览目录或项目源码目录。
4. 不要关闭 Windows Defender、SmartScreen 或其他安全软件。

### 2. 取得安装包

1. 如果当前文件所在目录存在 `安装.cmd`、`install.cmd`、`VERSION.txt` 和 `SHA256SUMS`，优先使用当前完整解压目录。
2. 如果没有本地完整安装包，从公开仓库查询 Latest Release：
   `https://github.com/zer0-lyz/tianyuan-browser-workbench-releases`
3. 下载最新版：
   - `tianyuan-workbench-v*-windows-x64.zip`
   - 对应的 `.zip.sha256`
   - `update-manifest.json`
4. 下载和解压暂存目录使用：
   `%LOCALAPPDATA%\TianyuanWorkbenchInstaller`
5. 使用 `.sha256` 或 `update-manifest.json` 校验 ZIP 的 SHA-256。校验不一致时立即停止，不得绕过。
6. 必须完整解压 ZIP，不能在压缩包预览窗口中直接运行。

### 3. 自动安装

1. 执行完整解压目录中的 `安装.cmd`；如中文文件名无法调用，执行同目录 `install.cmd`。
2. 等待安装程序全部步骤完成，不要手工重复安装 Node.js、Python、Native Helper、Connector 或 Codex 插件缓存。
3. 安装失败时保留错误窗口，并读取：
   `%LOCALAPPDATA%\TianyuanWorkbench\安装检查结果.txt`
4. 不要通过手工复制单个文件、修改来源不明的注册表项目或关闭安全校验来拼接运行环境。

### 4. 验证安装结果

读取 `%LOCALAPPDATA%\TianyuanWorkbench\安装检查结果.txt`，确认：

- 扩展目录存在：
  `%LOCALAPPDATA%\TianyuanWorkbench\projects\天源评估系统\extension`
- Native Helper 存在：
  `%LOCALAPPDATA%\TianyuanWorkbench\native-helper`
- Connector 存在：
  `%USERPROFILE%\plugins\tianyuan-browser-connector`
- Codex Connector 缓存存在：
  `%USERPROFILE%\.codex\plugins\cache\personal\tianyuan-browser-connector`
- Chrome 和 Edge Native Messaging Host 已注册。
- Connector Bridge 可以启动并返回健康状态。
- 安装报告没有失败步骤。

### 5. 加载浏览器扩展

1. 完全退出并重新打开 Chrome 或 Edge。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`。
3. 开启开发者模式。
4. 加载已解压扩展目录：
   `%LOCALAPPDATA%\TianyuanWorkbench\projects\天源评估系统\extension`
5. 确认扩展名称为“天源浏览器工作台”，扩展 ID 为：
   `lkflndcnklpeaejohaacoaolnmhgigoc`
6. 如果浏览器安全策略不允许 Agent 点击“加载已解压的扩展程序”，请打开正确的扩展管理页和目录，只提示用户完成这一次点击，不要让用户重新配置其他组件。

### 6. 连接配置

1. 打开用户已经登录的天源系统页面和工作台侧栏。
2. 进入“连接配置”，执行“启动/检查”。
3. MCP token 必须由用户本人在侧栏输入：
   - 不得要求用户把 token 发送到聊天中；
   - 不得读取、复制、记录或回显 token；
   - 不得把 token 写入项目文件、GitHub、日志或截图。
4. 如需 CLI 授权，打开授权页面，让用户本人完成账号、密码和验证码操作。
5. 授权后重新检查 Helper、MCP、CLI 和 Connector 状态。
6. 如果当前 Agent 支持 MCP 配置，将统一 Connector 注册到当前 Agent；如需重启 Agent，完成重启后的只读复测。

### 7. 只读验收

只允许执行：

- `connection_status`
- `list_capabilities`
- `list_sessions`
- `get_context`
- 检查版本更新

不得执行上传、保存、清理附件、退出编辑、填写结论或其他真实底稿写入。

### 8. 最终报告

输出：

- 最新版本号；
- 安装包 SHA-256 校验结果；
- 实际安装模式和耗时；
- 扩展加载路径；
- Native Host 注册结果；
- Connector 安装和运行状态；
- Helper、MCP、CLI 状态；
- 是否需要重启当前 Agent；
- 仍需用户完成的操作；
- 失败项、准确错误信息和下一步建议。

安全要求：不得保存或输出 MCP token、Cookie、Authorization、密码、验证码；不得绕过 SHA-256 校验、编辑锁或浏览器安全策略。

## 提示词结束
