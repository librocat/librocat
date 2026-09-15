/**
 * Entry point of the `librocat` binary. Three things happen here, in order:
 *
 * 1. A subcommand (`login`, `logout`, `whoami`, `push`, `--help`,
 *    `--version`) — handled by `cli.ts`, then exit.
 * 2. A person at a terminal, not an agent (agents attach pipes) — print the
 *    install/help text and exit.
 * 3. Otherwise, the MCP server on stdio: Local by default, or Cloud when a
 *    token is present (`LIBROCAT_TOKEN`, or one saved by `librocat login`).
 *    Same binary, same MCP config either way — `credentials.ts` decides.
 *
 * The Agent Plugin ships the built bundle as server/main.js and starts it
 * from mcp.json: `node ${PLUGIN_ROOT}/server/main.js`. The npm package
 * `librocat` ships the identical bundle as its `bin`.
 */

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { HELP, runCli } from "./cli.ts";
import { buildCloudServer } from "./cloud-backend.ts";
import { resolveTier } from "./credentials.ts";
import { buildServer } from "./server.ts";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length > 0) {
    if (!(await runCli(argv))) {
      console.error(`librocat: unknown command '${argv[0]}' — see \`librocat --help\``);
      process.exitCode = 1;
    }
    process.exit(process.exitCode ?? 0);
  }

  if (process.stdin.isTTY && process.stdout.isTTY) {
    // A person in a terminal, not an agent: guide them instead of hanging on stdio.
    console.log(HELP);
    return;
  }

  let tier: ReturnType<typeof resolveTier>;
  try {
    tier = resolveTier();
  } catch (exc) {
    // stdout is the MCP transport once the server starts — errors before
    // that go to stderr only.
    console.error(exc instanceof Error ? exc.message : String(exc));
    process.exit(1);
  }

  if (tier.mode === "cloud") {
    serveStdio(() => buildCloudServer(tier.url as string, tier.token as string));
  } else {
    serveStdio(buildServer);
  }
}

main();
