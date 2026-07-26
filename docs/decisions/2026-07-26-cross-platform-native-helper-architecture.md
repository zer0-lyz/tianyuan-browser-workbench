# 跨平台 Native Helper 架构决策

日期：2026-07-26

状态：已接受，进入 `0.10.0` 开发验证

## 决策

天源浏览器工作台采用：

```text
Chromium 浏览器扩展，共享 Manifest V3 代码
└── Native Messaging，共享消息协议
    └── Native Helper，共享业务核心
        ├── Windows 平台适配层
        └── macOS 平台适配层
```

业务任务、连接协议、执行日志、更新检查、CLI 白名单和结果校验只维护一份。
系统差异限制在 `native-helper/platform/`：

- `common.js`：安全响应、文件凭据兜底和公共解析。
- `windows.js`：PowerShell/WinForms、DPAPI、`netstat`、`taskkill` 和 Windows 运行路径。
- `macos.js`：AppleScript、钥匙串、`lsof`、`SIGTERM` 和 macOS 运行路径。
- `unsupported.js`：未支持平台的明确失败边界，不猜测或静默降级执行系统操作。
- `index.js`：按 `process.platform` 选择适配器。

## 安装与自动配置

- Windows 安装到 `%LOCALAPPDATA%\TianyuanWorkbench`。
- macOS 安装到 `~/.tianyuan-workbench`。
- 构建缓存默认写入 `~/.tianyuan-workbench/release-builds/`。
- 最终测试包默认写入 `~/.tianyuan-workbench/releases/`，不写入 OneDrive 项目目录。
- 安装器负责复制共享核心和完整平台目录、注册 Native Messaging、检测 CLI/Python，并执行统一 `--self-test`。
- Windows 新建 Agent 连接凭据优先使用当前用户 DPAPI。
- macOS 新建 Agent 连接凭据优先使用登录钥匙串。
- 平台安全存储不可用时，才回退到权限受限的本机文件。
- MCP token、Cookie、Authorization、密码和验证码不进入安装包、项目文件或 Helper 凭据存储。

## 用户确认边界

受 Chrome 和操作系统安全策略限制，以下操作不能绕过用户确认：

- 首次加载未打包扩展；
- macOS 未签名程序安全确认；
- Windows SmartScreen 或 Defender 提示；
- CLI 网页授权；
- MCP token 输入；
- 文件和文件夹选择授权。

安装器可以自动完成环境配置、自检和错误定位，但不得绕过上述门禁。

## 兼容性

- 扩展和 Native Messaging 协议保持兼容，不因平台拆分改变浏览器消息格式。
- Windows SEA 可执行文件继续只嵌入共享入口脚本，平台模块作为受校验文件安装在可执行文件同目录。
- `runtimeBuildId` 覆盖 `native-helper/platform/`，任何平台实现变化都会触发运行副本一致性检查。
- Linux 暂不作为正式发行平台；当前只提供明确的“不支持”适配器。

## 验证要求

- 所有平台适配器必须通过本地单元测试。
- 安装后必须通过 `native_host --self-test`。
- Windows 包必须验证为 x86-64 PE，并包含完整平台目录和逐文件 SHA-256。
- macOS 包必须使用包内 Helper 和平台模块完成真实自检。
- Windows 安装、DPAPI、注册表、文件选择和 CLI 授权仍需 Windows 10/11 x64 实机验收。
