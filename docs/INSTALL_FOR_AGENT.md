# Tianyuan Browser Workbench Agent Install

This project uses a local runtime directory. The repository is the source and documentation store; Chrome and the native helper should run from local user directories.

## One Command

Run from the repository root:

```bash
node scripts/install-local-runtime.mjs
```

The script copies runtime files locally, registers the Chrome Native Messaging host, validates Python plus `openpyxl`/`et_xmlfile` for print-format tools, registers the local Codex Agent source, and prints `extensionPath`.

It also writes `runtime-compat.json` next to the Native Helper and verifies that the installed extension version and browser identity contract match the Bridge runtime.

## Updates

Version `0.13.0` adds a full component updater:

1. Check the fixed public GitHub Releases repository.
2. Ask the user to confirm the update.
3. Download the platform package and verify SHA-256.
4. Update extension, Native Helper, Bridge, Connector, `~/plugins/`, and the Codex plugin cache.
5. Restart Connector and reload the unpacked extension.

Version `0.14.1` adds **测试更新模块**. It downloads the current platform package, verifies SHA-256, extracts it, and validates required files without installing, restarting, changing versions, or retaining test files. The full package is approximately 100–130 MB.

Version `0.14.3` treats Tianyuan CLI as an independently repairable capability on Windows. The installer validates every discovered `tycpv.exe` or `tycpv.cmd` with `--version`. If no candidate works and the bundled repair also fails, extension, Native Helper, Connector, and print components still update; the installation report records `天源 CLI 状态：待修复（未阻断工作台组件安装）`.

Version `0.14.4` retries Windows local component directory copies up to three times and explicitly recopies any missing required file before validation. Runtime installation failures are returned as bounded one-line JSON, so the Windows report records the actual missing path or copy error instead of only a Node stack location.

Version `0.14.5` adds a second replacement path for Windows environments where a verified `*.staging-*` directory disappears or cannot be renamed. The installer directly recopies the verified source into the managed destination, validates it, and removes the backup only after success.

Version `0.14.6` removes Node `fs.cpSync` from managed runtime directory synchronization. It creates directories and copies files deterministically, verifies every copied file size, and compares complete source and destination tree snapshots before replacement.

Version `0.14.8` fixes the remaining Windows in-app update bootstrap issue. The macOS system ZIP writer did not mark the non-ASCII compatibility filename as UTF-8, so PowerShell `Expand-Archive` produced a garbled filename instead of `安装.ps1`. Windows releases now use Python `zipfile`, and package tests require the exact legacy filename plus the ZIP UTF-8 flag.

Version `0.14.7` fixes the updater path mismatch. New runtimes locate ASCII `install.ps1`; the release package also contains a UTF-8 BOM `安装.ps1` compatibility alias so already-installed `0.14.2`–`0.14.7` Windows updaters can complete one automatic upgrade. Users should continue to launch `install.cmd` manually.

Machines running `0.12.2` or earlier must manually install `0.13.0` once because their old Native Helper does not know the install action. Later releases can use **更新全部组件**.

If Python print dependencies are unavailable, installation stops with `PRINT_PYTHON_OPENPYXL_NOT_FOUND` before registering a partial runtime.

## Browser Setup

1. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the printed `extensionPath`.
5. Open a Tianyuan page and open the Tianyuan Workbench side panel.
6. Use the connection page to start/bind Connector.

## Credentials

The installer does not write MCP token, Cookie, Authorization, passwords, or verification codes. MCP token must be entered by the user in the extension panel. By default it is session-only; the user may explicitly select “记住本机”, which stores it only in Chrome extension local storage and can be cleared from the same dialog.

Agent source credentials are not MCP credentials. On macOS, the installer stores the random local Agent credential in Keychain and writes only a `credentialRef` into `~/.tianyuan-workbench/`; if Keychain is unavailable, the restricted local runtime is used. Do not copy that runtime configuration to cloud storage.

## Agent Binding

In the side panel, open **连接配置 -> Agent 控制者管理**:

1. Bind Codex to a workspace or conversation. Existing `codexBinding` data migrates idempotently to `agentBinding`.
2. Additional Agents may receive `read` access.
3. A page has only one `control` Agent. The side panel asks for explicit confirmation before transfer and cancels the old controller's queued actions.
4. WorkBuddy uses a manual source. Fill visible local workspace/conversation identifiers; do not claim automatic WorkBuddy API discovery.

## Expected Runtime Paths

- macOS extension: `~/.tianyuan-workbench/projects/天源评估系统/extension`
- Windows extension: `%LOCALAPPDATA%\\TianyuanWorkbench\\projects\\天源评估系统\\extension`
- Connector: `~/plugins/tianyuan-browser-connector`
- Native helper:
  - macOS: `~/.tianyuan-workbench/native-helper`
  - Windows: `%LOCALAPPDATA%\\TianyuanWorkbench\\native-helper`
