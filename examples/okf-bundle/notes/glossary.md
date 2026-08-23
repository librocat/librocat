---
type: Note
title: Glossary
description: Core librocat terms in one place.
tags: [glossary, reference]
status: stable
---

# Terms

- **Library** — durable, structured knowledge agents rely on over time (a librocat workspace or bundle).
  Not a chat notebook and not only a retrieval pipeline.
- **OKF** — Open Knowledge Format. Markdown + YAML frontmatter, the
  [source of truth](/decisions/use-okf.md).
- **Concept** — one OKF file. Its id is the bundle path without `.md`.
- **Bundle** — a directory of concept files.
- **Index** — the derived, rebuildable search + graph layer. See
  [the index layer](/architecture/index-layer.md).
- **MCP** — the stateless agent interface. See the
  [system overview](/architecture/overview.md).
- **Agent Plugin** — the unit of distribution: the MCP plus Agent Skills.
