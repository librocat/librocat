# MCP tools

The agent-facing interface, defined once in `packages/mcp/src/tools.ts` and
registered by both tiers. The Local server resolves its bundle from
`LIBROCAT_BUNDLE`; the Cloud endpoint (`https://librocat.dev/mcp`) resolves
its workspace from the bearer token. Both are stateless.

| Tool | Purpose | Key arguments | Tier |
|------|---------|---------------|------|
| `search` | Full-text search, ranked, with snippets | `query`, `type?`, `tag?`, `status?`, `limit?`, `shelf?` | both |
| `get_concept` | Read one concept in full | `id` | both |
| `list` | List concept metadata | `type?`, `tag?`, `status?`, `limit?`, `offset?`, `shelf?` | both |
| `neighbors` | Direct links (outbound + inbound) | `id` | both |
| `graph` | Breadth-first subgraph (nodes + edges) | `id`, `depth?` (1–4) | both |
| `ingest` | Create a concept, index it (an existing `id` is overwritten in full). Batch form: `concepts: [...]` writes up to 100 in one call and reports, per item, the id or the error | `type`, `title?`, `description?`, `body?`, `tags?`, `id?`, `status?` or `concepts?` | both |
| `update` | Change a concept's body/metadata | `id`, and any field to change (incl. `status`, `superseded_by`) | both |
| `rename` | Move a concept to a new id, rewrite inbound links | `id`, `new_id` | both |
| `delete` | Remove one concept (weeding) | `id` | both |
| `history` | Revisions of a concept, newest first; one revision's snapshot | `id`, `limit?`, `revision?` | both |
| `weed_report` | What to review: deprecated, broken links, orphans, blank records; Cloud adds circulation | `days?`, `limit?` | both |
| `thesaurus` | Read the tag thesaurus, or set one preferred tag's `broader`/`narrower`/`use_for` | `tag?`, `broader?`, `narrower?`, `use_for?`, `remove?` | both |
| `finding_aid` | One shelf list per directory; Local can write them as `index.md` | `dir?`, `write?` | both |
| `ingest_repo` | Ingest a code repo into concepts | `path`, `prefix?` | Local only |
| `reindex` | Rebuild the index from OKF files | — | Local only |
| `status` | Backend, counts, type/tag vocabulary, link health, freshness (Local), plan/quota/index credits and `review_shelf` (Libro's open proposals) (Cloud) | — | both |

## Notes

- **Shelves.** `search` and `list` take `shelf` (the leading directory of
  concept ids, `"acme"` for `acme/...`): one library, many shelves. A project
  reads its own shelf first and the whole library second. Split a library
  only when access must differ (docs/okf.md §Shelves).

- **Writes** (`ingest`, `update`, `rename`, `delete`, `ingest_repo`) edit OKF
  files (Local) or Convex rows (Cloud) and update the index in the same call.
  In Cloud every write also appends a revision.
- **`history`** is Git history in Local (the bundle must live inside a Git
  repository; `revision` is a commit hash) and the revisions table in Cloud
  (`revision` is the sequence number). Both return the same shape:
  `revisions[]` newest first, or `snapshot` with `frontmatter` and `body`.
- **`delete`** removes one concept. Links from other concepts to it become
  broken links (`status` counts them) until you fix or remove them.
- **Supersession.** `update` with `superseded_by` retires a concept in favor
  of another (a "see" reference): status becomes `deprecated` unless given,
  `get_concept` and `search` return `superseded_by`, and `search` sinks
  deprecated hits below live ones unless you filter on `status`.
- **Thesaurus.** The controlled vocabulary lives in one concept (`thesaurus`,
  type `Thesaurus`, `terms` in frontmatter). Writes map `use_for` synonyms
  onto the preferred tag; `search` expands a preferred tag with its narrower
  terms and a synonym with its preferred tag.
- **Body cap (Cloud).** A concept body is at most 64 KB; the error says
  "summarize, split, and link".
- **`ingest_repo`** is mechanical (no model call):
  it extracts symbols with regexes and a code excerpt. JS/TS relative imports
  that resolve to other ingested files become cross-links. Set
  `LIBROCAT_INGEST_ROOT` to confine the `path` argument to that directory.
- **Lifecycle `status`** is `draft`, `stable` (default), or `deprecated`.
  `ingest` and `update` take it; anything else is refused before the tool
  runs. `search` and `list` filter on it.
- **`status`** (the tool) reports `stale: true` (Local) when the files on
  disk and the index disagree — run `reindex`. It also reports
  `broken_links`, and in Cloud `plan`, `max_concepts`, and `index_credits`.
- **`rename`** is authority control from library science: it moves the concept
  and rewrites every inbound link (and pins the moved body's relative links),
  so a rename never orphans a link.
- **`status`** also returns `by_type` and `by_tag` counts — the live
  vocabulary. Agents check it before coining a new type or tag.
- **Circulation (Cloud).** `get_concept` records `last_accessed_at` and
  `access_count` per concept — the usage signal behind "never retrieved"
  weeding — and reports `indexed_at` when automatic indexation filled the
  record. Local stays stateless and records nothing.
- **Automatic indexation (Cloud).** An `ingest`/`update` that leaves a
  concept without a description or tags schedules the cataloger, which
  spends one index credit (see [librocat Cloud](https://librocat.dev)).
- **Errors** come back as a JSON `{"error": "..."}` tool result, never a crash.
- **Ids are confined.** An id that escapes the bundle (`../x`) is refused, and
  ids that map to OKF-reserved filenames (`index.md`, `log.md`) are refused or
  bumped.
