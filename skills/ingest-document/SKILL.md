---
name: ingest-document
description: >-
  Turn a document (PDF, DOCX, Markdown, meeting notes, a web page, a spec) into
  well-cataloged librocat concepts. Use when the user says "remember this
  file", "put this doc in librocat", "save these notes", or points at a
  document and asks the agent to keep what matters. Works with Local and Cloud
  through the same MCP tools.
---

# Ingest a document into librocat

librocat has no file upload. You, the agent, read the document with the tools
you already have (file read, browser, PDF reader) and write what matters as
concepts through the librocat MCP. A concept is a catalog record plus a body.
The catalog record is what makes the memory findable later. Do not skip it.

## Rules

1. **One concept per idea, not one per page.** A 40-page spec is not 40
   concepts. It is the decisions, facts, definitions, and procedures inside
   it. Typical yield: 3 to 15 concepts per document.
2. **Every concept gets a full catalog record**: `type`, `title`, a
   one-sentence `description` a reader can act on, and 2 to 4 `tags`. Call
   `thesaurus` first and reuse its preferred tags. Do not coin synonyms.
3. **Do not paste the whole document into one body.** Bodies are capped at
   64 KB in Cloud, and a wall of text retrieves badly. Summarize. Quote only
   the lines that must be exact (numbers, names, commands, contract terms).
4. **Record the source once.** Put the document's name, date, and location
   (path or URL) in a `## Source` section at the end of each concept body,
   so a reader can go back to the original.
5. **Link, do not repeat.** When two concepts from the same document relate,
   link them with a Markdown link to the other concept's id
   (`[title](../path/other-id.md)`), the same way `okf-authoring` describes.
6. **Check for what already exists.** `search` for the main terms before you
   write. If a concept already covers the idea, `update` it (or set
   `superseded_by` on the old one) instead of creating a duplicate.
7. **Ask before storing sensitive content.** Personal data, credentials,
   or anything the user may not want in shared memory: confirm first.

## Procedure

1. Read the document. Note its title, date, author, and location.
2. `status` for the type and tag vocabulary. `thesaurus` for preferred tags.
3. List the candidate concepts (idea, type, one-line description). Show the
   list to the user if there are more than ten, and let them cut.
4. `search` each candidate's key terms. Decide: new concept, `update`, or
   skip.
5. `ingest` all of them in one call with `concepts: [...]` (up to 100).
   Each item: `id` under a sensible directory (`<topic>/<slug>`), `type`,
   `title`, `description`, `tags`, `status`, and the body with a `## Source`
   section. The result lists, per item, the id or the error, so one bad item
   never blocks the rest.
6. `finding_aid` on the directory (Local: `write: true`) so the shelf list
   includes the new concepts.
7. Report: how many concepts written, their ids, and what you left out.

## Types to reach for

`Decision` (what was chosen and why), `Fact` or `Concept` (a definition or a
number that must stay exact), `Guide` (a procedure), `Requirement`,
`Person`/`Team` (who owns what), `Glossary` (a term). Use the workspace's
existing types from `status` before inventing one.
