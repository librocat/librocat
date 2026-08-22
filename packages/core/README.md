# @librocat/core

The OSS engine behind librocat (Apache-2.0, TypeScript). It reads and writes the
Open Knowledge Format (OKF) and builds a rebuildable in-memory index over an
OKF bundle.

- `okf` — parse/write OKF Markdown concepts, extract cross-links
- `memindex` — the in-memory index: a concept map, a link graph, and an Orama
  (bm25) search index. No database.
- `ingest` — turn files and code repos into OKF concepts (mechanical, no model
  unless an AI Gateway key is set)
- `service` — high-level search/read/write over a workspace (the bundle + the
  index, rebuilt from the files at open)
- `library` — library-science helpers, pure and shared with Cloud
  (`@librocat/core/library`): the tag thesaurus (broader / narrower /
  use-for), query expansion, tag normalization, finding aids

OKF stays the source of truth; the index is derived and rebuilds in
milliseconds at local scale.

```bash
pnpm test          # the test suite
```
