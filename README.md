# librocat

![CI](https://github.com/librocat/librocat/actions/workflows/ci.yml/badge.svg)

**Persistent AI memory, shipped as an Agent Plugin.** Your AI agents forget
everything when a session ends, so you repeat yourself every day, to every
one of them. librocat catalogs your notes and files as Open Knowledge Format
(OKF) Markdown and retrieves them for any agent over MCP. Tell them once. At
its core it is a library and information science tool for organizing notes.
Not a database: a library.

Knowledge lives as [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
(OKF) Markdown files in your own Git repo (GitHub, GitLab, or anywhere) — the
repo is the source of truth. The librocat MCP server reads the files at launch into an
in-memory search index (Orama) and gives your agent sixteen tools to search,
read, link-walk, write, rename, weed, keep a tag thesaurus, write finding
aids, and read the Git history of knowledge. Your agent is the cataloger: it writes titles, descriptions, and
tags with your own AI. No database, no service, no account.

Want the same memory on every agent and machine, with a librarian?
**[librocat Cloud](https://librocat.dev) is coming soon**: Supabase for AI
memory — the same tools, hosted. Libro, the library cat, will catalog what
your agent leaves blank and file duplicates, retired concepts, and stray
tags on a weekly review shelf for you to approve, with a revision on every
write. Watch [librocat.dev](https://librocat.dev).

## Use it

librocat is an **Agent Plugin**: the MCP server plus the Agent Skills, and
this repo root is the plugin. Two install paths reach the same result —
pick the one your agent supports.

### Option A — the Agent Plugin (recommended)

One command installs the MCP server and the Agent Skills together, into
every agent you have — Claude Code, Cursor, Codex, VS Code, and others —
with the [plugins CLI](https://www.npmjs.com/package/plugins):

```bash
npx plugins add librocat/librocat
```

The plugin carries its own built server (`server/main.js`, zero
dependencies, Node 20+), so the install downloads nothing else from npm.
Any runner works the same way — `npx`, `pnpm dlx`, `yarn dlx`, or
`bunx`.

### Option B — Skills + MCP, separately

Some agents don't yet support [Agent Plugins](https://agent-plugins.org)
but do support the two older, more widely adopted standards it's built
from: [Agent Skills](https://agentskills.io) (40+ clients) and
[MCP](https://github.com/modelcontextprotocol/typescript-sdk) (nearly
universal). Install both — the skills instruct the agent to call this
server's tools, so skills alone do nothing and the server alone works
without the cataloging guidance:

```bash
npx skills add librocat/librocat
```
([skills CLI](https://github.com/vercel-labs/skills))

```json
{ "mcpServers": { "librocat": { "command": "npx", "args": ["-y", "librocat"], "env": { "LIBROCAT_BUNDLE": "./okf" } } } }
```

The npm package `librocat` is the server itself (`npx -y librocat` runs
it directly, zero dependencies). To run from a clone instead:

```json
{ "mcpServers": { "librocat": { "command": "node", "args": ["<clone>/server/main.js"] } } }
```

Set `LIBROCAT_BUNDLE` to your OKF directory (default `./okf`). See
[docs/local.md](./docs/local.md).

Same binary, same MCP config, for [librocat Cloud](https://librocat.dev)
too: `npx -y librocat login` and paste a workspace token from the
dashboard's Connect page, and this process becomes the Cloud client on its
next start instead — no config to rewrite. `logout`, `whoami`, and
`push` (upload a local OKF bundle into the logged-in workspace once) round
out the CLI. Cloud's own code is not in this repository; `login` only
teaches this binary to talk to it.

The server runs on Node 20 or later and has zero runtime dependencies. With
no token it opens no network connection, makes no model call, and sends no
telemetry; with a token it opens exactly one, to your Cloud workspace. The
agent that calls it is the AI. See [SECURITY.md](./SECURITY.md).

## Develop

Node 24 and [pnpm](https://pnpm.io) (`npm install -g pnpm`).

```bash
pnpm install
pnpm test           # core suite + mcp end-to-end over stdio, against the built artifact
pnpm run build      # bundle the server into packages/mcp/dist with esbuild
pnpm run plugin     # assemble the Agent Plugin (plugin.json + mcp.json + skills)
```

Releases are tagged and listed in [CHANGELOG.md](./CHANGELOG.md).

## Layout

```text
.github/        CI (install, lint, typecheck, build, test, plugin) and Dependabot
plugin.json     the repo root IS the Agent Plugin (agent-plugins.org form;
mcp.json        .plugin/plugin.json + .mcp.json mirror it for the plugins CLI)
skills/         Agent Skills (agentskills.io)
packages/core   OKF read/write + the in-memory Orama index + the Service
packages/mcp    the librocat MCP server (official MCP TypeScript SDK, stdio)
packages/npm    the npm package `librocat`: `server/main.js` (the same
                bundle as above) as its `bin`
plugin/         manifest sources for the plugin build (agent-plugins.org)
examples/       an example OKF bundle
docs/           Local-tier guides
```

## Standards

- Agent Plugins: https://agent-plugins.org
- Agent Skills: https://agentskills.io
- MCP (official TypeScript SDK): https://github.com/modelcontextprotocol/typescript-sdk

Apache-2.0. © 2026 Laughing Hermit, Inc. — librocat is a Laughing Hermit, Inc. product; https://librocat.dev is its only domain.
