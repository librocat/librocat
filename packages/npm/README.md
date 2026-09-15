# librocat

**Persistent AI memory, over MCP.** This package is the librocat MCP server:
zero runtime dependencies, no model call. With no token it opens no network
connection either — it reads your Open Knowledge Format (OKF) Markdown files
into an in-memory search index and gives your agent sixteen tools to search,
read, link-walk, write, rename, weed, keep a tag thesaurus, write finding
aids, and read the Git history of your knowledge. Your agent is the
cataloger — this server just holds the library. Log in
([below](#want-the-same-memory-on-every-agent-and-machine-with-a-librarian))
and the same binary becomes the client for [librocat Cloud](https://librocat.dev)
instead.

## Recommended: the whole plugin (MCP + Agent Skills)

If your agent supports [Agent Plugins](https://agent-plugins.org) (Claude
Code, Cursor, Codex, VS Code, and others), one command installs the server
above *and* the four Agent Skills that teach an agent to catalog well:

```bash
npx plugins add librocat/librocat
```

## Skills + MCP, separately

Plenty of agents don't support Agent Plugins yet but do support
[Agent Skills](https://agentskills.io) and [MCP](https://github.com/modelcontextprotocol/typescript-sdk)
— both far more widely adopted. Install both; the skills instruct the agent to
call this server's tools, so skills alone do nothing and this server alone
works without the cataloging guidance:

```bash
npx skills add librocat/librocat
```

```json
{ "mcpServers": { "librocat": { "command": "npx", "args": ["-y", "librocat"], "env": { "LIBROCAT_BUNDLE": "./okf" } } } }
```

`LIBROCAT_BUNDLE` points at your OKF directory (default `./okf`) — commit it
to your own Git repo; the repo is the source of truth, not this server.

## Want the same memory on every agent and machine, with a librarian?

**[librocat Cloud](https://librocat.dev)**: the same tools, hosted. Libro, the
library cat, catalogs what your agent leaves blank and files duplicates,
retired concepts, and stray tags on a weekly review shelf for you to approve,
with a revision on every write.

Upgrading does not change your MCP config. This same binary is the Cloud
client too — add a workspace token (from the dashboard's Connect page) as
`LIBROCAT_TOKEN`, or run `librocat login` and paste it in, and it switches to
Cloud on its next start: the same 16 tools, served from your workspace
instead of the local bundle (`ingest_repo` still reads this machine's disk,
now writing into Cloud; `reindex` becomes a no-op, since Cloud has no local
index to rebuild). `librocat logout` switches back. `librocat login` also
offers to push an existing local library into a freshly-empty workspace in
the same step, or run `librocat push [dir]` yourself any time — nothing is
lost moving from Local to Cloud. Restart your agent after logging in or
out; most agents cache the tool list at startup.

- Repository: https://github.com/librocat/librocat
- Site: https://librocat.dev
- Security: with no token, this server opens no network connection and sends
  no telemetry. With a token, it opens exactly one: to your Cloud workspace,
  nowhere else. The agent that calls it is the AI. See
  [SECURITY.md](https://github.com/librocat/librocat/blob/main/SECURITY.md).

Apache-2.0. © 2026 Laughing Hermit, Inc.
