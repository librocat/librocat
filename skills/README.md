# Agent Skills

The librocat Agent Skills, following the [Agent Skills Standard](https://agentskills.io).
These are the single source; `scripts/build-plugin.ts` copies them into the
distributable Agent Plugin.

- **`okf-authoring`** — write and structure high-quality OKF concepts.
- **`knowledge-review`** — audit and level-up a library, ship as a PR.
- **`collection-policy`** — what belongs in the library, at what altitude, with
  which types, tags, and status; when to weed.
- **`ingest-document`** — turn a PDF, DOCX, notes, or a web page into
  well-cataloged concepts (one per idea, full catalog record, source noted).
  There is no file upload: the agent reads the document and writes concepts.

Each is a folder with a `SKILL.md` (name + description + instructions). Agents
load the name/description first and read the full file only when a task matches.
