---
type: Concept
title: Index layer
description: The search-and-graph index over the bundle — in-memory Orama in Local (rebuilt from the OKF files), the Convex concepts table in Cloud (the store of record) — providing full-text search and a link graph.
tags: [architecture, index, search]
status: stable
---

# What it is

In Local the index is a cache, not a store of record: it is built from the OKF
files and can be dropped and rebuilt at any time without data loss. In Cloud the
workspace itself is the store of record; export gives the OKF files back.

# Backends

- **Local**: an in-memory Orama index, rebuilt from the files at launch. No database.
- **Cloud**: a Convex table with a search index, one row per concept — the table is the source of truth, so there is no `reindex`.

Both implement one contract, so the [MCP tools](/architecture/overview.md) behave
identically in either tier. Rebuild the Local index with the [reindex runbook](/runbooks/reindex.md).

# What it holds

Per concept: type, title, description, tags, status, body, and outbound links.
Links come only from Markdown links to `.md` targets in the body.
