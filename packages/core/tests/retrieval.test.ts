/**
 * Retrieval evaluation harness — the reference-desk question "did the reader
 * find it?", measured. A small fixed collection, a set of queries with the
 * concept a reader wants, and two numbers: precision at 3 and mean reciprocal
 * rank. The thresholds are a floor, not a target: they catch a change to the
 * index schema, snippet, or thesaurus expansion that makes retrieval worse.
 *
 * Add a case when a real query misses; raise the floor when the numbers do.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { Service } from "../src/index.ts";

const COLLECTION = [
  {
    id: "decisions/use-orama",
    type: "Decision",
    title: "Use Orama for local search",
    description: "The Local tier searches in memory with Orama; no database.",
    tags: ["search", "local"],
    body: "Orama is pure TypeScript and runs under every package manager. Rebuild the index at launch.",
  },
  {
    id: "decisions/use-convex",
    type: "Decision",
    title: "Use Convex for the hosted store",
    description: "Cloud keeps concepts in Convex tables with a search index.",
    tags: ["cloud", "database"],
    body: "Convex gives functions, auth, scheduling, and search without a pooler.",
  },
  {
    id: "runbooks/reindex",
    type: "Runbook",
    title: "Rebuild the index",
    description: "Run reindex after editing OKF files outside the MCP.",
    tags: ["index", "operations"],
    body: "The index is derived. After a git pull or an editor change, ask the agent to run reindex.",
  },
  {
    id: "runbooks/rotate-token",
    type: "Runbook",
    title: "Rotate the workspace token",
    description: "Regenerate the remote MCP bearer token from the Connect page.",
    tags: ["security", "cloud"],
    body: "The old token stops working immediately. Update every agent config.",
  },
  {
    id: "notes/pricing",
    type: "Note",
    title: "Pricing",
    description: "Individual $12, Team $60, Local free.",
    tags: ["billing"],
    body: "Index credits: 500 and 2,500 a month, then $0.01 per concept.",
  },
  {
    id: "notes/login-flow",
    type: "Note",
    title: "Login flow",
    description: "How sign-in works: Convex Auth with email and password.",
    tags: ["auth", "web"],
    body: "Sessions are cookies. OAuth for the remote MCP is planned.",
  },
  {
    id: "notes/sso-okta",
    type: "Note",
    title: "SSO with Okta",
    description: "Enterprise single sign-on through Okta.",
    tags: ["sso"],
    body: "SAML today, OIDC later.",
  },
  {
    id: "glossary/concept",
    type: "Reference",
    title: "Concept",
    description: "One OKF Markdown file: frontmatter plus body.",
    tags: ["okf"],
    body: "The id is the path without .md.",
  },
  {
    id: "glossary/weeding",
    type: "Reference",
    title: "Weeding",
    description: "Removing stale knowledge so agents do not act on it.",
    tags: ["library-science"],
    body: "CREW and MUSTIE: misleading, ugly, superseded, trivial, irrelevant, elsewhere.",
  },
  {
    id: "notes/deploy",
    type: "Runbook",
    title: "Deploy the dashboard",
    description: "Vercel project with root apps/web.",
    tags: ["operations", "cloud"],
    body: "Set NEXT_PUBLIC_CONVEX_URL and deploy.",
  },
];

// query → the concept a reader wants first.
const CASES: [string, string][] = [
  ["orama search", "decisions/use-orama"],
  ["how do I rebuild the index after git pull", "runbooks/reindex"],
  ["rotate bearer token", "runbooks/rotate-token"],
  ["what does team cost", "notes/pricing"],
  ["weeding stale knowledge", "glossary/weeding"],
  ["deploy vercel", "notes/deploy"],
  ["convex hosted store", "decisions/use-convex"],
  // Thesaurus: "authentication" is a use-for synonym of the preferred tag "auth".
  ["authentication", "notes/login-flow"],
  // Thesaurus: "auth" expands to its narrower term "sso".
  ["auth okta", "notes/sso-okta"],
];

let dir: string;
let svc: Service;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "librocat-retrieval-"));
  svc = await Service.open(path.join(dir, "okf"));
  await svc.setTerm("auth", { narrower: ["sso"], use_for: ["authentication", "authn"] });
  for (const c of COLLECTION) await svc.ingestText(c);
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

test("precision@3 and MRR stay above the floor", async () => {
  let hitsAt3 = 0;
  let rr = 0;
  const misses: string[] = [];
  for (const [query, want] of CASES) {
    const ids = (await svc.search(query, { limit: 10 })).map((h) => h.id);
    const rank = ids.indexOf(want);
    if (rank !== -1 && rank < 3) hitsAt3 += 1;
    if (rank !== -1) rr += 1 / (rank + 1);
    else misses.push(`${query} → ${want} (got ${ids.slice(0, 3).join(", ") || "nothing"})`);
  }
  const p3 = hitsAt3 / CASES.length;
  const mrr = rr / CASES.length;
  console.log(`retrieval: p@3=${p3.toFixed(2)} mrr=${mrr.toFixed(2)}`);
  expect(misses).toEqual([]);
  expect(p3).toBeGreaterThanOrEqual(0.85);
  expect(mrr).toBeGreaterThanOrEqual(0.75);
});
