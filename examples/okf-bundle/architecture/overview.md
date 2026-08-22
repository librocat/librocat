---
type: Concept
title: System overview
description: OKF files are the source of truth; a derived index serves search and graph; a stateless MCP is the agent interface.
tags: [architecture, mcp, okf]
status: stable
---

# Overview

librocat has three parts and one rule: the files are the truth, everything else is
rebuildable.

1. **OKF files** live in your Git repo. Each concept is Markdown with YAML
   frontmatter. See [Use OKF as the source of truth](/decisions/use-okf.md).
2. **The index** is derived from those files for search and link traversal. See
   [the index layer](/architecture/index-layer.md).
3. **The MCP** is the only full read/write interface. The same server runs over
   stdio locally and as a remote HTTP endpoint in Cloud.

# Data flow

An agent calls `search` or `get_concept` on the MCP. The MCP reads the index. A
write (`ingest`/`update`) edits the OKF file and updates the index. To rebuild
from scratch, run the [reindex runbook](/runbooks/reindex.md).
