# Tianyuan Browser Workbench Agent Install

This project uses a local runtime directory. The repository is the source and documentation store; Chrome and the native helper should run from local user directories.

## One Command

Run from the repository root:

```bash
node scripts/install-local-runtime.mjs
```

The script copies runtime files locally, registers the Chrome Native Messaging host, and prints `extensionPath`.

## Chrome Setup

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the printed `extensionPath`.
5. Open a Tianyuan page and open the Tianyuan Workbench side panel.
6. Use the connection page to start/bind Connector.

## Credentials

The installer does not write MCP token, Cookie, Authorization, passwords, or verification codes. MCP token must be entered by the user in the extension panel when needed.

## Expected Runtime Paths

- macOS extension: `~/.tianyuan-workbench/projects/天源评估系统/extension`
- Windows extension: `%LOCALAPPDATA%\\TianyuanWorkbench\\projects\\天源评估系统\\extension`
- Connector: `~/plugins/tianyuan-browser-connector`
- Native helper:
  - macOS: `~/.tianyuan-workbench/native-helper`
  - Windows: `%LOCALAPPDATA%\\TianyuanWorkbench\\native-helper`
