# Local tier

Free, offline, single user. The free Agent Plugin runs the librocat MCP server
over stdio. At launch the server reads your OKF files into an in-memory search
index (Orama). There is no database and no service. You bring your own AI for
any model-assisted work.

## Install and run

**Recommended:** install the whole plugin (MCP + skills) into every agent
you have — Claude Code, Cursor, Codex, VS Code, OpenClaw, Hermes Agent, and
any other MCP client that runs on your machine (web agents such as
Claude.ai and ChatGPT, and sandboxed platforms such as NemoClaw, need the
remote MCP, that is Cloud) — with the
[plugins CLI](https://www.npmjs.com/package/plugins) against the public
repo (any runner works the same way):

```bash
npx plugins add librocat/librocat
```

**If your agent doesn't support Agent Plugins yet** but does support
[Agent Skills](https://agentskills.io) and MCP separately, install both —
skills alone call tools that don't exist without the server, and the
server alone works without the cataloging guidance:

```bash
npx skills add librocat/librocat    # https://github.com/vercel-labs/skills
npx -y librocat                     # the server itself; see "Connect an agent" below
```

To run the server by hand from a clone instead of npm:

```bash
export LIBROCAT_BUNDLE=./okf    # your OKF files (commit these to Git)
node server/main.js             # the same file the plugin's mcp.json runs
```

## Connect an agent

```json
{
  "mcpServers": {
    "librocat": {
      "command": "npx",
      "args": ["-y", "librocat"],
      "env": { "LIBROCAT_BUNDLE": "./okf" }
    }
  }
}
```

## Cloud mode: same binary, logged in

The server above is tier-aware. With no token it is what this page
describes: Local, offline, the OKF bundle on disk. Add a workspace token —
in the config's `env` as `LIBROCAT_TOKEN`, or by running `librocat login`
and pasting one in — and the same process becomes the client for
[librocat Cloud](https://librocat.dev) instead, on its next start. Nothing
about the install or the MCP config shape changes; the token is the only
switch. See [librocat.dev](https://librocat.dev) for what changes once
logged in (the tool surface, quota, automatic indexation); the CLI itself
is small:

```bash
librocat login    # paste a token from the dashboard's Connect page
librocat logout   # back to Local
librocat whoami   # which tier is active, and why
librocat push     # upload the local OKF bundle into the logged-in workspace
```

`push` runs once, when you upgrade: it reads `./okf` (or the directory you
give it) and writes every concept into the workspace, so a paying user does
not start from an empty library. Restart your agent after logging in or
out — most agents cache the tool list at startup, so the switch is
otherwise invisible until then.

## Workflow

- Commit the OKF files to your own Git repo (GitHub, GitLab, or anywhere). The repo is the
  source of truth — not the index, and not librocat.
- The MCP tools are the only read/write interface. See
  [mcp-tools.md](./mcp-tools.md).
- **Your agent is the indexer.** The agent that calls the MCP is an LLM: when
  it ingests a concept, it writes the title, description, and tags itself.
  Local makes no model call at all: `ingest_repo` writes a mechanical
  description, and your agent improves it with `update`. (The paid Cloud
  tier adds server-side automatic indexation.)
- The index rebuilds from the files at every launch. After you edit files
  outside the MCP (an editor, a `git pull`), ask your agent to run `reindex`.
- `status` reports `stale: true` when the files on disk and the index disagree.
- `history` is the file's Git log (keep the bundle inside a Git repo);
  `weed_report` lists what to review; `thesaurus` is the tag vocabulary (one
  concept file, `thesaurus.md`); `finding_aid` with `write: true` writes an
  `index.md` shelf list into each directory.
- There is nothing to persist except the files.
