import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  dump,
  expandQuery,
  extractLinks,
  loadBundle,
  makeSnippet,
  normalizeTags,
  OKFError,
  parse,
  pathFor,
  Service,
  slugify,
} from "../src/index.ts";

let dir: string;
let bundle: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "librocat-test-"));
  bundle = path.join(dir, "okf");
  fs.mkdirSync(bundle, { recursive: true });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, text: string): void {
  const p = path.join(bundle, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, "utf8");
}

const NOTE = `---
type: Note
title: Kickoff
description: Where it started.
tags: [notes, start]
---
We chose [the decision](/decisions/use-okf.md) at kickoff.
`;

describe("okf", () => {
  test("parse extracts frontmatter, body, and links", () => {
    const c = parse(NOTE, { conceptId: "notes/kickoff" });
    expect(c.type).toBe("Note");
    expect(c.frontmatter.title).toBe("Kickoff");
    expect(c.body).toContain("We chose");
    expect(c.links).toEqual(["decisions/use-okf"]);
  });

  test("dump(parse(x)) is body-stable", () => {
    const c = parse(NOTE, { conceptId: "n" });
    const again = parse(dump(c), { conceptId: "n" });
    expect(again.body).toBe(c.body);
    expect(again.frontmatter).toEqual(c.frontmatter);
  });

  test("parse rejects missing frontmatter and missing type", () => {
    expect(() => parse("no frontmatter", { conceptId: "x" })).toThrow(OKFError);
    expect(() => parse("---\ntitle: t\n---\nbody", { conceptId: "x" })).toThrow(OKFError);
  });

  test("relative links resolve against the source directory", () => {
    const links = extractLinks(
      "see [a](../decisions/a.md) and [b](./b.md) and [self](c.md)",
      "notes/deep/src",
    );
    expect(links).toEqual(["notes/decisions/a", "notes/deep/b", "notes/deep/c"]);
  });

  test("external, anchor, and non-md links are ignored; duplicates dropped", () => {
    const links = extractLinks(
      "x [w](https://x.md) [m](mailto:a@b.md) [p](/a.md#frag) [p2](/a.md) [img](pic.png)",
      "n",
    );
    expect(links).toEqual(["a"]);
  });

  test("pathFor refuses ids that escape the bundle", () => {
    expect(() => pathFor(bundle, "../escape")).toThrow(OKFError);
    expect(() => pathFor(bundle, "/etc/passwd")).toThrow(OKFError);
    expect(pathFor(bundle, "code/index.py").endsWith("code/index.py.md")).toBe(true);
  });

  test("loadBundle skips invalid files and reserved names", () => {
    write("good.md", NOTE);
    write("bad.md", "not okf");
    write("index.md", NOTE);
    write("log.md", NOTE);
    const all = loadBundle(bundle);
    expect(all.map((c) => c.id)).toEqual(["good"]);
  });
});

describe("slugify", () => {
  test("lowercases and dashes", () => {
    expect(slugify("Use SQLite FTS5!")).toBe("use-sqlite-fts5");
    expect(slugify("  ---  ")).toBe("concept");
  });
});

describe("makeSnippet", () => {
  test("brackets matches and marks truncation", () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const snip = makeSnippet(`${text} sqlite rest`, "sqlite");
    expect(snip).toContain("[sqlite]");
    expect(snip).toContain("…");
  });
});

describe("Service", () => {
  test("open builds the index from disk at launch", async () => {
    write("notes/kickoff.md", NOTE);
    const svc = await Service.open(bundle);
    const st = svc.status();
    expect(st.concepts).toBe(1);
    expect(st.backend).toBe("orama");
    expect(st.stale).toBe(false);
  });

  test("ingest, search, get, neighbors round-trip", async () => {
    const svc = await Service.open(bundle);
    const dec = await svc.ingestText({
      type: "Decision",
      id: "decisions/use-orama",
      title: "Use Orama for local search",
      description: "The local tier searches in memory with Orama.",
      body: "# Decision\nOrama is pure TypeScript.\n\nSee [the kickoff note](/notes/kickoff.md).",
      tags: ["search", "local"],
    });
    expect(dec.id).toBe("decisions/use-orama");
    await svc.ingestText({
      type: "Note",
      id: "notes/kickoff",
      title: "Kickoff notes",
      body: "We compared engines and chose Orama.",
    });

    const hits = await svc.search("orama search");
    expect(hits.some((h) => h.id === "decisions/use-orama")).toBe(true);
    expect(hits[0]?.snippet.length).toBeGreaterThan(0);
    expect(hits[0]?.score).toBeGreaterThan(0);
    // Search rows are metadata only — no body/frontmatter.
    expect("body" in (hits[0] as object)).toBe(false);

    const full = svc.getConcept("decisions/use-orama");
    expect(full?.type).toBe("Decision");
    expect(full?.body).toContain("pure TypeScript");
    expect(full?.frontmatter.title).toBe("Use Orama for local search");

    const nb = svc.neighbors("decisions/use-orama");
    expect(nb.outbound).toEqual([{ id: "notes/kickoff", title: "Kickoff notes", exists: true }]);
    const back = svc.neighbors("notes/kickoff");
    expect(back.inbound.map((n) => n.id)).toEqual(["decisions/use-orama"]);
  });

  test("search filters by type, tag, and status", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "a", title: "Alpha topic", tags: ["x"] });
    await svc.ingestText({ type: "Decision", id: "b", title: "Alpha topic too", tags: ["y"] });
    expect((await svc.search("alpha", { type: "Note" })).map((h) => h.id)).toEqual(["a"]);
    expect((await svc.search("alpha", { tag: "y" })).map((h) => h.id)).toEqual(["b"]);
    expect((await svc.search("alpha", { status: "draft" })).length).toBe(0);
  });

  test("list paginates and filters", async () => {
    const svc = await Service.open(bundle);
    for (const id of ["a", "b", "c"]) await svc.ingestText({ type: "Note", id });
    await svc.ingestText({ type: "Decision", id: "d" });
    expect(svc.list().map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(svc.list({ limit: 2, offset: 1 }).map((c) => c.id)).toEqual(["b", "c"]);
    expect(svc.list({ type: "Decision" }).map((c) => c.id)).toEqual(["d"]);
  });

  test("auto ids slugify and bump on collision", async () => {
    const svc = await Service.open(bundle);
    const first = await svc.ingestText({ type: "Note", title: "My Note!" });
    const second = await svc.ingestText({ type: "Note", title: "My Note!" });
    expect(first.id).toBe("my-note");
    expect(second.id).toBe("my-note-2");
  });

  test("reserved ids are rejected explicitly and bumped when auto-derived", async () => {
    const svc = await Service.open(bundle);
    await expect(svc.ingestText({ type: "Note", id: "index" })).rejects.toThrow("reserved");
    const auto = await svc.ingestText({ type: "Note", title: "Index" });
    expect(auto.id).toBe("index-2");
  });

  test("update changes only the given fields and refreshes links", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "n", title: "Old", body: "old" });
    await svc.update("n", { body: "see [x](/x.md)", description: "fresh" });
    const rec = svc.getConcept("n");
    expect(rec?.title).toBe("Old");
    expect(rec?.description).toBe("fresh");
    expect(svc.neighbors("n").outbound.map((o) => o.id)).toEqual(["x"]);
    expect(svc.neighbors("n").outbound[0]?.exists).toBe(false);
    await expect(svc.update("missing", { body: "x" })).rejects.toThrow("not found");
  });

  test("status reports stale after external file changes", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "n" });
    expect(svc.status().stale).toBe(false);
    write("external.md", NOTE);
    expect(svc.status().stale).toBe(true);
    await svc.reindex();
    expect(svc.status().stale).toBe(false);
    expect(svc.status().concepts).toBe(2);
  });

  test("graph walks outbound and inbound edges to depth", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "a", body: "[b](/b.md)" });
    await svc.ingestText({ type: "Note", id: "b", body: "[c](/c.md)" });
    await svc.ingestText({ type: "Note", id: "c" });
    const g1 = await svc.graph("a", { depth: 1 });
    expect(g1.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    const g2 = await svc.graph("a", { depth: 2 });
    expect(g2.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    expect(g2.edges).toContainEqual({ src: "b", dst: "c" });
  });

  test("rename moves the concept and rewrites inbound and relative links", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "notes/target", body: "the target" });
    // One absolute inbound link, one relative inbound link from a sibling.
    await svc.ingestText({ type: "Note", id: "abs", body: "see [t](/notes/target.md)" });
    await svc.ingestText({ type: "Note", id: "notes/rel", body: "see [t](./target.md)" });
    // The moved concept links to a sibling relatively; the move must pin it.
    await svc.ingestText({ type: "Note", id: "notes/out", body: "out" });
    await svc.update("notes/target", { body: "links [o](./out.md)" });

    const res = await svc.rename("notes/target", "archive/target");
    expect(res.id).toBe("archive/target");
    expect(res.relinked).toBe(2);
    expect(svc.getConcept("notes/target")).toBeNull();
    expect(svc.getConcept("archive/target")?.body).toContain("/notes/out.md");
    const nb = svc.neighbors("archive/target");
    expect(nb.inbound.map((n) => n.id).sort()).toEqual(["abs", "notes/rel"]);
    expect((svc.status() as { broken_links: number }).broken_links).toBe(0);
  });

  test("status reports the live tag vocabulary (facet discovery)", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "one", tags: ["auth", "api"] });
    await svc.ingestText({ type: "Note", id: "two", tags: ["auth"] });
    const st = svc.status() as { by_tag: Record<string, number> };
    expect(st.by_tag).toEqual({ auth: 2, api: 1 });
  });

  test("ingestRepo writes one concept per source file with import links", async () => {
    const repo = path.join(dir, "repo");
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "src/app.ts"),
      'import { helper } from "./util.ts";\nexport function main() {}\n',
    );
    fs.writeFileSync(path.join(repo, "src/util.ts"), "export function helper() {}\n");
    fs.writeFileSync(path.join(repo, "README.md"), "# not source\n");
    const svc = await Service.open(bundle);
    const res = await svc.ingestRepo(repo);
    expect(res.ingested).toBe(2);
    const rec = svc.getConcept("code/src/app.ts");
    expect(rec?.type).toBe("Code File");
    expect(rec?.body).toContain("`main`");
    expect(svc.neighbors("code/src/app.ts").outbound.map((o) => o.id)).toEqual([
      "code/src/util.ts",
    ]);
  });

  test("status is set at ingest, changed by update, and validated", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "n/draft", body: "wip", status: "draft" });
    expect(svc.getConcept("n/draft")?.status).toBe("draft");
    expect(svc.list({ status: "draft" }).map((c) => c.id)).toEqual(["n/draft"]);
    await svc.update("n/draft", { status: "deprecated" });
    expect(svc.getConcept("n/draft")?.frontmatter.status).toBe("deprecated");
    await expect(svc.update("n/draft", { status: "archived" })).rejects.toThrow(/invalid status/);
    await expect(svc.ingestText({ type: "Note", status: "nope" })).rejects.toThrow(
      /invalid status/,
    );
  });

  test("ingestRepo is confined to LIBROCAT_INGEST_ROOT when set", async () => {
    const svc = await Service.open(bundle);
    process.env.LIBROCAT_INGEST_ROOT = path.join(dir, "allowed");
    try {
      await expect(svc.ingestRepo(path.join(dir, "elsewhere"))).rejects.toThrow(
        /outside the allowed ingest root/,
      );
    } finally {
      delete process.env.LIBROCAT_INGEST_ROOT;
    }
  });

  test("deleteConcept removes the file and the index entry", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "n/gone", body: "bye" });
    await svc.ingestText({ type: "Note", id: "n/stays", body: "see [gone](/n/gone.md)" });
    expect(await svc.deleteConcept("n/gone")).toEqual({ deleted: "n/gone" });
    expect(svc.getConcept("n/gone")).toBeNull();
    expect(fs.existsSync(path.join(bundle, "n/gone.md"))).toBe(false);
    expect(svc.status().broken_links).toBe(1);
    await expect(svc.deleteConcept("n/gone")).rejects.toThrow(/not found/);
  });

  test("history is empty outside Git and reads the log inside a repo", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "n/h", body: "v1" });
    expect(svc.history("n/h").note).toContain("not inside a Git repository");
    const git = (...args: string[]) =>
      spawnSync("git", ["-C", dir, ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@example.com",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@example.com",
        },
      });
    if (git("init", "-q").status !== 0) return; // no git on this machine: nothing to check
    git("add", ".");
    git("commit", "-q", "-m", "first");
    await svc.update("n/h", { body: "v2" });
    git("add", ".");
    git("commit", "-q", "-m", "second");
    const h = svc.history("n/h");
    expect(h.revisions.map((r) => r.message)).toEqual(["second", "first"]);
    const first = h.revisions[1]?.revision as string;
    expect(svc.history("n/h", { revision: first }).snapshot?.body.trim()).toBe("v1");
    expect(() => svc.history("n/h", { revision: "not-a-hash!" })).toThrow(/commit hash/);
  });

  test("weedReport lists deprecated, broken, orphans, and blank records", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({
      type: "Note",
      id: "w/a",
      title: "A",
      description: "d",
      tags: ["x"],
      body: "see [b](/w/b.md) and [gone](/w/gone.md)",
    });
    await svc.ingestText({ type: "Note", id: "w/b", body: "blank record", status: "deprecated" });
    const r = svc.weedReport();
    expect(r.deprecated).toEqual(["w/b"]);
    expect(r.broken_links).toEqual([{ id: "w/a", missing: ["w/gone"] }]);
    expect(r.orphans).toEqual(["w/a"]);
    expect(r.no_description).toEqual(["w/b"]);
    expect(r.no_tags).toEqual(["w/b"]);
    expect(r.never_retrieved).toBeNull();
  });

  test("superseded_by retires a concept and search demotes it", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({
      type: "Decision",
      id: "d/old",
      title: "Use Postgres for search",
      body: "postgres search",
    });
    await svc.ingestText({
      type: "Decision",
      id: "d/new",
      title: "Use Orama for search",
      body: "orama search",
    });
    await svc.update("d/old", { superseded_by: "d/new" });
    const old = svc.getConcept("d/old");
    expect(old?.status).toBe("deprecated");
    expect(old?.superseded_by).toBe("d/new");
    const hits = await svc.search("search");
    expect(hits.map((h) => h.id)).toEqual(["d/new", "d/old"]);
    const onlyDeprecated = await svc.search("search", { status: "deprecated" });
    expect(onlyDeprecated.map((h) => h.id)).toEqual(["d/old"]);
    await expect(svc.update("d/old", { superseded_by: "d/old" })).rejects.toThrow(/itself/);
    await expect(svc.update("d/old", { superseded_by: "d/nope" })).rejects.toThrow(/not found/);
    // A rename of the successor keeps the "see" reference pointing at it.
    await svc.rename("d/new", "d/newer");
    expect(svc.getConcept("d/old")?.superseded_by).toBe("d/newer");
    // "" clears the reference (status stays as it is).
    await svc.update("d/old", { superseded_by: "" });
    expect(svc.getConcept("d/old")?.superseded_by).toBeNull();
    // Demotion happens before the page is cut: a small limit still shows live first.
    for (let i = 0; i < 5; i++) {
      await svc.ingestText({
        type: "Note",
        id: `d/dep${i}`,
        body: "search search search",
        status: "deprecated",
      });
    }
    const page = await svc.search("search", { limit: 2 });
    expect(page.map((h) => h.status)).toEqual(["stable", "deprecated"]);
    expect(page[0]?.id).toBe("d/newer"); // outranked on bm25, but live comes first
  });

  test("thesaurus normalizes tags on write and expands queries", async () => {
    const svc = await Service.open(bundle);
    await svc.setTerm("auth", { narrower: ["sso", "oauth"], use_for: ["authn", "authentication"] });
    expect(svc.thesaurus().auth?.use_for).toEqual(["authn", "authentication"]);
    expect(fs.existsSync(path.join(bundle, "thesaurus.md"))).toBe(true);
    await svc.ingestText({
      type: "Note",
      id: "t/login",
      title: "Login flow",
      tags: ["Authentication", "web"],
      body: "the login flow",
    });
    expect(svc.getConcept("t/login")?.tags).toEqual(["auth", "web"]);
    await svc.ingestText({
      type: "Note",
      id: "t/sso",
      title: "SSO setup",
      tags: ["sso"],
      body: "sso with okta",
    });
    // "auth" expands to its narrower terms, so the SSO note is found.
    const hits = await svc.search("auth");
    expect(hits.map((h) => h.id)).toContain("t/sso");
    // A synonym finds the preferred-tagged concept.
    const syn = await svc.search("authn");
    expect(syn.map((h) => h.id)).toContain("t/login");
    // The tag facet goes through the thesaurus too, and hits stay live-first.
    expect((await svc.search("login", { tag: "authn" })).map((h) => h.id)).toEqual(["t/login"]);
    expect(svc.list({ tag: "Authentication" }).map((c) => c.id)).toEqual(["t/login"]);
    // Case variants and synonyms collapse onto one preferred spelling.
    expect(normalizeTags(["Auth", "auth", "authn", "web"], svc.thesaurus())).toEqual([
      "auth",
      "web",
    ]);
    // Expansions come first so a partial last word keeps prefix matching in Cloud.
    expect(expandQuery("auth rot", svc.thesaurus())).toBe("sso oauth auth rot");
    // Omitted relations are kept; [] clears; authority control on synonyms.
    await svc.setTerm("auth", { broader: ["security"] });
    expect(svc.thesaurus().auth).toEqual({
      broader: ["security"],
      narrower: ["sso", "oauth"],
      use_for: ["authn", "authentication"],
    });
    await svc.setTerm("auth", { narrower: [] });
    expect(svc.thesaurus().auth?.narrower).toBeUndefined();
    await expect(svc.setTerm("authn", { narrower: ["x"] })).rejects.toThrow(/use_for synonym/);
    await expect(svc.setTerm("session", { use_for: ["authn"] })).rejects.toThrow(/already/);
    // The thesaurus concept is reserved for the tool.
    await expect(svc.ingestText({ type: "Note", id: "thesaurus" })).rejects.toThrow(/thesaurus/);
    await expect(svc.rename("thesaurus", "x")).rejects.toThrow(/thesaurus/);
    expect(svc.thesaurus().auth?.use_for).toEqual(["authn", "authentication"]);
    // Reopen: the thesaurus is a concept file, so it survives a restart.
    const again = await Service.open(bundle);
    expect(again.thesaurus().auth?.broader).toEqual(["security"]);
    await again.setTerm("auth", null);
    expect(again.thesaurus().auth).toBeUndefined();
  });

  test("a re-ingest over a retired concept drops the see reference; update keeps it", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "a", body: "a" });
    await svc.ingestText({ type: "Note", id: "b", body: "b" });
    await svc.update("a", { superseded_by: "b" });
    await svc.update("a", { title: "still retired" });
    expect(svc.getConcept("a")?.superseded_by).toBe("b");
    expect(svc.getConcept("a")?.status).toBe("deprecated");
    await svc.ingestText({ type: "Note", id: "a", body: "fresh" });
    expect(svc.getConcept("a")?.superseded_by).toBeNull();
    expect(svc.getConcept("a")?.status).toBe("stable");
  });

  test("ids are canonical, so finding aids never leave the bundle", async () => {
    const svc = await Service.open(bundle);
    // An id that climbs above the bundle root is refused, in both tiers
    // (canonicalId); one that stays inside is collapsed.
    await expect(svc.ingestText({ type: "Note", id: "a/../../okf/x", body: "x" })).rejects.toThrow(
      /escapes the bundle/,
    );
    const res = await svc.ingestText({ type: "Note", id: "a/../x", body: "x" });
    expect(res.id).toBe("x");
    expect(svc.findingAid({ write: true }).aids.map((a) => a.dir)).toEqual([""]);
    expect(fs.existsSync(path.join(bundle, "..", "index.md"))).toBe(false);
    await svc.ingestText({ type: "Note", id: "n/one", body: "y" });
    expect((await svc.rename("n/one", "n/../m/../two")).id).toBe("two");
  });

  test("findingAid renders one shelf list per directory and can write index.md", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({
      type: "Decision",
      id: "decisions/use-okf",
      title: "Use OKF",
      description: "Why OKF.",
      body: "x",
    });
    await svc.ingestText({ type: "Note", id: "notes/kickoff", body: "y", status: "draft" });
    await svc.ingestText({ type: "Note", id: "readme", title: "Readme", body: "z" });
    const { aids, written } = svc.findingAid({ write: true });
    expect(written).toBe(3);
    expect(aids.map((a) => a.dir)).toEqual(["", "decisions", "notes"]);
    const root = aids[0]?.markdown ?? "";
    expect(root).toContain("[decisions/](/decisions/index.md)");
    expect(root).toContain("[Readme](/readme.md)");
    const dec = fs.readFileSync(path.join(bundle, "decisions/index.md"), "utf8");
    expect(dec).toContain("[Use OKF](/decisions/use-okf.md) `Decision` — Why OKF.");
    expect(fs.readFileSync(path.join(bundle, "notes/index.md"), "utf8")).toContain("_(draft)_");
    // index.md files are reserved: a reindex still counts three concepts.
    expect((await svc.reindex()).indexed).toBe(3);
    expect(svc.findingAid({ dir: "notes" }).aids.map((a) => a.dir)).toEqual(["notes"]);
  });

  test("a shelf scopes search and list to one project's directory", async () => {
    const svc = await Service.open(bundle);
    await svc.ingestText({ type: "Note", id: "acme/auth", title: "Acme auth", body: "login flow" });
    await svc.ingestText({ type: "Note", id: "beta/auth", title: "Beta auth", body: "login flow" });
    await svc.ingestText({ type: "Note", id: "readme", title: "Readme", body: "login notes" });
    expect((await svc.search("login", {})).map((h) => h.id).sort()).toEqual([
      "acme/auth",
      "beta/auth",
      "readme",
    ]);
    // "acme", "acme/", "/acme/" all mean the same shelf; "acmeX" is not it.
    for (const shelf of ["acme", "acme/", "/acme/"]) {
      expect((await svc.search("login", { shelf })).map((h) => h.id)).toEqual(["acme/auth"]);
      expect(svc.list({ shelf }).map((c) => c.id)).toEqual(["acme/auth"]);
    }
    expect(svc.list({ shelf: "ac" })).toEqual([]);
    // An empty shelf is the whole library.
    expect(svc.list({ shelf: "" }).length).toBe(3);
  });
});
