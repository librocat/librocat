/** Entry point for `npx -y librocat` / `bunx librocat`: the stdio MCP server. */

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildServer } from "./server.ts";

serveStdio(buildServer);
