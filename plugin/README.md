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
`mcp.json` + `skills/`), which is what the CLI discovers.

The [Agent Plugins standard](https://agent-plugins.org) defines the package
format, not an installer — installation is client-specific by design.

### If your agent doesn't support Agent Plugins

Agent Plugins is a newer standard than the two it's built from. If your
agent supports [Agent Skills](https://agentskills.io) (40+ clients) and
[MCP](https://github.com/modelcontextprotocol/typescript-sdk) but not
Agent Plugins yet, install both halves separately — **both are required**,
since the skills instruct the agent to call this server's tools:

```bash
npx skills add librocat/librocat    # the skills CLI: https://github.com/vercel-labs/skills
```

```json
{ "mcpServers": { "librocat": { "command": "npx", "args": ["-y", "librocat"], "env": { "LIBROCAT_BUNDLE": "./okf" } } } }
```

`librocat` on npm is the server itself (zero dependencies) — `npx -y
librocat` runs it directly. From a clone instead: `node server/main.js`.

## Where the knowledge lives

`mcp.json` defaults `LIBROCAT_BUNDLE` to `${PLUGIN_DATA}/okf` — the client's
durable per-plugin data directory, per the Agent Plugins spec, so a fresh
install works and survives plugin updates. For the full flow, set
`LIBROCAT_BUNDLE` to a directory inside your own Git repo: the
repo is the source of truth.

## Local vs Cloud

`mcp.json` declares the local stdio server (`server/main.js`, the same
binary `npx -y librocat` runs). It is tier-aware: with no token it is Local,
offline; with a workspace token it becomes the Cloud client instead, same
process, same `mcp.json` entry. The easiest way to switch it: run `npx -y
librocat login` once in a terminal and paste the token from the dashboard's
Connect page. That writes `~/.librocat/credentials.json`, which every
`librocat` binary on the machine reads — including this plugin's bundled
`server/main.js` — so no edit to `mcp.json` or `${PLUGIN_DATA}` is needed;
restart the agent and it is Cloud. `npx -y librocat logout` switches back,
and `npx -y librocat push` uploads an existing local OKF bundle into the
workspace once, so nothing is lost moving from Local to Cloud.

Prefer setting the token in `mcp.json` explicitly instead (for example to
scope it to one client): add `"LIBROCAT_TOKEN": "lc_..."` to the server's
`env`. Or skip the local process entirely and point the client straight at
the hosted remote endpoint, for clients that speak remote MCP with headers:

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

The tool surface is the same across all three, minus `reindex` in Cloud
(there is no local index to rebuild there). The remote HTTP form above also
drops `ingest_repo` — Cloud's endpoint has no filesystem — but the stdio
forms keep it: the local process reads the repo path and writes the result
into the Cloud workspace. Cloud adds automatic LLM indexation paid with
index credits.

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

