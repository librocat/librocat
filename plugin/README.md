# librocat Agent Plugin

The unit of distribution for librocat, following the
[Agent Plugins Standard](https://agent-plugins.org). It contains:

- **`mcp.json`** — declares the librocat MCP server (stdio, `node ${PLUGIN_ROOT}/server/main.js`)
- **`plugin.json`** — plugin manifest (`$schema` pins the standard version)
- **`skills/`** — the Agent Skills (`SKILL.md`), added by the build step from
  the repo's top-level `skills/`

## Build a distributable plugin

```bash
pnpm run plugin
# -> dist/plugin/  (plugin.json + mcp.json + skills/) and dist/librocat-plugin.zip
```

## Install

One command installs the whole plugin (MCP + skills) into every detected
agent — Claude Code, Cursor, Codex, Grok, Kimi, Copilot CLI, VS Code,
OpenClaw, Hermes Agent, and any other MCP client on your machine (web
agents and sandboxed platforms such as NemoClaw need Cloud's remote MCP) — with
the [plugins CLI](https://www.npmjs.com/package/plugins). Any runner:

```bash
npx plugins add librocat/librocat      # or pnpm dlx / yarn dlx / bunx
```

The published OSS repo root is itself an open-plugin (`plugin.json` +
`mcp.json` + `skills/`), which is what the CLI discovers. Alternatives:

- **MCP server only:** from a clone, `node server/main.js` (the plugin
  carries its own built server; npm serves no code).
- **Skills only:** `npx skills add librocat/librocat` (the
  [skills CLI](https://github.com/vercel-labs/skills)).

The [Agent Plugins standard](https://agent-plugins.org) defines the package
format, not an installer — installation is client-specific by design.

## Where the knowledge lives

`mcp.json` defaults `LIBROCAT_BUNDLE` to `${PLUGIN_DATA}/okf` — the client's
durable per-plugin data directory, per the Agent Plugins spec, so a fresh
install works and survives plugin updates. For the full flow, set
`LIBROCAT_BUNDLE` to a directory inside your own Git repo: the
repo is the source of truth.

## Local vs remote MCP

`mcp.json` declares the local stdio server. For the Cloud tier, point the
client at the hosted remote endpoint instead, with the workspace token from
the dashboard's Connect page:

```json
{
  "mcpServers": {
    "librocat": {
      "type": "http",
      "url": "https://librocat.dev/mcp",
      "headers": { "Authorization": "Bearer lc_..." }
    }
  }
}
```

The tool surface is the same in both tiers, minus `ingest_repo` and
`reindex` in Cloud (no filesystem). Cloud adds automatic LLM indexation paid
with index credits.

## For plugin authors: use librocat as your plugin's memory

Any free local agent plugin can make librocat its memory — and funnel its
users to librocat Cloud when they want that memory on every agent and
machine. Two lines do it:

1. In your plugin's `mcp.json`, declare the librocat server next to yours
   (copy the `librocat` entry above, or the remote one for Cloud).
2. In your `SKILL.md`, tell the agent when to remember: "After a decision,
   runbook, or fact worth keeping, call librocat `ingest` (type, title,
   one-sentence description, tags) so every other agent recalls it."

The concept lands in the user's OKF bundle (Local) or workspace (Cloud); no
SDK, no API key on your side.

If the plugin lives in the `librocat` GitHub org, three more rules apply.
Name it `librocat/<x>` with `"name": "<x>"` in `plugin.json`, so it installs
with `npx plugins add librocat/<x>`. Ship its server inside the repo
(`server/main.js`, run from `mcp.json` as `node ${PLUGIN_ROOT}/server/main.js`);
npm serves no plugin code. On npm, publish only a pointer `@librocat/<x>`
whose `npx @librocat/<x>` prints that install command. Put the Cloud funnel
line from the flagship README in yours.

