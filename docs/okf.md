# OKF in librocat

librocat stores knowledge as [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
(OKF v0.2) files: Markdown with a YAML frontmatter block.

## A concept

```markdown
---
type: Decision            # the only required field
title: Use Orama for local search
description: One actionable sentence.
tags: [search, local]
status: stable            # draft | stable | deprecated (default: stable)
supersededBy: decisions/use-orama-v2   # librocat extension: a "see" reference, set by `update superseded_by`
---

# Body
Front-load the answer. Link related concepts: [index layer](/architecture/index-layer.md).
```

## Ids and paths

The concept id is the file's bundle path without `.md`. librocat appends `.md` when
writing, so ids that contain dots round-trip (a Python file `code/index.py` is
stored at `code/index.py.md` and keeps the id `code/index.py`).

### Shelves: one library, many projects

The leading directory of an id is its **shelf** (`acme/auth-flow` sits on the
`acme` shelf). A library stays one connected whole (one thesaurus, one graph,
one weeding report), and projects are shelves in it. `search` and `list`
take `shelf: "acme"` to scope a read to one project, and an agent working in
that project searches its shelf first and the whole library second. Every
shelf gets its own finding aid (`index.md`). Do not split a library into
several to get per-project views; that is what a shelf is for. Split only
when access must differ (a client under NDA, personal vs employer): that is
a second workspace (Cloud) or a second repo (Local).

## Links become the graph

Only Markdown links to `.md` targets become graph edges:

- `/path/from/bundle.md` — bundle-relative
- `./sibling.md`, `../up.md` — relative to the concept

External URLs and anchors are ignored. `neighbors` and `graph` see exactly the
links you write, so link generously.

## Reserved files

`index.md` and `log.md` are reserved (directory listing and update log). They are
not indexed as concepts.

## Dublin Core, roughly

OKF frontmatter maps nearly one-to-one onto [Dublin Core](https://www.dublincore.org/specifications/dublin-core/dces/),
the fifteen-element library metadata standard: `title` → dc:title,
`description` → dc:description, `tags` → dc:subject, `type` → dc:type, links →
dc:relation. The format is a hand-authorable catalog record, not an invented
schema. (The one element OKF lacks is dc:date — Git history holds it in Local; Cloud stamps `created_at`/`updated_at` and keeps a revision per write.)

## Leniency

Parsing is lenient per the spec: unknown frontmatter keys are preserved, unknown
types are treated as generic concepts, and a file that fails to parse is skipped
rather than aborting the load.
