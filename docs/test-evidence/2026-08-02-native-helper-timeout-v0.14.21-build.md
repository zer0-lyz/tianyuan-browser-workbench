# Native Messaging 超时修复 v0.14.21 构建证据

## 构建

- 版本：`0.14.21`
- 构建号：`2026080209`
- 输出日期：`2026-08-02`
- 运行指纹：`23ddb6d579b3f2a1a5178f2d0a02dd2810f64f0775579827f232a6095ef35b03`
- 本轮未推送 GitHub，等待 Windows 实机验收。

## 输出包

| 类型 | 文件 | SHA-256 |
| --- | --- | --- |
| Windows x64 完整包 | `/Users/zer0y/Downloads/tianyuan-workbench-v0.14.21-windows-x64-20260802.zip` | `c1a4e8ed98639329bad9a1ec94254b2fd5eb5cfe183cea19ebfbe08c30aaa526` |
| Windows x64 Lite 包 | `/Users/zer0y/Downloads/tianyuan-workbench-v0.14.21-windows-x64-lite-20260802.zip` | `ff368944b6dc5e1175a6b6f8dccfcf25217de3d29a98f636554dac62e5832bb7` |

## 已验证

- 两个 ZIP 均通过 `unzip -t`。
- `.sha256` 文件与包外重新计算值一致。
- 两个包内 `VERSION.txt` 和 `extension/version.json` 均为 `0.14.21 / 2026080209`。
- 两个包内均包含 Native Host stdin 关闭后等待 pending 请求的生命周期修复。
- 两个包内均包含更新检查分段超时和 `UPDATE_CHECK_TIMEOUT` 逻辑。
- 完整包含 Node、Python、CLI 安装器和 `native_host.exe`；Lite 包标记 `requires_existing_runtime=true`。
- Native Host 生命周期、GitHub 更新检查、静态扩展契约、更新清单、Windows Lite 发布包和 Windows ZIP 回归测试通过。

## 待 Windows 实机验证

1. 重新加载 Native Messaging Host 和扩展。
2. 点击“检查更新”，确认不再显示 `NATIVE_HELPER_TIMEOUT`。
3. 确认能显示真实检查结果或可读的网络错误。
4. 再测试“更新全部组件”，观察安装、验证和失败状态是否完整回写。
