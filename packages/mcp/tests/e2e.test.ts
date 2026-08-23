/**
 * End-to-end: run the BUILT server (dist/main.js) with node over stdio — the
 * exact artifact `npx -y librocat` runs — and drive a real
 * user workflow through the official MCP client: ingest two concepts, search,
 * read, follow links, set a status, check health.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, expect, test } from "vitest";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distMain = path.join(pkgDir, "dist", "main.js");

let dir: string;
let client: Client;

// biome-ignore lint/suspicious/noExplicitAny: test assertions poke freely at parsed JSON
async function call(tool: string, args: Record<string, unknown>): Promise<any> {
  const res = await client.callTool({ name: tool, arguments: args });
  expect(res.isError).toBeFalsy();
  const content = res.content as { type: string; text: string }[];
  return JSON.parse((content[0] as { text: string }).text);
}

beforeAll(async () => {
  if (!fs.existsSync(distMain)) {
    const build = spawnSync("pnpm", ["run", "build"], { cwd: pkgDir, stdio: "inherit" });
    if (build.status !== 0) throw new Error("pnpm run build failed");
  }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "librocat-e2e-"));
  client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: [distMain],
      env: { ...(process.env as Record<string, string>), LIBROCAT_BUNDLE: path.join(dir, "okf") },
    }),
  );
  expect(client.getServerVersion()?.name).toBe("librocat");
});

afterAll(async () => {
  await client?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test("tools/list exposes the full tool surface", async () => {
  const res = await client.listTools();
  const names = res.tools.map((t) => t.name).sort();
  expect(names).toEqual([
    "delete",
    "finding_aid",
    "get_concept",
    "graph",
    "history",
    "ingest",
    "ingest_repo",
    "list",
    "neighbors",
    "reindex",
    "rename",
    "search",
    "status",
    "thesaurus",
    "update",
    "weed_report",
  ]);
  const ingest = res.tools.find((t) => t.name === "ingest");
  const schema = ingest?.inputSchema as { properties: Record<string, unknown> } | undefined;
  expect(schema?.properties.status).toBeDefined();
});

test("a real user workflow works end to end over stdio", async () => {
  const empty = await call("status", {});
  expect(empty.concepts).toBe(0);
  expect(empty.backend).toBe("orama");

  const dec = await call("ingest", {
    type: "Decision",
    id: "decisions/use-orama",
    title: "Use Orama for local search",
    description: "The local tier searches in memory with Orama; no database is needed.",
    body: "# Decision\nOrama is pure TypeScript.\n\nSee [the kickoff note](/notes/kickoff.md).",
    tags: ["search", "local"],
  });
  expect(dec.id).toBe("decisions/use-orama");

  // Batch form: several concepts in one call, one result per item; a bad
  // item reports its error without failing the others.
  const batch = await call("ingest", {
    concepts: [
      {
        type: "Note",
        id: "notes/kickoff",
        title: "Kickoff notes",
        description: "Where the search decision came from.",
        body: "We compared engines and chose Orama.",
        status: "draft",
      },
      { type: "Note", id: "thesaurus", title: "Reserved id" },
    ],
  });
  expect(batch.written).toBe(1);
  expect(batch.results[0].ok).toBe(true);
  expect(batch.results[0].result.id).toBe("notes/kickoff");
  expect(batch.results[1].ok).toBe(false);
  expect(typeof batch.results[1].error).toBe("string");

  const noType = await call("ingest", { title: "no type" });
  expect(noType.error).toContain("type");

  const hits = await call("search", { query: "orama search" });
  expect(hits.some((h: { id: string }) => h.id === "decisions/use-orama")).toBe(true);
  expect(hits[0].snippet.length).toBeGreaterThan(0);

  const full = await call("get_concept", { id: "decisions/use-orama" });
  expect(full.type).toBe("Decision");
  expect(full.body).toContain("pure TypeScript");

  const nb = await call("neighbors", { id: "decisions/use-orama" });
  expect(nb.outbound).toEqual([{ id: "notes/kickoff", title: "Kickoff notes", exists: true }]);

  // Lifecycle status: set at ingest, changed with update, visible as a facet.
  const drafts = await call("list", { status: "draft" });
  expect(drafts.map((c: { id: string }) => c.id)).toEqual(["notes/kickoff"]);
  await call("update", { id: "notes/kickoff", status: "deprecated" });
  const dep = await call("get_concept", { id: "notes/kickoff" });
  expect(dep.status).toBe("deprecated");
  expect(dep.frontmatter.status).toBe("deprecated");

  const st = await call("status", {});
  expect(st.concepts).toBe(2);
  expect(st.broken_links).toBe(0);
  expect(st.stale).toBe(false);

  // Library science over the wire: thesaurus, weeding report, finding aids.
  await call("thesaurus", { tag: "search", use_for: ["retrieval"] });
  expect((await call("thesaurus", {})).search.use_for).toEqual(["retrieval"]);
  const weed = await call("weed_report", {});
  expect(weed.deprecated).toEqual(["notes/kickoff"]);
  expect(weed.never_retrieved).toBeNull();
  const aid = await call("finding_aid", { dir: "decisions" });
  expect(aid.aids[0].markdown).toContain("[Use Orama for local search](/decisions/use-orama.md)");

  // Weeding and history: delete one, and history is Git's job in Local.
  expect((await call("history", { id: "notes/kickoff" })).note).toContain("Git");
  expect(await call("delete", { id: "notes/kickoff" })).toEqual({ deleted: "notes/kickoff" });
  expect((await call("status", {})).concepts).toBe(2); // the decision + the thesaurus concept
});

test("errors come back as structured error payloads, not crashes", async () => {
  const missing = await call("get_concept", { id: "nope/missing" });
  expect(missing.error).toContain("not found");

  const escaped = await call("ingest", { type: "Note", id: "../escape" });
  expect(escaped.error).toContain("escapes the bundle");

  // A schema-invalid argument is refused by the SDK before the tool runs.
  const bad = await client.callTool({
    name: "ingest",
    arguments: { type: "Note", status: "archived" },
  });
  expect(bad.isError).toBe(true);
});
