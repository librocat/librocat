# Local tier

Free, offline, single user. The free Agent Plugin runs the librocat MCP server
over stdio. At launch the server reads your OKF files into an in-memory search
index (Orama). There is no database and no service. You bring your own AI for
any model-assisted work.

## Install and run

The plugin carries its own built server (`server/main.js`); nothing comes
from npm. To run the server by hand from a clone:

```bash
export LIBROCAT_BUNDLE=./okf    # your OKF files (commit these to Git)
node server/main.js             # the same file the plugin's mcp.json runs
```

To install the whole plugin (MCP + skills) into every agent you have —
Claude Code, Cursor, Codex, VS Code, OpenClaw, Hermes Agent, and any other
MCP client that runs on your machine (web agents such as Claude.ai and
ChatGPT, and sandboxed platforms such as NemoClaw, need the remote MCP, that
is Cloud) — use the
[plugins CLI](https://www.npmjs.com/package/plugins) against the public repo
(any runner works the same way):

```bash
npx plugins add librocat/librocat
```

Skills alone: `npx skills add librocat/librocat`
(the [skills CLI](https://github.com/vercel-labs/skills)).

Until the npm package is published, run from this repo:

```bash
pnpm install && pnpm run build
node packages/mcp/dist/main.js
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
