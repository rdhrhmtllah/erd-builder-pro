import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { assertMcpInstallMode } from "./mcp/service.js";
import { registerTools } from "./mcp/tools.js";

assertMcpInstallMode();

const server = new McpServer({
  name: "erdbpro",
  version: process.env.APP_VERSION || "3.3.4",
}, {
  instructions: "Understand natural-language requests without requiring tool names. Use read-only tools for investigation. For risky ERD changes, call erd_impact_analyze before proposing a patch. For ERD edits, read with erd_schema_read and prefer erd_patch_propose over full-snapshot writes; show the exact preview and wait for explicit user confirmation before erd_patch_apply. For any Note append or history restore, also create a proposal first. Never expose database passwords or TLS keys, and answer in the user's language.",
});
registerTools(server);

await server.connect(new StdioServerTransport());
