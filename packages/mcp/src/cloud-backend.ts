/**
 * The Cloud-mode Backend: the same `Backend` interface Local implements
 * (`server.ts`), but every method is one call to the real remote MCP server
 * at librocat.dev/mcp, over the official MCP client SDK — the same kind of
 * client any third-party MCP agent uses against that public endpoint. This
 * process still speaks MCP on stdio to the agent — `registerTools` runs
 * unchanged, so the tool names, schemas, and descriptions are the ones
 * defined once in `tools.ts`. Only the sixteen-tool Local backend's calls
 * are replaced with a round trip.
 *
 * `ingest_repo` is the one tool Cloud's own HTTP endpoint cannot offer (no
 * filesystem there): this process has a filesystem, so it walks the repo
 * locally (`planRepoConcepts`, mechanical, no model call) and writes the
 * result into the Cloud workspace with the `ingest` tool. Nothing reads
 * back from Cloud into local files — one source of truth.
 *
 * `reindex` is implemented too, as a documented no-op: every write already
 * lands in Cloud's index immediately, so there is nothing to rebuild. It
 * stays in the tool list (rather than being dropped, the way it is on a
 * direct HTTP connection with no local process at all) so this — the
 * recommended "same binary, a token" path — exposes the same sixteen tools
 * as Local.
 */

import * as path from "node:path";
import { planRepoConcepts } from "@librocat/core";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import {
  type Backend,
  type ConceptFilters,
  type ConceptWrite,
  registerTools,
  type TermPatch,
} from "./tools.ts";

const PACKAGE_VERSION = "2.2.0"; // keep in sync with packages/npm/package.json
const BATCH_SIZE = 100; // the `ingest` tool's `concepts` cap (tools.ts)

/** A remote tool returned `isError`: not a business error, a protocol one. */
class RemoteError extends Error {}

function textOf(content: unknown): string {
  const first = Array.isArray(content) ? content[0] : undefined;
  return first && typeof first === "object" && "text" in first ? String(first.text) : "";
}

/** Open (and lazily reuse) one MCP client connection to the Cloud endpoint. */
function openClient(url: string, token: string): { client: Client; ready: Promise<void> } {
  const client = new Client({ name: "librocat-cloud-bridge", version: PACKAGE_VERSION });
  const ready = client
    .connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    )
    .catch((exc: unknown) => {
      const msg = exc instanceof Error ? exc.message : String(exc);
      throw new RemoteError(
        `could not reach librocat Cloud at ${url}: ${msg} — check the token with ` +
          "`librocat whoami`, or run `librocat login` again",
      );
    });
  return { client, ready };
}

/**
 * The Cloud-mode Backend. `url` and `token` come from `credentials.ts`
 * (env var or `librocat login`). The connection opens on the first tool
 * call, not at startup, so `initialize`/`tools/list` answer immediately —
 * the same lazy-open shape Local's `server.ts` uses for the Service.
 */
export function cloudBackend(url: string, token: string): Backend {
  let held: { client: Client; ready: Promise<void> } | null = null;
  const client = async (): Promise<Client> => {
    held ??= openClient(url, token);
    try {
      await held.ready;
    } catch (exc) {
      held = null; // let the next call retry instead of caching a dead connection
      throw exc;
    }
    return held.client;
  };

  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const c = await client();
    const res = await c.callTool({ name, arguments: args });
    if (res.isError) {
      throw new RemoteError(textOf(res.content) || `librocat Cloud rejected '${name}'`);
    }
    const text = textOf(res.content);
    if (!text) return null;
    return JSON.parse(text);
  }

  async function ingestOne(opts: ConceptWrite): Promise<unknown> {
    return call("ingest", { ...opts });
  }

  async function ingestBatch(concepts: ConceptWrite[]) {
    const results: { ok: boolean; result?: unknown; error?: string }[] = [];
    for (let i = 0; i < concepts.length; i += BATCH_SIZE) {
      const page = concepts.slice(i, i + BATCH_SIZE);
      const res = (await call("ingest", { concepts: page })) as {
        written: number;
        results: { ok: boolean; result?: unknown; error?: string }[];
      };
      results.push(...res.results);
    }
    return { written: results.filter((r) => r.ok).length, results };
  }

  async function ingestRepo(
    repoPath: string,
    opts: { prefix?: string } = {},
  ): Promise<{ ingested: number; indexed: number; note?: string }> {
    // The same trust boundary as Service.ingestRepo (packages/core/src/service.ts):
    // an agent-supplied path may only leave the filesystem if it stays inside
    // LIBROCAT_INGEST_ROOT, when that is set.
    const root = process.env.LIBROCAT_INGEST_ROOT;
    if (root) {
      const rel = path.relative(path.resolve(root), path.resolve(repoPath));
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`path '${repoPath}' is outside the allowed ingest root`);
      }
    }
    const planned = planRepoConcepts(repoPath, opts);
    if (planned.length === 0) return { ingested: 0, indexed: 0 };
    const writes: ConceptWrite[] = planned.map((p) => ({
      type: p.type,
      title: p.title,
      description: p.description,
      body: p.body,
      tags: p.tags,
      id: p.id,
    }));
    const { written, results } = await ingestBatch(writes);
    const failed = results.length - written;
    return {
      ingested: planned.length,
      indexed: written,
      ...(failed > 0 ? { note: `${failed} of ${planned.length} concepts failed to ingest` } : {}),
    };
  }

  return {
    search: (query, filters: ConceptFilters) => call("search", { query, ...filters }),
    getConcept: (id) => call("get_concept", { id }),
    list: (filters) => call("list", { ...filters }),
    neighbors: (id) => call("neighbors", { id }),
    graph: (id, opts) => call("graph", { id, ...opts }),
    ingestText: ingestOne,
    ingestBatch,
    update: (id, opts) => call("update", { id, ...opts }),
    rename: (id, newId) => call("rename", { id, new_id: newId }),
    deleteConcept: (id) => call("delete", { id }),
    history: (id, opts) => call("history", { id, ...opts }),
    weedReport: (opts) => call("weed_report", opts),
    thesaurus: () => call("thesaurus", {}),
    setTerm: (tag, term: TermPatch | null) =>
      call("thesaurus", {
        tag,
        broader: term?.broader,
        narrower: term?.narrower,
        use_for: term?.use_for,
        remove: term === null,
      }),
    findingAid: (opts) => call("finding_aid", opts),
    status: () => call("status", {}),
    ingestRepo,
    reindex: async () => {
      const st = (await call("status", {})) as { concepts?: number };
      return {
        indexed: st.concepts ?? 0,
        note: "no-op in Cloud — every write already lands in the index; nothing to rebuild",
      };
    },
  };
}

const INSTRUCTIONS =
  "librocat Cloud, reached through the local bridge: the hosted library for this workspace, " +
  "over the same tools as Local. Use `search`, `get_concept`, `list`, `neighbors`, `graph` to " +
  "read; `ingest`/`update`/`rename`/`delete` to write; `history` for a concept's revisions; " +
  "`weed_report` for what to review; `thesaurus` for the tag vocabulary; `finding_aid` for " +
  "shelf lists; `ingest_repo` to catalog a local code repo into this workspace (reads this " +
  "machine's disk, writes to Cloud — nothing reads back). `reindex` is a no-op here — every " +
  "write is already indexed — kept for parity with Local's tool list. `status` reports plan, " +
  "quota, index credits, and the live type/tag vocabulary.";

/** Build the stdio MCP server for Cloud mode: the shared tool table over `cloudBackend`. */
export function buildCloudServer(url: string, token: string): McpServer {
  const server = new McpServer(
    { name: "librocat", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );
  registerTools(server, cloudBackend(url, token));
  return server;
}
