---
name: knowledge-review
description: >-
  Review and improve a librocat library: raise link health, add missing
  architecture/decision concepts, and prepare knowledge changes as a Git PR. Use
  when the user asks to audit, clean up, or level-up an OKF bundle, when ingesting
  a code repo and wanting durable higher-level concepts on top of the mechanical
  Code File concepts, or when reviewing a knowledge PR.
---

# Reviewing a library

Mechanical ingestion (`ingest_repo`) gives one `Code File` concept per source
file with symbols and imports. That is a floor, not the goal. The value is the
durable, higher-level concepts a human or agent would otherwise re-derive every
session. This skill turns a raw bundle into a good one.

In Cloud, part of this runs by itself: Libro, the library cat, files
supersede / retire / merge-tag proposals on a weekly review shelf, and
`status` reports `review_shelf` (the open count). Point the user at the
Overview to approve or dismiss them; do not redo that work by hand.

## Pass 1 — health

1. Run `status` and `weed_report`. Note `concepts`, `links`, `broken_links`,
   `stale`, and each weeding list — deprecated, broken links, orphans, no
   description, no tags (Cloud: also not retrieved in `days` days).
2. Local: if `stale` is true, run `reindex` (OKF on disk is the source of
   truth). Cloud has no `reindex` and is never stale — the workspace is the
   source of truth.
3. For each broken link, either create the missing concept or fix the link with
   `update`. A `graph` of a central concept shows where edges are thin.

## Pass 2 — altitude

Add concepts that no single file states. For a code repo, the high-value ones:

- **Architecture** (`type: Concept`): how the parts fit — the request path, the
  data flow, the module boundaries. Link to the `Code File` concepts as evidence.
- **Decision** (`type: Decision`): why it is built this way. One decision per
  file: context, decision, consequences.
- **Runbook** (`type: Runbook`): how to do the recurring task — deploy, migrate,
  debug the flaky test.

Keep each one to a single idea and link generously; links are the graph.

## Pass 3 — summaries

Open the weak concepts (`list`, then `get_concept`). Rewrite each `description`
into a standalone, actionable sentence. Front-load each body so a reader can stop
early. Use the `okf-authoring` skill for the per-concept craft. Tags: check
`thesaurus` first; add a synonym as `use_for` on the preferred tag instead of
retagging concepts by hand — writes normalize through it.

## Pass 4 — weeding

A collection full of stale items hides the good ones, and agents act on what
they retrieve — stale knowledge is worse than missing knowledge. Borrow the
library CREW method: review each concept against MUSTIE and remove what fails.

- **M**isleading — no longer true of the code or the world.
- **U**gly — unreadable enough that nobody will fix it; rewrite or drop.
- **S**uperseded — a newer decision or concept replaced it.
- **T**rivial — states nothing a reader could not guess.
- **I**rrelevant — outside what this base is for.
- **E**lsewhere — restates what another concept (or a `Code File`) already says.

Set `status: "deprecated"` with `update` when history matters — pass
`superseded_by` when a newer concept replaced it, so readers are sent on; call
`delete` when it does not (in Local that removes the file — commit the removal
in the PR; in Cloud the revisions go with it). Weeding is routine maintenance, not a special event —
in Cloud it is also how a team stays under the concept quota with a better
base instead of a bigger one.

## Pass 5 — ship it

Local: OKF lives in the user's Git repo, so knowledge is reviewed like code.

1. Commit the changed `.md` files on a branch.
2. Open a PR/MR. The diff is readable Markdown — reviewers see exactly what
   changed.
3. In the PR description, list new concepts and any link changes. Note that the
   index rebuilds from these files, so there is nothing else to migrate.
4. Run `finding_aid` with `write: true` so each directory's `index.md` matches,
   and commit those too.

Cloud: every write is already a revision. Finish by running `status` (0 broken
links) and, for anything you rewrote, `history` on it so the before/after is
on record for the team.

## What not to do

- Do not turn the dashboard into the editor. Write through the MCP; the dashboard
  is for visibility.
- Do not paste whole files into concept bodies. Summarize and link.
- Do not invent types per file. Reuse a small, stable set.
