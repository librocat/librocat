---
type: Decision
title: Use OKF as the source of truth
description: Knowledge lives as OKF Markdown in the user's Git repo, never in a proprietary database.
tags: [okf, git, decision]
status: stable
---

# Context

Agents re-derive the same project context every session. We need durable memory
that is portable, reviewable, and not locked into one vendor.

# Decision

Store knowledge as [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
Markdown files committed to the user's own Git repo. The
[index](/architecture/index-layer.md) is derived from these files.

# Consequences

- Knowledge is diff-able and reviewed through PRs, like code.
- Any tool can read the files; librocat is not a silo.
- The [index](/architecture/index-layer.md) can be rebuilt anywhere from the files.
- See the [system overview](/architecture/overview.md) for how this fits together.
