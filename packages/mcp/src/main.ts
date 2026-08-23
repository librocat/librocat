/**
 * Entry point of the librocat MCP server. The Agent Plugin ships the built
 * bundle as server/main.js and starts it from mcp.json:
 *   node ${PLUGIN_ROOT}/server/main.js
 */

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildServer } from "./server.ts";

if (process.stdin.isTTY && process.stdout.isTTY) {
  // A person in a terminal, not an agent (agents attach pipes): guide them.
  console.log(`librocat — persistent AI memory, shipped as an Agent Plugin.

  Install the whole plugin:  npx plugins add librocat/librocat

This file is the plugin's MCP server. Agents start it from the plugin's
mcp.json; it speaks MCP on stdio. Docs: https://github.com/librocat/librocat`);
} else {
  serveStdio(buildServer);
}
