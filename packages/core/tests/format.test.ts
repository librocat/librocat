/**
 * The pure core, `@librocat/core/format`: the one implementation both tiers
 * run. These tests are the contract Cloud inherits, so a Convex row and an
 * OKF file behave the same.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  bfsGraph,
  buildFrontmatter,
  canonicalId,
  checkStatus,
  demoteDeprecated,
  deriveConceptId,
  dump,
  extractLinks,
  isReservedId,
  libraryStats,
  makeSnippet,
  matchesFilters,
  normalizeSegments,
  OKFError,
  parse,
  retargetLinks,
  slugify,
  weedRules,
} from "../src/format.ts";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

test("format.ts and library.ts import nothing from node, so Convex can bundle them", () => {
  for (const f of ["format.ts", "library.ts"]) {
    const text = fs.readFileSync(path.join(src, f), "utf8");
    expect(text).not.toMatch(/from "node:/);
    expect(text).not.toMatch(/from "@orama/);
  }
});

describe("ids", () => {
  test("canonicalId collapses segments and refuses escapes and empties", () => {
    expect(canonicalId("a/../b")).toBe("b");
    expect(canonicalId("./x//y/")).toBe("x/y");
    expect(canonicalId("/abs/z")).toBe("abs/z");
    expect(() => canonicalId("../escape")).toThrow(OKFError);
    expect(() => canonicalId("")).toThrow(OKFError);
  });
  test("normalizeSegments is lenient for link targets", () => {
    expect(normalizeSegments("../x")).toBe("x");
  });
  test("isReservedId names the OKF-reserved files", () => {
    expect(isReservedId("notes/index")).toBe(true);
    expect(isReservedId("log")).toBe(true);
    expect(isReservedId("code/index.py")).toBe(false);
  });
  test("slugify", () => {
    expect(slugify("Use SQLite FTS5!")).toBe("use-sqlite-fts5");
    expect(slugify("  ---  ")).toBe("concept");
  });
  test("deriveConceptId: explicit ids are refused when reserved, auto ids are bumped", async () => {
    const taken = new Set(["hello", "hello-2", "index-2"]);
    const exists = (id: string) => taken.has(id);
    expect(await deriveConceptId({ type: "Note", title: "Hello" }, exists)).toBe("hello-3");
    expect(await deriveConceptId({ type: "Note", title: "index" }, exists)).toBe("index-3");
    expect(await deriveConceptId({ type: "Note", id: "a/../b" }, exists)).toBe("b");
    expect(await deriveConceptId({ type: "Note" }, exists)).toBe("note");
    await expect(deriveConceptId({ type: "Note", id: "notes/index" }, exists)).rejects.toThrow(
      /reserved filename 'index.md'/,
    );
    await expect(deriveConceptId({ type: "Note", id: "thesaurus" }, exists)).rejects.toThrow(
      /thesaurus/,
    );
    // An async `exists` (Cloud) works the same.
    expect(
      await deriveConceptId({ type: "Note", title: "Hello" }, async (id) => taken.has(id)),
    ).toBe("hello-3");
  });
});

describe("frontmatter", () => {
  test("buildFrontmatter rebuilds standard keys, keeps unknown ones, and omits stable", () => {
    const fm = buildFrontmatter(
      { type: "Old", title: "Old", custom: 1, supersededBy: "x" },
      { type: "Note", title: "New", tags: [], status: "stable", extra: { supersededBy: null } },
    );
    expect(fm).toEqual({ custom: 1, type: "Note", title: "New" });
    expect(buildFrontmatter(null, { type: "Note", status: "draft", tags: ["a"] })).toEqual({
      type: "Note",
      status: "draft",
      tags: ["a"],
    });
    expect(() => buildFrontmatter(null, { type: "Note", status: "nope" })).toThrow(OKFError);
  });
  test("checkStatus", () => {
    expect(checkStatus("draft")).toBe("draft");
    expect(() => checkStatus("live")).toThrow(/invalid status/);
  });
  test("dump(parse(x)) is stable", () => {
    const text = "---\ntype: Note\ntitle: Hi\n---\nbody [x](/x.md)\n";
    const c = parse(text, { conceptId: "a" });
    expect(c.links).toEqual(["x"]);
    expect(dump(c)).toBe(text);
  });
});

describe("links", () => {
  test("extractLinks resolves relative and absolute targets, skips the rest", () => {
    const links = extractLinks(
      "[a](b.md) [b](../c.md) [c](/d/e.md#frag) [x](https://x.io/y.md) [m](mailto:a@b.md) [t](t.txt) [a](b.md)",
      "notes/src",
    );
    expect(links).toEqual(["notes/b", "c", "d/e"]);
  });
  test("retargetLinks rewrites mapped links, keeps anchors, leaves the rest", () => {
    const res = retargetLinks(
      "[a](b.md#top) [o](/other.md) [x](https://x.io/b.md)",
      "notes/src",
      new Map([["notes/b", "moved/b"]]),
    );
    expect(res.changed).toBe(1);
    expect(res.body).toBe("[a](/moved/b.md#top) [o](/other.md) [x](https://x.io/b.md)");
  });
});

describe("search helpers", () => {
  test("makeSnippet brackets matches and marks truncation", () => {
    const snip = makeSnippet(
      "one two three four five six seven eight sqlite nine ten",
      "sqlite",
      4,
    );
    expect(snip).toContain("[sqlite]");
    expect(snip.startsWith("…")).toBe(true);
  });
  test("demoteDeprecated is a stable partition", () => {
    const hits = [
      { id: 1, status: "deprecated" },
      { id: 2, status: "stable" },
      { id: 3, status: "draft" },
    ];
    expect(demoteDeprecated(hits).map((h) => h.id)).toEqual([2, 3, 1]);
  });
  test("matchesFilters", () => {
    const row = { id: "acme/a", type: "Note", status: "stable", tags: ["x"] };
    expect(matchesFilters(row, { type: "Note", tag: "x", shelf: "/acme/" })).toBe(true);
    expect(matchesFilters(row, { status: "draft" })).toBe(false);
    expect(matchesFilters(row, { shelf: "other" })).toBe(false);
  });
});

describe("library science", () => {
  const rows = [
    { id: "a", status: "stable", links: ["b", "ghost"], description: "A", tags: ["t"] },
    { id: "b", status: "deprecated", links: [], description: "", tags: [] },
    { id: "thesaurus", status: "stable", links: [], description: "", tags: [] },
  ];
  test("weedRules: the five rules, thesaurus skipped, counts before the limit", () => {
    const w = weedRules(rows, 1);
    expect(w.counts).toEqual({
      deprecated: 1,
      broken_links: 1,
      orphans: 1,
      no_description: 1,
      no_tags: 1,
    });
    expect(w.deprecated).toEqual(["b"]);
    expect(w.broken_links).toEqual([{ id: "a", missing: ["ghost"] }]);
    expect(w.orphans).toEqual(["a"]);
    expect(w.no_description).toEqual(["b"]);
  });
  test("libraryStats counts the vocabulary and broken links", () => {
    const st = libraryStats(
      rows.map((r) => ({ id: r.id, type: "Note", tags: r.tags, links: r.links })),
    );
    expect(st).toEqual({
      concepts: 3,
      by_type: { Note: 3 },
      by_tag: { t: 1 },
      links: 2,
      broken_links: 1,
    });
  });
  test("bfsGraph walks to depth, caps nodes, and prunes dangling edges", async () => {
    const adj: Record<string, string[]> = { a: ["b"], b: ["c"], c: [] };
    const neighborsOf = (id: string) => ({
      outbound: (adj[id] ?? []).map((x) => ({ id: x })),
      inbound: Object.entries(adj)
        .filter(([, out]) => out.includes(id))
        .map(([src]) => ({ id: src })),
    });
    const nodeFor = (id: string) => ({ id, title: null, exists: id in adj });
    const g1 = await bfsGraph("a", { depth: 1 }, neighborsOf, nodeFor);
    expect(g1.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    const g2 = await bfsGraph("a", { depth: 2 }, neighborsOf, nodeFor);
    expect(g2.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    expect(g2.edges).toEqual([
      { src: "a", dst: "b" },
      { src: "b", dst: "c" },
    ]);
    const capped = await bfsGraph("a", { depth: 2, maxNodes: 2 }, neighborsOf, nodeFor);
    expect(capped.nodes).toHaveLength(2);
    expect(capped.edges).toEqual([{ src: "a", dst: "b" }]);
  });
});
