---
type: Runbook
title: Rebuild the index
description: Rebuild the derived index from the OKF bundle when files change outside the MCP.
tags: [runbook, index, ops]
status: stable
---

# When

Run this after editing OKF files directly (a text editor, a `git pull`, a merge),
or whenever `status` reports `stale: true`.

# How

- Call the `reindex` tool
- Check the result with the `status` tool

The rebuild reads every concept in the bundle and replaces the
[index](/architecture/index-layer.md). No OKF data is lost — the files are the
source of truth per [this decision](/decisions/use-okf.md).

# Verify

`status` should report `stale: false` and `broken_links: 0`. Broken links mean a
concept links to an id that does not exist yet — create it or fix the link.
