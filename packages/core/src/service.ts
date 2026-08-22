/**
 * High-level operations over a workspace (an OKF bundle + the in-memory
 * index). The MCP tools call this layer, so search / read / write logic lives
 * in exactly one place.
 *
 * The bundle directory comes from LIBROCAT_BUNDLE (default ./okf). The index is
 * built from the files at open() and kept in sync by every write; `reindex`
 * rebuilds it after external file edits.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  bfsGraph,
  canonicalId,
  deriveConceptId,
  type GraphEdge,
  type GraphNode,
  isReservedId,
  type SearchFilters,
} from "./format.ts";
import { ingestRepo, writeConcept } from "./ingest.ts";
import {
  expandQuery,
  normalizeTags,
  renderFindingAids,
  type Term,
  THESAURUS_CONCEPT,
  THESAURUS_ID,
  type Thesaurus,
  thesaurusFrom,
  withTerm,
} from "./library.ts";
import { MemoryIndex } from "./memindex.ts";
import * as okf from "./okf.ts";

/** Resolve the bundle directory: argument, then LIBROCAT_BUNDLE, then ./okf. */
export function resolveBundle(bundle?: string): string {
  return path.resolve(bundle ?? process.env.LIBROCAT_BUNDLE ?? "./okf");
}

export class Service {
  readonly bundle: string;
  readonly index: MemoryIndex;

  private constructor(bundle: string, index: MemoryIndex) {
    this.bundle = bundle;
    this.index = index;
  }

  /** Open a workspace: read the OKF files and build the in-memory index. */
  static async open(bundle?: string): Promise<Service> {
    const svc = new Service(resolveBundle(bundle), await MemoryIndex.build());
    await svc.reindex();
    return svc;
  }

  // ---- reads ----------------------------------------------------------------

  search(query: string, filters: SearchFilters = {}) {
    const th = this.thesaurus();
    return this.index.search(query, this.facet(filters, th), expandQuery(query, th));
  }

  /** The `tag` facet goes through the thesaurus too: a synonym finds its preferred tag. */
  private facet<F extends SearchFilters>(filters: F, th = this.thesaurus()): F {
    return filters.tag ? { ...filters, tag: normalizeTags([filters.tag], th)[0] } : filters;
  }

  weedReport(opts: { limit?: number; days?: number } = {}) {
    return this.index.weedReport(opts);
  }

  // ---- library science: thesaurus, finding aids -----------------------------

  /** The tag thesaurus, read from the `thesaurus` concept (empty when absent). */
  thesaurus(): Thesaurus {
    return thesaurusFrom(this.index.get(THESAURUS_ID)?.frontmatter);
  }

  /** Set (or remove, with null) the relations of one preferred tag. */
  async setTerm(tag: string, term: Term | null): Promise<{ thesaurus: Thesaurus }> {
    const next = withTerm(this.thesaurus(), tag, term);
    const concept = writeConcept(this.bundle, THESAURUS_ID, {
      ...THESAURUS_CONCEPT,
      extra: { terms: next },
    });
    await this.index.upsert(concept);
    return { thesaurus: next };
  }

  /**
   * Finding aids: one Markdown shelf list per directory. With `write`, each
   * is written to that directory's `index.md` (OKF reserves the name for
   * exactly this; the loader never indexes it as a concept).
   */
  findingAid(opts: { dir?: string; write?: boolean } = {}) {
    const entries = this.index.list({ limit: 100_000 }).map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      type: c.type,
      status: c.status,
    }));
    const wanted = opts.dir?.replace(/^\/+|\/+$/g, "");
    const aids = renderFindingAids(entries).filter(
      (a) => wanted === undefined || a.dir === wanted || a.dir.startsWith(`${wanted}/`),
    );
    let written = 0;
    if (opts.write) {
      for (const a of aids) {
        const p = path.resolve(this.bundle, a.dir, "index.md");
        if (path.relative(this.bundle, p).startsWith("..")) {
          throw new Error(`finding aid escapes the bundle: ${a.dir}`);
        }
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, a.markdown, "utf8");
        written += 1;
      }
    }
    return { aids, written };
  }

  getConcept(conceptId: string) {
    return this.index.get(conceptId);
  }

  list(filters: SearchFilters & { offset?: number } = {}) {
    return this.index.list(this.facet(filters));
  }

  neighbors(conceptId: string) {
    return this.index.neighbors(conceptId);
  }

  /** Breadth-first subgraph around a concept, out to `depth` hops. */
  graph(
    conceptId: string,
    opts: { depth?: number; maxNodes?: number } = {},
  ): Promise<{ root: string; nodes: GraphNode[]; edges: GraphEdge[] }> {
    return bfsGraph(
      conceptId,
      opts,
      (id) => this.index.neighbors(id),
      (id) => {
        const rec = this.index.get(id);
        return { id, title: rec ? rec.title : null, exists: rec !== null };
      },
    );
  }

  status() {
    const st: Record<string, unknown> = { ...this.index.status() };
    st.bundle = this.bundle;
    const files = fs.existsSync(this.bundle) ? okf.iterConceptFiles(this.bundle).length : 0;
    st.bundle_files = files;
    st.stale = files !== this.index.count();
    return st;
  }

  // ---- writes ---------------------------------------------------------------

  /** Rebuild the index from the OKF bundle on disk. */
  async reindex(): Promise<{ indexed: number; note?: string }> {
    if (!fs.existsSync(this.bundle)) {
      await this.index.reindex([]);
      return { indexed: 0, note: `bundle ${this.bundle} does not exist yet` };
    }
    return this.index.reindex(okf.loadBundle(this.bundle));
  }

  async ingestText(opts: {
    type: string;
    title?: string | null;
    description?: string | null;
    body?: string;
    tags?: string[] | null;
    id?: string | null;
    status?: string | null;
  }): Promise<{ id: string; path: string }> {
    // A concept whose file is index.md/log.md would be dropped on reindex
    // (those names are reserved), a silent, undetectable loss. Reject an
    // explicit reserved id; bump an auto-generated one (deriveConceptId).
    const cid = await deriveConceptId(opts, (id) => this.exists(id));
    const concept = writeConcept(this.bundle, cid, {
      type: opts.type,
      title: opts.title,
      description: opts.description,
      body: opts.body ?? "",
      tags: opts.tags ? normalizeTags(opts.tags, this.thesaurus()) : opts.tags,
      status: opts.status,
      // A re-ingest replaces the record: a "see" reference from a past
      // retirement does not survive it (update keeps it; ingest does not).
      extra: { supersededBy: null },
    });
    await this.index.upsert(concept);
    return { id: concept.id, path: concept.path as string };
  }

  private exists(cid: string): boolean {
    return fs.existsSync(okf.pathFor(this.bundle, cid));
  }

  /** Update an existing concept's body or metadata. Only given fields change. */
  async update(
    conceptId: string,
    opts: {
      body?: string | null;
      title?: string | null;
      description?: string | null;
      tags?: string[] | null;
      type?: string | null;
      status?: string | null;
      superseded_by?: string | null;
    },
  ): Promise<{ id: string; path: string }> {
    const filePath = okf.pathFor(this.bundle, conceptId);
    if (!fs.existsSync(filePath)) throw new Error(`concept not found: ${conceptId}`);
    const concept = okf.load(filePath, this.bundle);
    if (opts.superseded_by != null) {
      // A "see" reference: retire this concept in favor of another one; "" clears it.
      if (opts.superseded_by === "") delete concept.frontmatter.supersededBy;
      else {
        if (opts.superseded_by === conceptId) throw new Error("a concept cannot supersede itself");
        if (!this.index.get(opts.superseded_by)) {
          throw new Error(`concept not found: ${opts.superseded_by}`);
        }
        concept.frontmatter.supersededBy = opts.superseded_by;
        if (opts.status == null) concept.frontmatter.status = "deprecated";
      }
    }
    if (opts.body != null) {
      concept.body = opts.body;
      concept.links = okf.extractLinks(opts.body, concept.id);
    }
    if (opts.title != null) concept.frontmatter.title = opts.title;
    if (opts.description != null) concept.frontmatter.description = opts.description;
    if (opts.tags != null) concept.frontmatter.tags = normalizeTags(opts.tags, this.thesaurus());
    if (opts.type != null) {
      concept.frontmatter.type = opts.type;
      concept.type = opts.type;
    }
    if (opts.status != null) concept.frontmatter.status = okf.checkStatus(opts.status);
    fs.writeFileSync(filePath, okf.dump(concept), "utf8");
    await this.index.upsert(concept);
    return { id: concept.id, path: filePath };
  }

  /**
   * Rename a concept and rewrite every inbound link to point at the new id
   * (authority control: a rename must never orphan a link). Relative links in
   * the moved body are pinned to bundle-absolute targets so the move cannot
   * re-aim them.
   */
  async rename(
    oldId: string,
    newId: string,
  ): Promise<{ id: string; path: string; relinked: number }> {
    const oldPath = okf.pathFor(this.bundle, oldId);
    if (!fs.existsSync(oldPath)) throw new Error(`concept not found: ${oldId}`);
    newId = canonicalId(newId);
    const newPath = okf.pathFor(this.bundle, newId);
    if (isReservedId(newId)) {
      throw new Error(`concept id '${newId}' maps to an OKF-reserved filename`);
    }
    if (oldId === THESAURUS_ID || newId === THESAURUS_ID) {
      throw new Error("'thesaurus' is the tag vocabulary and cannot be renamed");
    }
    if (fs.existsSync(newPath)) throw new Error(`concept already exists: ${newId}`);
    newId = okf.conceptIdFor(newPath, this.bundle);
    const moved = okf.load(oldPath, this.bundle);
    const pin = new Map(moved.links.map((l) => [l, l === oldId ? newId : l] as const));
    moved.body = okf.retargetLinks(moved.body, oldId, pin).body;
    moved.id = newId;
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.writeFileSync(newPath, okf.dump(moved), "utf8");
    fs.rmSync(oldPath);
    const map = new Map([[oldId, newId]]);
    let relinked = 0;
    for (const nb of this.index.neighbors(oldId).inbound) {
      if (nb.id === oldId) continue;
      const p = okf.pathFor(this.bundle, nb.id);
      if (!fs.existsSync(p)) continue;
      const linker = okf.load(p, this.bundle);
      const res = okf.retargetLinks(linker.body, linker.id, map);
      if (res.changed > 0) {
        linker.body = res.body;
        fs.writeFileSync(p, okf.dump(linker), "utf8");
        relinked += res.changed;
      }
    }
    // "See" references follow the move too.
    for (const s of this.index.list({ limit: 100_000 })) {
      if (s.superseded_by !== oldId) continue;
      const p = okf.pathFor(this.bundle, s.id);
      if (!fs.existsSync(p)) continue;
      const c = okf.load(p, this.bundle);
      c.frontmatter.supersededBy = newId;
      fs.writeFileSync(p, okf.dump(c), "utf8");
    }
    await this.reindex();
    return { id: newId, path: newPath, relinked };
  }

  /** Delete a concept file and drop it from the index (weeding). */
  async deleteConcept(conceptId: string): Promise<{ deleted: string }> {
    const filePath = okf.pathFor(this.bundle, conceptId);
    if (!fs.existsSync(filePath)) throw new Error(`concept not found: ${conceptId}`);
    fs.rmSync(filePath);
    await this.index.remove(conceptId);
    return { deleted: conceptId };
  }

  /**
   * Revision history of a concept. Local history is Git history: the bundle
   * must live inside a Git repository, or the list is empty. `revision` is a
   * commit hash and returns that revision's frontmatter and body.
   */
  history(
    conceptId: string,
    opts: { limit?: number; revision?: string } = {},
  ): {
    id: string;
    revisions: { revision: string; at: number; by: string; message: string }[];
    snapshot?: { revision: string; frontmatter: Record<string, unknown>; body: string };
    note?: string;
  } {
    const filePath = okf.pathFor(this.bundle, conceptId);
    const gitIn = (cwd: string, args: string[]) =>
      spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 10_000 });
    const top = gitIn(path.dirname(filePath), ["rev-parse", "--show-toplevel"]);
    if (top.status !== 0) {
      return {
        id: conceptId,
        revisions: [],
        note: "the bundle is not inside a Git repository — Local history is Git history",
      };
    }
    const root = top.stdout.trim();
    const git = (args: string[]) => gitIn(root, args);
    const rel = path.relative(root, filePath).split(path.sep).join("/");
    if (opts.revision) {
      if (!/^[0-9a-f]{4,40}$/i.test(opts.revision))
        throw new Error("revision must be a commit hash");
      const show = git(["show", `${opts.revision}:${rel}`]);
      if (show.status !== 0) throw new Error(`revision not found: ${opts.revision}`);
      const c = okf.parse(show.stdout, { conceptId });
      return {
        id: conceptId,
        revisions: [],
        snapshot: { revision: opts.revision, frontmatter: c.frontmatter, body: c.body },
      };
    }
    const limit = String(opts.limit ?? 20);
    const log = git([
      "log",
      "--follow",
      `-n${limit}`,
      "--format=%H%x1f%ct%x1f%an%x1f%s",
      "--",
      rel,
    ]);
    const revisions = (log.stdout ?? "")
      .split("\n")
      .filter((l) => l.includes("\x1f"))
      .map((l) => {
        const [revision = "", ct = "0", by = "", message = ""] = l.split("\x1f");
        return { revision, at: Number(ct) * 1000, by, message };
      });
    return { id: conceptId, revisions };
  }

  /**
   * Ingest a code repository into OKF concepts (one per source file). When
   * LIBROCAT_INGEST_ROOT is set, `repoPath` must live inside that root — the
   * trust boundary for paths that arrive from an agent.
   */
  async ingestRepo(
    repoPath: string,
    opts: { prefix?: string } = {},
  ): Promise<{ ingested: number; indexed: number; note?: string }> {
    const root = process.env.LIBROCAT_INGEST_ROOT;
    if (root) {
      const rel = path.relative(path.resolve(root), path.resolve(repoPath));
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`path '${repoPath}' is outside the allowed ingest root`);
      }
    }
    const concepts = await ingestRepo(this.bundle, repoPath, opts);
    // Reindex so cross-file links resolve against the full new set.
    const stats = await this.reindex();
    return { ingested: concepts.length, ...stats };
  }
}
