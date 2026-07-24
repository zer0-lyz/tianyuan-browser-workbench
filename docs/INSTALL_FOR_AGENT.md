# Tianyuan Browser Workbench Agent Install

This project uses a local runtime directory. The repository is the source and documentation store; Chrome and the native helper should run from local user directories.

## One Command

Run from the repository root:

```bash
node scripts/install-local-runtime.mjs
```

The script copies runtime files locally, registers the Chrome Native Messaging host, validates Python plus `openpyxl`/`et_xmlfile` for print-format tools, registers the local Codex Agent source, and prints `extensionPath`.

It also writes `runtime-compat.json` next to the Native Helper and verifies that the installed extension version and browser identity contract match the Bridge runtime.

If Python print dependencies are unavailable, installation stops with `PRINT_PYTHON_OPENPYXL_NOT_FOUND` before registering a partial runtime.

## Browser Setup

1. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the printed `extensionPath`.
5. Open a Tianyuan page and open the Tianyuan Workbench side panel.
6. Use the connection page to start/bind Connector.

## Credentials

The installer does not write MCP token, Cookie, Authorization, passwords, or verification codes. MCP token must be entered by the user in the extension panel when needed and is not persisted by the extension.

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
