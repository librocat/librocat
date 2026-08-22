/**
 * The librocat tool surface, defined once for both tiers.
 *
 * Local (`packages/mcp/src/server.ts`) registers these tools over the core
 * Service (OKF files + the in-memory Orama index) and serves them on stdio.
 * Cloud (`apps/web/src/app/mcp/route.ts`) registers the same tools over a
 * Convex-backed Backend and serves them with mcp-handler on Vercel.
 *
 * Both tiers use the official MCP TypeScript SDK v2. This file imports only
 * the pure core (`@librocat/core/format`), so the web app can import it as
 * `librocat/tools`.
 */

import { STATUSES, type Status } from "@librocat/core/format";
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

type Maybe<T> = T | Promise<T>;

export interface ConceptFilters {
  type?: string;
  tag?: string;
  status?: string;
  /** Scope to one shelf: the leading directory of the concept id, e.g. "acme". */
  shelf?: string;
  limit?: number;
}

export interface ConceptWrite {
  type: string;
  title?: string;
  description?: string;
  body?: string;
  tags?: string[];
  id?: string;
  status?: Status;
}

export interface ConceptPatch {
  body?: string;
  title?: string;
  description?: string;
  tags?: string[];
  type?: string;
  status?: Status;
  /** Retire this concept in favor of another ("see" reference); implies deprecated. */
  superseded_by?: string;
}

/** SKOS-shaped relations of one preferred tag (see @librocat/core library.ts). */
export interface TermPatch {
  broader?: string[];
  narrower?: string[];
  use_for?: string[];
}

/**
 * What a tier provides to the tools. The core `Service` satisfies this
 * structurally; the Cloud backend implements it over Convex. A method returns
 * a JSON-serializable value, or throws an Error whose message becomes the
 * `{"error": ...}` tool result.
 */
export interface Backend {
  search(query: string, filters: ConceptFilters): Maybe<unknown>;
  /** Null when the concept does not exist. */
  getConcept(id: string): Maybe<unknown>;
  list(filters: ConceptFilters & { offset?: number }): Maybe<unknown>;
  neighbors(id: string): Maybe<unknown>;
  graph(id: string, opts: { depth?: number }): Maybe<unknown>;
  ingestText(opts: ConceptWrite): Maybe<unknown>;
  update(id: string, opts: ConceptPatch): Maybe<unknown>;
  rename(id: string, newId: string): Maybe<unknown>;
  /** Delete one concept (weeding). Inbound links from other concepts become broken links. */
  deleteConcept(id: string): Maybe<unknown>;
  /** Revision history: Git history in Local, the revisions table in Cloud. */
  history(id: string, opts: { limit?: number; revision?: string }): Maybe<unknown>;
  /** The CREW/MUSTIE weeding report (never retrieved, deprecated, broken, orphans, blank records). */
  weedReport(opts: { limit?: number; days?: number }): Maybe<unknown>;
  /** The tag thesaurus (controlled vocabulary). */
  thesaurus(): Maybe<unknown>;
  /** Set (or remove with null) one preferred tag's relations. */
  setTerm(tag: string, term: TermPatch | null): Maybe<unknown>;
  /** Finding aids: one shelf list per directory; Local can write them as index.md. */
  findingAid(opts: { dir?: string; write?: boolean }): Maybe<unknown>;
  status(): Maybe<unknown>;
  /** Local only: needs a filesystem. Cloud leaves it undefined. */
  ingestRepo?(path: string, opts: { prefix?: string }): Maybe<unknown>;
  /** Local only: rebuilds the index from the files on disk. */
  reindex?(): Maybe<unknown>;
}

/**
 * Cloud resolves its backend per request from the bearer token in
 * `ctx.http.authInfo`; Local passes one static backend. Only a static
 * backend can offer the filesystem tools (`ingest_repo`, `reindex`).
 */
export type BackendFactory = (ctx: ServerContext) => Backend;

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** Run a tool body; a thrown Error becomes an `{"error": ...}` result. */
async function run(body: () => Maybe<unknown>) {
  try {
    return json(await body());
  } catch (exc) {
    return json({ error: exc instanceof Error ? exc.message : String(exc) });
  }
}

const statusArg = z
  .enum(STATUSES)
  .optional()
  .describe("Lifecycle status: draft, stable (default), or deprecated");

/** Register the librocat tools on an MCP server over the given backend. */
export function registerTools(server: McpServer, backend: Backend | BackendFactory): void {
  const be = (ctx: ServerContext): Backend =>
    typeof backend === "function" ? backend(ctx) : backend;
  const local = typeof backend === "function" ? undefined : backend;

  server.registerTool(
    "search",
    {
      description: "Search the library. Returns ranked concepts with match snippets.",
      inputSchema: z.object({
        query: z.string().describe("Full-text query over titles, descriptions, tags, and bodies"),
        type: z.string().optional().describe("Filter by concept type, e.g. 'Note'"),
        tag: z.string().optional().describe("Filter by a single tag"),
        status: z.string().optional().describe("Filter by lifecycle status"),
        shelf: z
          .string()
          .optional()
          .describe(
            "Scope to one shelf: the leading directory of concept ids, e.g. 'acme' for " +
              "acme/... One library, many shelves: search your project's shelf first, then " +
              "the whole library if it comes back empty",
          ),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    },
    ({ query, type, tag, status, shelf, limit }, ctx) =>
      run(() => be(ctx).search(query, { type, tag, status, shelf, limit })),
  );

  server.registerTool(
    "get_concept",
    {
      description: "Read one concept in full: frontmatter, body, tags, and metadata.",
      inputSchema: z.object({
        id: z.string().describe("Concept id (bundle path without .md), e.g. 'code/auth/login'"),
      }),
    },
    ({ id }, ctx) =>
      run(async () => (await be(ctx).getConcept(id)) ?? { error: `concept not found: ${id}` }),
  );

  server.registerTool(
    "list",
    {
      description:
        "List concepts (metadata only), optionally filtered by type, tag, status, or shelf " +
        "(the leading directory of concept ids, e.g. 'acme').",
      inputSchema: z.object({
        type: z.string().optional(),
        tag: z.string().optional(),
        status: z.string().optional(),
        shelf: z.string().optional().describe("Scope to one shelf, e.g. 'acme' for acme/..."),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    },
    ({ type, tag, status, shelf, limit, offset }, ctx) =>
      run(() => be(ctx).list({ type, tag, status, shelf, limit, offset })),
  );

  server.registerTool(
    "neighbors",
    {
      description: "Direct links of a concept: outbound (it links to) and inbound (links to it).",
      inputSchema: z.object({ id: z.string() }),
    },
    ({ id }, ctx) => run(() => be(ctx).neighbors(id)),
  );

  server.registerTool(
    "graph",
    {
      description: "A breadth-first subgraph of concepts around `id`, as nodes and edges.",
      inputSchema: z.object({
        id: z.string(),
        depth: z.number().int().min(1).max(4).default(1).describe("Hops to traverse"),
      }),
    },
    ({ id, depth }, ctx) => run(() => be(ctx).graph(id, { depth })),
  );

  const conceptWrite = z.object({
    type: z.string().describe("OKF concept type, e.g. 'Note', 'Decision', 'Runbook'"),
    title: z.string().optional(),
    description: z.string().optional().describe("One-sentence summary"),
    body: z.string().default("").describe("Markdown body of the concept"),
    tags: z.array(z.string()).optional(),
    id: z
      .string()
      .optional()
      .describe(
        "Explicit concept id (bundle path without .md). Overwrites an existing concept " +
          "with that id; omit to derive one that never collides",
      ),
    status: statusArg,
  });

  server.registerTool(
    "ingest",
    {
      description:
        "Create an OKF concept and index it. Returns its id. If `id` is given and already " +
        "exists, that concept is overwritten in full; use `update` to change only some " +
        "fields. If `id` is omitted it is derived from the title (else the body, else the " +
        "type) and de-duplicated with a numeric suffix. To write many concepts in one " +
        "call (for example, one document turned into several concepts), pass `concepts`: " +
        "each item is written on its own and the result lists, per item, the id or the error.",
      inputSchema: conceptWrite.partial({ type: true }).extend({
        concepts: z
          .array(conceptWrite)
          .min(1)
          .max(100)
          .optional()
          .describe("Batch form: up to 100 concepts, each with the same fields as a single call"),
      }),
    },
    async ({ concepts, ...single }, ctx) => {
      if (concepts) {
        const results = [];
        for (const c of concepts) {
          try {
            results.push({ ok: true, result: await be(ctx).ingestText(c) });
          } catch (exc) {
            results.push({ ok: false, error: exc instanceof Error ? exc.message : String(exc) });
          }
        }
        return json({ written: results.filter((r) => r.ok).length, results });
      }
      if (!single.type) return json({ error: "`type` is required (or pass `concepts`)" });
      return run(() => be(ctx).ingestText({ ...single, type: single.type as string }));
    },
  );

  server.registerTool(
    "update",
    {
      description: "Update an existing concept's body or metadata. Only provided fields change.",
      inputSchema: z.object({
        id: z.string(),
        body: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        type: z.string().optional(),
        status: statusArg.describe(
          "Lifecycle status: draft, stable, or deprecated. Unchanged when omitted",
        ),
        superseded_by: z
          .string()
          .optional()
          .describe(
            "Id of the concept that replaces this one (a 'see' reference). Sets status to " +
              "deprecated unless status is given",
          ),
      }),
    },
    ({ id, ...patch }, ctx) => run(() => be(ctx).update(id, patch)),
  );

  server.registerTool(
    "rename",
    {
      description:
        "Rename a concept to a new id and rewrite every inbound link to match. " +
        "A rename never orphans a link.",
      inputSchema: z.object({
        id: z.string().describe("Current concept id"),
        new_id: z.string().describe("New concept id (bundle path without .md)"),
      }),
    },
    ({ id, new_id }, ctx) => run(() => be(ctx).rename(id, new_id)),
  );

  server.registerTool(
    "delete",
    {
      description:
        "Delete one concept (weeding). Links from other concepts to it become broken " +
        "links until you fix or remove them.",
      inputSchema: z.object({ id: z.string() }),
    },
    ({ id }, ctx) => run(() => be(ctx).deleteConcept(id)),
  );

  server.registerTool(
    "history",
    {
      description:
        "Revision history of a concept, newest first. Pass `revision` to read that " +
        "revision's frontmatter and body. Local history is the Git log of the file; " +
        "Cloud keeps a revision per write.",
      inputSchema: z.object({
        id: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
        revision: z.string().optional().describe("A revision id from the list"),
      }),
    },
    ({ id, limit, revision }, ctx) => run(() => be(ctx).history(id, { limit, revision })),
  );

  server.registerTool(
    "weed_report",
    {
      description:
        "The weeding report (library CREW/MUSTIE, done mechanically): deprecated concepts, " +
        "broken links, orphans (no inbound links), concepts without a description or tags, " +
        "and in Cloud the circulation view — never retrieved in `days` days, most retrieved. " +
        "Review these; fix, supersede, or delete.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(3650).default(90).describe("Circulation window"),
        limit: z.number().int().min(1).max(500).default(50).describe("Max ids per list"),
      }),
    },
    ({ days, limit }, ctx) => run(() => be(ctx).weedReport({ days, limit })),
  );

  server.registerTool(
    "thesaurus",
    {
      description:
        "The controlled vocabulary of tags. Without `tag`: read the whole thesaurus. With " +
        "`tag`: set that preferred tag's relations — `broader`, `narrower`, and `use_for` " +
        "(synonyms that writes map onto the preferred tag; `search` expands a preferred tag " +
        "with its narrower terms). Omitted relations are kept; pass `[]` to clear one. " +
        "`remove: true` drops the tag's entry.",
      inputSchema: z.object({
        tag: z.string().optional().describe("Preferred tag to set (lowercase)"),
        broader: z.array(z.string()).optional(),
        narrower: z.array(z.string()).optional(),
        use_for: z.array(z.string()).optional().describe("Non-preferred synonyms"),
        remove: z.boolean().default(false),
      }),
    },
    ({ tag, broader, narrower, use_for, remove }, ctx) =>
      run(() => {
        const b = be(ctx);
        if (!tag) return b.thesaurus();
        return b.setTerm(tag, remove ? null : { broader, narrower, use_for });
      }),
  );

  server.registerTool(
    "finding_aid",
    {
      description:
        "Finding aids: one Markdown shelf list per directory (title, type, status, " +
        "one-sentence description, links). Optionally only under `dir`. In Local, " +
        "`write: true` writes each as that directory's index.md (an OKF-reserved file the " +
        "index never treats as a concept).",
      inputSchema: z.object({
        dir: z.string().optional().describe("Restrict to this directory and below"),
        write: z.boolean().default(false).describe("Local only: write index.md files"),
      }),
    },
    ({ dir, write }, ctx) => run(() => be(ctx).findingAid({ dir, write })),
  );

  if (local?.ingestRepo) {
    const ingestRepo = local.ingestRepo.bind(local);
    server.registerTool(
      "ingest_repo",
      {
        description:
          "Ingest a code repository into OKF concepts (one per source file) and reindex. " +
          "Mechanical extraction only, no model call. " +
          "JS/TS imports become cross-links. When LIBROCAT_INGEST_ROOT is set, the path " +
          "must live inside that root.",
        inputSchema: z.object({
          path: z.string().describe("Filesystem path to a code repository to ingest"),
          prefix: z.string().default("code").describe("Concept id namespace for generated files"),
        }),
      },
      ({ path, prefix }) => run(() => ingestRepo(path, { prefix })),
    );
  }

  if (local?.reindex) {
    const reindex = local.reindex.bind(local);
    server.registerTool(
      "reindex",
      {
        description:
          "Rebuild the index from the OKF bundle on disk. OKF stays the source of truth.",
      },
      () => run(() => reindex()),
    );
  }

  server.registerTool(
    "status",
    {
      description:
        "Report backend, concept counts, the live type/tag vocabulary, link health, " +
        "freshness (Local) and plan, quota, and index credits (Cloud).",
    },
    (ctx) => run(() => be(ctx).status()),
  );
}
