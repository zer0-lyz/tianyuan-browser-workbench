import { executeTool, tools } from "../apps/shared/client.mjs";

const name = process.argv[2] || "";
const input = process.argv[3] ? JSON.parse(process.argv[3]) : {};
if (!tools.some((tool) => tool.name === name)) {
  process.stderr.write(`Unknown tool: ${name}\n`);
  process.exit(2);
}

try {
  const result = await executeTool(name, input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    error: {
      code: error?.code || "TOOL_CALL_FAILED",
      message: error?.message || String(error)
    }
  }, null, 2)}\n`);
  process.exitCode = 1;
}
