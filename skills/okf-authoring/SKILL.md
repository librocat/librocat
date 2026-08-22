---
name: okf-authoring
description: >-
  Write and structure high-quality Open Knowledge Format (OKF) concepts for a
  librocat library. Use when creating or editing knowledge with the librocat
  MCP (ingest/update): choosing a concept type, writing a one-sentence summary,
  adding cross-links, and applying progressive disclosure. Trigger when the user
  asks to capture a decision, note, runbook, or code understanding into librocat.
---

# Authoring OKF concepts

OKF is how librocat stores knowledge: Markdown files with YAML frontmatter, kept
in the user's Git repo (Local) or the hosted workspace (Cloud — export gives the
same files back). The index is derived and rebuildable. Write for two
readers at once — a human skimming, and an agent retrieving.

## The shape of a concept

Every concept needs a non-empty `type`. Everything else is optional but strongly
recommended:

```markdown
---
type: Decision
title: Use Orama for local search
description: One sentence a reader can act on without opening the body.
tags: [search, local, index]
status: stable        # draft | stable | deprecated (default: stable)
---

# Context
Why this exists. Keep the first paragraph self-contained.

# Decision
The claim, stated plainly.

# Consequences
What follows. Link related concepts: see [the index layer](/architecture/index.md).
```

## Rules that make retrieval work

1. **One library, many shelves.** Put a project's concepts under one leading
   directory, its shelf (`acme/…`). Read your project's shelf first
   (`search`/`list` with `shelf: "acme"`) and the whole library second. Never
   make a separate library for a project; make a shelf. Separate libraries
   only when access must differ.
2. **One concept, one idea.** If a file needs "and" in its title, split it.
3. **Write the `description` as a standalone sentence.** It is what `search` and
   `list` show first, and what an index page quotes. No "This concept covers…".
4. **Front-load the body.** Put the answer in the first paragraph; details below.
   This is progressive disclosure — a reader stops as soon as they have enough.
5. **Link with Markdown, to `.md` targets.** `/path/from/bundle.md` is
   bundle-relative; `./sibling.md` is relative. librocat turns these into graph
   edges, so `neighbors` and `graph` only see links you actually write.
6. **Pick a stable `type` and reuse it.** Common types: `Note`, `Decision`,
   `Runbook`, `Reference`, `Concept`, `Code File`. Types are free-form; be
   consistent so `list --type` and `search --type` stay useful.
   **Treat tags the same way — as a controlled vocabulary.** Before coining a
   new type or tag, run `status` (reuse `by_type`/`by_tag`) and `thesaurus`
   (reuse a preferred tag, or add the synonym as `use_for` on it instead of a
   new tag — writes map synonyms onto the preferred tag); `auth`, `authn`, and
   `authentication` as three tags splinter retrieval into thirds.
7. **Choose the id from the path.** The concept id is the file path without
   `.md` (for example `decisions/use-orama`). Group with directories.

## Workflow with the MCP

- Create: call `ingest` with `type`, `title`, `description`, `body`, `tags`,
  and `status` (`draft` while you are still writing; `stable` is the default).
  Writing several at once: pass `concepts: [...]` and get one result per item.
- Refine: call `update` with only the fields that change — including
  `status: "stable"` when a draft is done, or `"deprecated"` when it no
  longer holds (set `superseded_by` when a successor exists, so readers are
  sent to it).
- Verify: call `search` for the new title, then `neighbors` to confirm links
  resolved. Run `status` and check `broken_links` is 0.

## Good vs weak

- Weak title: "Auth". Good: "Sessions expire after 30 days".
- Weak description: "Notes about the parser". Good: "The parser reads frontmatter
  in one pass and never rejects unknown keys."
- Weak body: a wall of text. Good: answer first, then `# Details`, then links.
