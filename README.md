# librocat

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
this repo root is the plugin. Install it into every agent you have — Claude
Code, Cursor, Codex, VS Code, and others — with one command (the
[plugins CLI](https://www.npmjs.com/package/plugins)):

```bash
npx plugins add librocat/librocat
```

The plugin carries its own built server (`server/main.js`, zero
dependencies, Node 20+), so the install downloads nothing from npm (the npm
package `librocat` is a pointer that names the command above). To add
just the MCP server to one client by hand, from a clone of this repo:

```json
{ "mcpServers": { "librocat": { "command": "node", "args": ["<clone>/server/main.js"] } } }
```

Any runner runs the plugins CLI — `npx`, `pnpm dlx`, `yarn dlx`,
or `bunx`. Skills alone:
`npx skills add librocat/librocat`
([skills CLI](https://github.com/vercel-labs/skills)).

Set `LIBROCAT_BUNDLE` to your OKF directory (default `./okf`). See
[docs/local.md](./docs/local.md).

The server runs on Node 20 or later and has zero runtime dependencies. It
opens no network connection, makes no model call, and sends no telemetry: the
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
plugin/         manifest sources for the plugin build (agent-plugins.org)
examples/       an example OKF bundle
docs/           Local-tier guides
```

## Standards

- Agent Plugins: https://agent-plugins.org
- Agent Skills: https://agentskills.io
- MCP (official TypeScript SDK): https://github.com/modelcontextprotocol/typescript-sdk

Apache-2.0. © 2026 Laughing Hermit, Inc. — librocat is a Laughing Hermit, Inc. product; https://librocat.dev is its only domain.
