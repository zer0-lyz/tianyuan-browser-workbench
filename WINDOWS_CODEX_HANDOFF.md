# Windows Codex 打包发布交接

本文件是 Windows 专机 Codex 的固定入口。macOS 主线负责开发并推送源码；Windows 专机负责制作、验证和上传 Windows 安装包，不得把“浏览器扩展已复制”当作安装成功。

## 开始前

1. 更新 `https://github.com/zer0-lyz/tianyuan-browser-workbench.git` 的 `main` 分支。
2. 检查工作树；如有未提交修改先停止并报告，不得使用 `reset --hard`、`git clean` 或整树覆盖。
3. 读取 `extension/version.json`，固定 `productVersion`、`buildNumber` 和当前 `HEAD`。
4. 阅读 `release/windows-x64/交给Agent安装.md`、`release/windows-x64/安装使用说明.md` 和 `release/build_windows_x64_release.sh` 的完整文件清单。

## Windows 包必须包含

- Extension、完整 Native Helper、skills、plugins 和安装脚本；
- Node.js、便携 Python、离线 wheels、`native_host.exe` 和天源 CLI 安装器；
- `openpyxl>=3.1.5`、`et_xmlfile`、`lxml`、`python-docx`、`typing_extensions`；
- Native Messaging、Connector Bridge、Connector 插件及 Codex 插件缓存安装链路；
- `VERSION.txt`、包内 `SHA256SUMS` 和与源码一致的 `runtimeBuildId`。

ZIP 内层根目录固定为 `TianyuanWorkbench`，暂存目录使用 `%TEMP%\TW-build`，最长解压目标不得超过 240 个字符。当前 `.sh` 文件是 macOS 交叉打包参考；Windows 上应按相同清单配置原生暂存、压缩和 SHA-256 流程。

## 真机验收

1. 使用完整包执行 `install-agent.cmd`，读取 `%LOCALAPPDATA%\TianyuanWorkbench\安装检查结果.json`。
2. 逐项确认 Extension、Native Helper、Native Messaging、Connector、Python 依赖和 CLI；不能只确认扩展目录存在。
3. 确认桌面“天源工作台-浏览器扩展”入口可定位真实扩展目录。
4. 分别测试首次安装、上一 build 升级、插件内“测试更新模块”和“更新全部组件”。
5. 凭据只允许用户本人输入，不得读取、记录或输出 MCP token、Cookie、Authorization、密码或验证码。

## 发布

1. 输出完整包和轻量包及各自 `.sha256`，名称使用 `extension/version.json` 中的产品版本。
2. 设置 `TIANYUAN_RELEASE_OUTPUT_DIR` 和对应 Release 的 `TIANYUAN_RELEASE_BASE_URL`，运行 `node scripts/generate-update-manifest.mjs`。
3. 核对生成的 `update-manifest.json` 和 `WINDOWS_CODEX_HANDOFF.md` 中版本、build、commit、运行指纹、包大小及 SHA-256。
4. 使用 `gh release upload v<版本> ... --clobber` 上传完整包、轻量包、两个 SHA 文件、清单和交接文件。
5. 使用 `gh release view v<版本> --json url,assets` 并公开下载清单，完成最终回读。

Windows 专机每次都应以生成的 Release 专属 `WINDOWS_CODEX_HANDOFF.md` 为最终执行清单，并回传环境、安装、升级、资产和公开回读结果。
