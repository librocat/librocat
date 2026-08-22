# librocat

**Persistent AI memory, shipped as an Agent Plugin** (the librocat MCP
server plus Agent Skills). Tell an agent something once, and every later
session, in any agent, reads it back. At its core librocat is a library
and information science (LIS) tool for organizing notes: plain Markdown
files in a directory you own, cataloged and retrieved for any AI agent
over MCP.

Install the whole plugin into every agent on your machine (Claude Code,
Cursor, Codex, VS Code, and more) with one command:

```bash
npx plugins add librocat/librocat
```

> **Beta.** librocat is 0.x. Until 1.0.0, a minor version can change a tool
> argument (a patch version never does). Your notes are plain Markdown files
> and stay readable no matter what.

## This npm package

The package `librocat` is the plugin's MCP server alone, the part the
plugin runs for you. Use it directly only to add the server to one MCP
client by hand:

```json
{ "mcpServers": { "librocat": { "command": "npx", "args": ["-y", "librocat"] } } }
```

Any runner works: `npx -y librocat`, `pnpm dlx`, `yarn dlx`, or `bunx`.

## How it works

- One file per concept, in [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
  (OKF) Markdown: YAML frontmatter + body. Set `LIBROCAT_BUNDLE` to the
  directory (default `./okf`), ideally inside your own Git repo.
- The server reads the files at launch into an in-memory index. No database,
  no account, no network connection, no model call, no telemetry. The agent
  that calls it is the AI. Node 20 or later. Zero dependencies.
- 16 tools, and each one is a standard library practice: cataloging
  (`ingest`, `update`, `rename`, `delete`, `ingest_repo`), retrieval
  (`search`, `get_concept`, `list`, `neighbors`, `graph`), a controlled
  vocabulary (`thesaurus`), weeding by the CREW/MUSTIE method
  (`weed_report`), finding aids (`finding_aid`), plus `history`, `reindex`,
  and `status`.

Install the whole Agent Plugin (this server + the Agent Skills) into every
agent on your machine with one command:

```bash
npx plugins add librocat/librocat
```

Want the same memory on every agent and machine, with a librarian?
**[librocat Cloud](https://librocat.dev) is coming soon**: Supabase for AI
memory — the same tools, hosted. Libro, the library cat, will catalog what
your agent leaves blank and file duplicates, retired concepts, and stray
tags on a weekly review shelf for you to approve, with a revision on every
write. Watch [librocat.dev](https://librocat.dev).

## Built on open standards

- [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) — Google's Markdown format for knowledge. The file format.
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) v2 — the official SDK this server is built on (stdio).
- [Agent Plugins](https://agent-plugins.org/) — the open standard for installing the plugin into any agent.
- [Agent Skills](https://agentskills.io/home) — the open standard for the skills the plugin ships.
- [Vercel MCP Handler](https://github.com/vercel/mcp-handler) — librocat Cloud serves the same tool table with it over HTTP.
- LIS methods: the [CREW/MUSTIE](https://www.tsl.texas.gov/ld/pubs/crew/) weeding method behind `weed_report`, and controlled vocabularies in the manner of ANSI/NISO Z39.19 behind `thesaurus`.

## Develop

Apache-2.0, source at
[github.com/librocat/librocat](https://github.com/librocat/librocat).
`src/tools.ts` defines the tool table once for both tiers.

```bash
pnpm run build     # bundle dist/main.js with esbuild (zero runtime dependencies)
pnpm test          # end-to-end over stdio against the built artifact
```
