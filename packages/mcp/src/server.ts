/**
 * The librocat MCP server, Local tier: the tool surface from tools.ts over
 * the core Service (OKF files + the in-memory Orama index), served on stdio
 * (the plugin runs it as `node server/main.js`). Built on the official MCP TypeScript SDK v2.
 *
 * State: one Service per process holds the in-memory index, rebuilt from the
 * OKF files at launch. The files are the only durable state; `reindex`
 * rebuilds after external edits.
 */

import { Service } from "@librocat/core";
import { McpServer } from "@modelcontextprotocol/server";
import { registerTools } from "./tools.ts";

const INSTRUCTIONS =
  "librocat is a durable library of memory for agents, backed by Open Knowledge " +
  "Format (OKF) Markdown files. Use `search` to find concepts, `get_concept` to " +
  "read one, `list` to browse, `neighbors`/`graph` to follow links, and " +
  "`ingest`/`update`/`ingest_repo` to write. `rename` moves a concept and " +
  "rewrites every inbound link; `delete` weeds one out; `history` reads its Git " +
  "log; `weed_report` lists what to review; `thesaurus` holds the tag vocabulary; " +
  "`finding_aid` writes shelf lists. Run `reindex` after external file changes and " +
  "`status` to check freshness and see the live type/tag vocabulary.";

let servicePromise: Promise<Service> | null = null;

function svc(): Promise<Service> {
  servicePromise ??= Service.open();
  return servicePromise;
}

// The Service opens lazily on the first tool call, so `initialize` and
// `tools/list` answer before the bundle is read.
const lazyBackend = {
  search: async (q, f) => (await svc()).search(q, f),
  getConcept: async (id) => (await svc()).getConcept(id),
  list: async (f) => (await svc()).list(f),
  neighbors: async (id) => (await svc()).neighbors(id),
  graph: async (id, o) => (await svc()).graph(id, o),
  ingestText: async (o) => (await svc()).ingestText(o),
  update: async (id, o) => (await svc()).update(id, o),
  rename: async (a, b) => (await svc()).rename(a, b),
  deleteConcept: async (id) => (await svc()).deleteConcept(id),
  history: async (id, o) => (await svc()).history(id, o),
  weedReport: async (o) => (await svc()).weedReport(o),
  thesaurus: async () => (await svc()).thesaurus(),
  setTerm: async (tag, term) => (await svc()).setTerm(tag, term),
  findingAid: async (o) => (await svc()).findingAid(o),
  status: async () => (await svc()).status(),
  ingestRepo: async (p, o) => (await svc()).ingestRepo(p, o),
  reindex: async () => (await svc()).reindex(),
} satisfies Parameters<typeof registerTools>[1];

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "librocat", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );
  registerTools(server, lazyBackend);
  return server;
}
