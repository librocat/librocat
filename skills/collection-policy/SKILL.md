---
name: collection-policy
description: >-
  The collection development policy for a librocat library: what to accession
  into memory, at what altitude, with which types, tags, and status, and how
  to weed. Use when an agent must decide whether something belongs in
  librocat, when starting a new library, when a plugin adds a "remember this"
  step, or when a team asks what their library is for.
---

# Collection development policy

Libraries write down what they collect so every librarian selects the same
way. This is that policy for a librocat library. Apply it before `ingest`;
it is the reason a library stays useful as it grows.

## What belongs (accession)

Accession a concept when it is **durable, decision-bearing, and not
re-derivable cheaply**:

- A decision and why (`Decision`): trade-offs, the option chosen, what it
  rules out.
- How to do a recurring task (`Runbook`): deploy, migrate, rotate, debug the
  known flaky thing.
- A fact about the domain a newcomer or a fresh agent would otherwise ask
  (`Note`, `Reference`): names, limits, conventions, who owns what.
- The shape of the system a file cannot state (`Concept`): request path,
  data flow, module boundaries.
- Instructions agents must follow every session (`Note` tagged
  `instructions`): coding rules, review rules, tone.

Do **not** accession: whole files or transcripts (summarize and link),
anything the code already states line for line, chat small talk, secrets or
credentials, or a duplicate of an existing concept — `search` first, then
`update` the existing one.

## At what altitude

One concept, one idea. If a title needs "and", split. Front-load the answer;
details below. Aim for a description a reader can act on without opening
the body. Bodies over a few screens should be split and linked; Cloud refuses
bodies over 64 KB.

## Types, tags, status

- **Types** are a small stable set: `Note`, `Decision`, `Runbook`,
  `Reference`, `Concept`, `Code File`. Run `status` and reuse `by_type`.
- **Tags** are the controlled vocabulary. Run `status` (`by_tag`) and
  `thesaurus` before coining one; add a synonym as `use_for` on the
  preferred tag instead of a new tag. Writes map synonyms onto the preferred
  tag automatically.
- **Status**: `draft` while writing, `stable` when it holds, `deprecated`
  when it no longer does — set `superseded_by` when something replaced it,
  so readers are sent to the successor.

## Weeding cadence

Once a month, or whenever `status` shows broken links: run `weed_report` and
review each list — deprecated (delete when history no longer matters),
broken links, orphans (link them or question them), blank records (fill or
delete), and in Cloud "not retrieved in 90 days" (question them; retrieval is
evidence of use). Weeding is routine, not an event. In Cloud, Libro, the
library cat, does the first pass weekly and files supersede / retire /
merge-tag proposals on the review shelf; the human approves or dismisses
them on the Overview. Your job is the judgment calls Libro leaves open.

## Finding aids

After a large accession, run `finding_aid` (Local: `write: true`) so every
directory has an `index.md` a human can browse in the repo or the export.

## For plugin authors

If your plugin saves to librocat, save what this policy accessions and
nothing else, and tell the user what you saved (id and title). One
`ingest` with type, title, one-sentence description, tags, body.
