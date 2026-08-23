/**
 * The derived index over an OKF bundle.
 *
 * The index lives in memory and is rebuilt from the OKF files at launch; OKF
 * stays the source of truth. Search runs on Orama (pure TypeScript, bm25).
 * There is no database: at local scale a rebuild takes milliseconds, so
 * persisting the index buys nothing.
 */

import { create, insert, remove as oramaRemove, search as oramaSearch } from "@orama/orama";
import {
  type Concept,
  type ConceptRecord,
  type ConceptSummary,
  demoteDeprecated,
  descriptionOf,
  libraryStats,
  makeSnippet,
  matchesFilters,
  type Neighbor,
  resourceOf,
  type SearchFilters,
  type SearchHit,
  statusOf,
  tagsOf,
  titleOf,
  type WeedReport,
  weedRules,
} from "./format.ts";

const SCHEMA = {
  title: "string",
  description: "string",
  body: "string",
  tags: "string",
  type: "string",
} as const;

function newDb() {
  return create({ schema: SCHEMA });
}

type Db = Awaited<ReturnType<typeof newDb>>;

function summaryOf(c: Concept): ConceptSummary {
  return {
    id: c.id,
    type: c.type,
    title: titleOf(c),
    description: descriptionOf(c),
    resource: resourceOf(c),
    tags: tagsOf(c),
    status: statusOf(c),
    superseded_by: c.frontmatter.supersededBy == null ? null : String(c.frontmatter.supersededBy),
    path: c.path ?? null,
  };
}

/** In-memory index: a concept map, a link graph, and an Orama search index. */
export class MemoryIndex {
  private concepts = new Map<string, Concept>();
  private db!: Db;

  static async build(concepts: Concept[] = []): Promise<MemoryIndex> {
    const ix = new MemoryIndex();
    await ix.reindex(concepts);
    return ix;
  }

  // ---- writes ---------------------------------------------------------------

  async reindex(concepts: Concept[]): Promise<{ indexed: number }> {
    this.db = await newDb();
    this.concepts.clear();
    for (const c of concepts) await this.insertOne(c);
    return { indexed: concepts.length };
  }

  async upsert(concept: Concept): Promise<void> {
    if (this.concepts.has(concept.id)) await oramaRemove(this.db, concept.id);
    await this.insertOne(concept);
  }

  async remove(conceptId: string): Promise<boolean> {
    if (!this.concepts.delete(conceptId)) return false;
    await oramaRemove(this.db, conceptId);
    return true;
  }

  private async insertOne(c: Concept): Promise<void> {
    this.concepts.set(c.id, c);
    await insert(this.db, {
      id: c.id,
      title: titleOf(c) ?? "",
      description: descriptionOf(c) ?? "",
      body: c.body,
      tags: tagsOf(c).join(" "),
      type: c.type,
    });
  }

  // ---- reads ----------------------------------------------------------------

  get(conceptId: string): ConceptRecord | null {
    const c = this.concepts.get(conceptId);
    if (!c) return null;
    return { ...summaryOf(c), frontmatter: c.frontmatter, body: c.body };
  }

  /**
   * `term` is what the index matches (the thesaurus-expanded query); `query`
   * is what the reader typed and what the snippet highlights.
   */
  async search(query: string, filters: SearchFilters = {}, term = query): Promise<SearchHit[]> {
    const limit = filters.limit ?? 20;
    if (query.trim() === "") return [];
    // Over-fetch so deprecated hits sink below live ones instead of filling
    // a small page; stop once `limit` live hits are in hand.
    const res = await oramaSearch(this.db, { term, limit: 1000 });
    const out: SearchHit[] = [];
    let live = 0;
    for (const hit of res.hits) {
      const c = this.concepts.get(String(hit.id));
      if (!c || !matchesFilters(summaryOf(c), filters)) continue;
      const source = c.body || descriptionOf(c) || titleOf(c) || "";
      out.push({
        ...summaryOf(c),
        snippet: makeSnippet(source, query),
        score: hit.score,
      });
      if (statusOf(c) !== "deprecated") live += 1;
      if ((filters.status ? out.length : live) >= limit) break;
    }
    // Weeding in the ranking: retired knowledge sinks below live knowledge
    // unless the caller asked for a status explicitly.
    return filters.status ? out : demoteDeprecated(out).slice(0, limit);
  }

  list(filters: SearchFilters & { offset?: number } = {}): ConceptSummary[] {
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    const all = [...this.concepts.values()]
      .filter((c) => matchesFilters(summaryOf(c), filters))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return all.slice(offset, offset + limit).map(summaryOf);
  }

  neighbors(conceptId: string): { id: string; outbound: Neighbor[]; inbound: Neighbor[] } {
    const c = this.concepts.get(conceptId);
    const outbound = [...(c?.links ?? [])].sort();
    const inbound = [...this.concepts.values()]
      .filter((other) => other.links.includes(conceptId))
      .map((other) => other.id)
      .sort();
    const resolve = (id: string): Neighbor => {
      const target = this.concepts.get(id);
      return { id, title: target ? titleOf(target) : null, exists: Boolean(target) };
    };
    return { id: conceptId, outbound: outbound.map(resolve), inbound: inbound.map(resolve) };
  }

  count(): number {
    return this.concepts.size;
  }

  /**
   * The CREW/MUSTIE weeding report, mechanically: what a librarian would pull
   * for review. Local has no circulation, so `never_retrieved` is null.
   */
  weedReport(opts: { limit?: number; days?: number } = {}): WeedReport {
    const rows = [...this.concepts.values()].map((c) => ({
      id: c.id,
      status: statusOf(c),
      links: c.links,
      description: descriptionOf(c),
      tags: tagsOf(c),
    }));
    const w = weedRules(rows, opts.limit ?? 50);
    return {
      days: opts.days ?? 90,
      ...w,
      counts: { ...w.counts, never_retrieved: null },
      never_retrieved: null,
      most_retrieved: null,
      note: "Local records no circulation; never_retrieved and most_retrieved are Cloud-only.",
    };
  }

  status() {
    const rows = [...this.concepts.values()].map((c) => ({
      id: c.id,
      type: c.type,
      tags: tagsOf(c),
      links: c.links,
    }));
    return { backend: "orama", ...libraryStats(rows) };
  }
}
