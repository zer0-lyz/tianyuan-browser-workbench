import { stdin, stdout } from "node:process";
import { executeTool, registerAgentSource, tools } from "../shared/client.mjs";

function writeMessage(message) {
  stdout.write(`${JSON.stringify(message)}\n`);
}

function textResult(payload) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(payload, null, 2)
    }]
  };
}

let sourceHeartbeatStarted = false;

function startSourceHeartbeat() {
  if (sourceHeartbeatStarted) return;
  sourceHeartbeatStarted = true;
  const heartbeat = setInterval(() => {
    registerAgentSource().catch(() => {
      // The side panel shows the source as disconnected until Bridge becomes available again.
    });
  }, 30000);
  heartbeat.unref?.();
}

async function handleRequest(request) {
  const { id, method, params } = request;
  if (method === "initialize") {
    try {
      await registerAgentSource();
    } catch {
      // Bridge may be started later from the browser side panel.
    }
    startSourceHeartbeat();
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "tianyuan-browser-connector", version: "0.4.0" }
      }
    };
  }
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools } };
  if (method === "tools/call") {
    const name = params?.name;
    if (!tools.some((tool) => tool.name === name)) throw new Error(`Unknown tool: ${name}`);
    return {
      jsonrpc: "2.0",
      id,
      result: textResult(await executeTool(name, params?.arguments || {}))
    };
  }
  throw new Error(`Unsupported method: ${method}`);
}

let buffer = "";
stdin.setEncoding("utf8");
stdin.on("data", async (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let request;
    try {
      request = JSON.parse(line);
      const response = await handleRequest(request);
      if (response) writeMessage(response);
    } catch (error) {
      writeMessage({
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: {
          code: -32000,
          message: error?.message || String(error),
          data: { code: error?.code || "MCP_TOOL_ERROR" }
        }
      });
    }
  }
});
