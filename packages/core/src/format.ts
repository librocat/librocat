/**
 * The pure half of the core: OKF text, concept ids, links, snippets,
 * statuses, and the library-science algorithms that touch no storage.
 *
 * No `node:*` import and no Orama here. The Convex runtime (Cloud) imports
 * this module as `@librocat/core/format`, so both tiers run one
 * implementation: Local wraps it around files and an in-memory index, Cloud
 * around Convex rows. `okf.ts` re-exports everything here next to the
 * filesystem functions.
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { shelfPrefix, THESAURUS_ID } from "./library.ts";

// ---- OKF text ----------------------------------------------------------------

// Files that OKF reserves for directory listings and update logs. They are not
// concepts and the index skips them.
export const RESERVED_NAMES = new Set(["index.md", "log.md"]);

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
// Markdown inline links: [text](target). Reference and footnote links are
// ignored on purpose; only inline links point at other concepts in practice.
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Thrown when a file is not a valid OKF concept. */
export class OKFError extends Error {}

/** One OKF concept, parsed from a Markdown file. */
export interface Concept {
  id: string;
  type: string;
  body: string;
  frontmatter: Record<string, unknown>;
  path?: string;
  links: string[];
}

// Recommended fields, read out of frontmatter for convenient indexing.
export function titleOf(c: Concept): string | null {
  const t = c.frontmatter.title;
  return t == null ? null : String(t);
}

export function descriptionOf(c: Concept): string | null {
  const d = c.frontmatter.description;
  return d == null ? null : String(d);
}

export function resourceOf(c: Concept): string | null {
  const r = c.frontmatter.resource;
  return r == null ? null : String(r);
}

export function tagsOf(c: Concept): string[] {
  const raw = c.frontmatter.tags;
  if (raw == null) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

export function statusOf(c: Concept): string {
  const s = c.frontmatter.status;
  return s ? String(s) : "stable";
}

/** The OKF lifecycle statuses. A concept with none is `stable`. */
export const STATUSES = ["draft", "stable", "deprecated"] as const;
export type Status = (typeof STATUSES)[number];

/** Return `status` if it is a valid lifecycle status; throw otherwise. */
export function checkStatus(status: string): Status {
  if ((STATUSES as readonly string[]).includes(status)) return status as Status;
  throw new OKFError(`invalid status '${status}': expected one of ${STATUSES.join(", ")}`);
}

/** Parse OKF text into a Concept. Throws OKFError if invalid. */
export function parse(text: string, opts: { conceptId: string; path?: string }): Concept {
  const { conceptId, path: filePath } = opts;
  const match = FRONTMATTER_RE.exec(text.replace(/^\uFEFF/, ""));
  if (!match) throw new OKFError(`${conceptId}: missing YAML frontmatter block`);
  let fm: unknown;
  try {
    fm = parseYaml(match[1] as string) ?? {};
  } catch (exc) {
    throw new OKFError(`${conceptId}: invalid YAML frontmatter: ${exc}`);
  }
  if (typeof fm !== "object" || fm === null || Array.isArray(fm)) {
    throw new OKFError(`${conceptId}: frontmatter must be a mapping`);
  }
  const frontmatter = fm as Record<string, unknown>;
  const ctype = frontmatter.type;
  if (ctype == null || String(ctype).trim() === "") {
    throw new OKFError(`${conceptId}: frontmatter is missing a non-empty 'type'`);
  }
  const body = match[2] as string;
  return {
    id: conceptId,
    type: String(ctype),
    body,
    frontmatter,
    path: filePath,
    links: extractLinks(body, conceptId),
  };
}

/** Serialize a Concept back to OKF text (frontmatter + body). */
export function dump(concept: Concept): string {
  const fm: Record<string, unknown> = { ...concept.frontmatter };
  if (!("type" in fm)) fm.type = concept.type;
  const yamlText = stringifyYaml(fm).trimEnd();
  // One newline after the closing `---`, which parse() consumes exactly, so
  // dump(parse(x)) is body-stable (no drifting blank line on re-save).
  return `---\n${yamlText}\n---\n${concept.body}`;
}

/** The frontmatter keys every write rebuilds; any other key survives a write. */
export const STANDARD_KEYS = new Set(["type", "title", "description", "tags", "status"]);

/**
 * The frontmatter of a concept after a write: the standard keys rebuilt from
 * `args`, the unknown keys of `existing` kept, `extra` keys set (a null value
 * deletes the key). `stable` is the default status and is not written.
 */
export function buildFrontmatter(
  existing: Record<string, unknown> | null | undefined,
  args: {
    type: string;
    title?: string | null;
    description?: string | null;
    tags?: string[] | null;
    status?: string | null;
    extra?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const kept = Object.fromEntries(
    Object.entries(existing ?? {}).filter(([k]) => !STANDARD_KEYS.has(k)),
  );
  const fm: Record<string, unknown> = { ...kept, type: args.type };
  if (args.title) fm.title = args.title;
  if (args.description) fm.description = args.description;
  if (args.tags && args.tags.length > 0) fm.tags = [...args.tags];
  const status = args.status ? checkStatus(args.status) : "stable";
  if (status !== "stable") fm.status = status;
  for (const [k, v] of Object.entries(args.extra ?? {})) {
    if (v === undefined || v === null) delete fm[k];
    else fm[k] = v;
  }
  return fm;
}

// ---- ids ------------------------------------------------------------------------

/** The last path segment of a concept id. */
export function lastSegment(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

/** True when the id's file name is one OKF reserves (`index.md`, `log.md`). */
export function isReservedId(id: string): boolean {
  return RESERVED_NAMES.has(`${lastSegment(id)}.md`);
}

/**
 * Collapse `.`/`..` segments in a relative posix path lexically. Lenient: a
 * `..` above the root is dropped. For link targets, never for ids.
 */
export function normalizeSegments(p: string): string {
  const parts: string[] = [];
  for (const part of p.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

/**
 * The canonical form of a concept id that arrived from a tool: `a/../b` is
 * `b`, a leading `/` is bundle-relative. An id that escapes the bundle or is
 * empty raises OKFError, so untrusted ids cannot reach outside it.
 */
export function canonicalId(id: string): string {
  const parts: string[] = [];
  for (const part of id.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (parts.length === 0) throw new OKFError(`concept id escapes the bundle: ${id}`);
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  if (parts.length === 0) throw new OKFError("concept id must not be empty");
  return parts.join("/");
}

export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "concept";
}

type Maybe<T> = T | Promise<T>;

/**
 * The id a new concept gets: the explicit id (canonical; `thesaurus` and the
 * reserved names are refused), or a slug of the title (else the body, else
 * the type) bumped with `-2`, `-3`, ... while `exists` says it is taken. A
 * reserved auto id is bumped too, so a concept can never land on a file the
 * loader skips.
 */
export async function deriveConceptId(
  opts: { id?: string | null; title?: string | null; body?: string | null; type: string },
  exists: (id: string) => Maybe<boolean>,
): Promise<string> {
  const body = opts.body ?? "";
  let cid = canonicalId(opts.id ?? slugify(opts.title ?? (body ? body.slice(0, 40) : opts.type)));
  if (opts.id) {
    if (cid === THESAURUS_ID) {
      throw new Error("'thesaurus' is the tag vocabulary; edit it with the `thesaurus` tool");
    }
    if (isReservedId(cid)) {
      throw new Error(
        `concept id '${cid}' maps to the OKF-reserved filename '${lastSegment(cid)}.md'`,
      );
    }
    return cid;
  }
  if (isReservedId(cid) || cid === THESAURUS_ID || (await exists(cid))) {
    let n = 2;
    while (await exists(`${cid}-${n}`)) n += 1;
    cid = `${cid}-${n}`;
  }
  return cid;
}

// ---- links ----------------------------------------------------------------------

/** Resolve one inline link target to a concept id, or null when it is not a concept link. */
function linkTarget(target: string, srcDir: string): string | null {
  const t = (target.split("#", 1)[0] as string).trim();
  if (!t || t.includes("://") || t.startsWith("mailto:") || !t.endsWith(".md")) return null;
  const raw = t.startsWith("/") ? t.replace(/^\/+/, "") : srcDir ? `${srcDir}/${t}` : t;
  return normalizeSegments(raw).replace(/\.md$/, "") || null;
}

/**
 * Return the concept ids that `body` links to, in order, de-duplicated.
 *
 * A link target counts as a concept link when it resolves to a `.md` file.
 * A leading `/` means bundle-relative; otherwise the target resolves relative
 * to the source concept's directory. External URLs and anchors are ignored.
 */
export function extractLinks(body: string, sourceId: string): string[] {
  const slash = sourceId.lastIndexOf("/");
  const srcDir = slash === -1 ? "" : sourceId.slice(0, slash);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(LINK_RE)) {
    const cid = linkTarget(m[1] as string, srcDir);
    if (cid && !seen.has(cid)) {
      seen.add(cid);
      out.push(cid);
    }
  }
  return out;
}

/**
 * Rewrite inline links whose resolved concept id is a key of `map` to a
 * bundle-absolute `/newId.md` target. Anchors are preserved. Returns the new
 * body and the number of links changed. Used by `rename` (authority control:
 * a rename must never orphan an inbound link).
 */
export function retargetLinks(
  body: string,
  sourceId: string,
  map: Map<string, string>,
): { body: string; changed: number } {
  const slash = sourceId.lastIndexOf("/");
  const srcDir = slash === -1 ? "" : sourceId.slice(0, slash);
  let changed = 0;
  const out = body.replace(LINK_RE, (full, target: string) => {
    const cid = linkTarget(target, srcDir);
    const next = cid ? map.get(cid) : undefined;
    if (!next) return full;
    changed += 1;
    const hashAt = target.indexOf("#");
    const anchor = hashAt === -1 ? "" : target.slice(hashAt);
    return full.replace(target, `/${next}.md${anchor}`);
  });
  return { body: out, changed };
}

// ---- shapes both tiers return -----------------------------------------------------

/** Concept metadata, the shape `search` and `list` return. */
export interface ConceptSummary {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  resource: string | null;
  tags: string[];
  status: string;
  /** "See" reference: the concept that replaced this one (deprecated concepts). */
  superseded_by: string | null;
  /** The file path in Local; null in Cloud. */
  path: string | null;
}

export interface ConceptRecord extends ConceptSummary {
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface SearchHit extends ConceptSummary {
  snippet: string;
  /** The ranking score in Local (Orama); absent in Cloud (Convex ranks). */
  score?: number;
}

export interface Neighbor {
  id: string;
  title: string | null;
  exists: boolean;
}

export interface SearchFilters {
  type?: string | null;
  tag?: string | null;
  status?: string | null;
  /**
   * A shelf: the leading directory of the concept id ("acme" or "acme/").
   * One library, many shelves: a project scopes its reads to its own shelf
   * and falls back to the whole library when the shelf is empty.
   */
  shelf?: string | null;
  limit?: number;
}

export interface GraphNode {
  id: string;
  title: string | null;
  exists: boolean;
}

export interface GraphEdge {
  src: string;
  dst: string;
}

export interface WeedReport {
  days: number;
  /** Totals before `limit` truncates the lists. */
  counts: {
    deprecated: number;
    broken_links: number;
    orphans: number;
    no_description: number;
    no_tags: number;
    never_retrieved: number | null;
  };
  deprecated: string[];
  broken_links: { id: string; missing: string[] }[];
  orphans: string[];
  no_description: string[];
  no_tags: string[];
  /** Cloud only (circulation): concepts never retrieved, or not in `days` days. Null in Local. */
  never_retrieved: string[] | null;
  /** Cloud only: top concepts by retrievals. Null in Local. */
  most_retrieved: { id: string; retrievals: number }[] | null;
  note?: string;
}

// ---- algorithms both tiers run ------------------------------------------------------

/** The fields `matchesFilters` reads: a summary in Local, a Convex row in Cloud. */
export interface FilterRow {
  id: string;
  type: string;
  status: string;
  tags: string[];
}

/** The `list` and `search` filter predicate (type, status, tag, shelf). */
export function matchesFilters(row: FilterRow, f: SearchFilters): boolean {
  if (f.type && row.type !== f.type) return false;
  if (f.status && row.status !== f.status) return false;
  if (f.tag && !row.tags.includes(f.tag)) return false;
  if (f.shelf) {
    const p = shelfPrefix(f.shelf);
    if (p && !row.id.startsWith(p)) return false;
  }
  return true;
}

/**
 * A short body excerpt around the first query match, with matched words in
 * `[brackets]` and ` … ` at truncated edges. One snippet format in both tiers.
 */
export function makeSnippet(text: string, query: string, width = 12): string {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const isMatch = (word: string): boolean => {
    const lower = word.toLowerCase();
    return tokens.some((t) => lower.startsWith(t) || lower.includes(t));
  };
  let at = words.findIndex(isMatch);
  if (at === -1) at = 0;
  const start = Math.max(0, at - Math.floor(width / 2));
  const end = Math.min(words.length, start + width);
  const window = words.slice(start, end).map((w) => (isMatch(w) ? `[${w}]` : w));
  const head = start > 0 ? " … " : "";
  const tail = end < words.length ? " … " : "";
  return `${head}${window.join(" ")}${tail}`.trim();
}

/** Stable partition: non-deprecated hits first, deprecated after, order kept. */
export function demoteDeprecated<T extends { status: string }>(hits: T[]): T[] {
  return [
    ...hits.filter((h) => h.status !== "deprecated"),
    ...hits.filter((h) => h.status === "deprecated"),
  ];
}

/** The fields the weeding rules read. */
export interface WeedRow {
  id: string;
  status: string;
  links: string[];
  description: string | null;
  tags: string[];
}

/**
 * The mechanical CREW/MUSTIE rules: deprecated, broken links, orphans (no
 * inbound link), no description, no tags. The thesaurus is skipped, ids are
 * sorted, counts are taken before `limit` cuts each list. Circulation (never
 * retrieved, most retrieved) is Cloud-only and added by the caller.
 */
export function weedRules(rows: WeedRow[], limit = 50) {
  const ids = new Set(rows.map((r) => r.id));
  const inbound = new Set<string>();
  for (const r of rows) for (const l of r.links) inbound.add(l);
  const deprecated: string[] = [];
  const broken: { id: string; missing: string[] }[] = [];
  const orphans: string[] = [];
  const noDesc: string[] = [];
  const noTags: string[] = [];
  for (const r of [...rows].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (r.id === THESAURUS_ID) continue;
    if (r.status === "deprecated") deprecated.push(r.id);
    const missing = r.links.filter((l) => !ids.has(l));
    if (missing.length) broken.push({ id: r.id, missing });
    if (!inbound.has(r.id)) orphans.push(r.id);
    if (!r.description?.trim()) noDesc.push(r.id);
    if (r.tags.length === 0) noTags.push(r.id);
  }
  return {
    counts: {
      deprecated: deprecated.length,
      broken_links: broken.length,
      orphans: orphans.length,
      no_description: noDesc.length,
      no_tags: noTags.length,
    },
    deprecated: deprecated.slice(0, limit),
    broken_links: broken.slice(0, limit),
    orphans: orphans.slice(0, limit),
    no_description: noDesc.slice(0, limit),
    no_tags: noTags.slice(0, limit),
  };
}

/** The fields `libraryStats` reads. */
export interface StatsRow {
  id: string;
  type: string;
  tags: string[];
  links: string[];
}

/**
 * The `status` counts: concepts, the live type and tag vocabulary (top 100
 * each, so agents reuse existing types and tags instead of guessing), links,
 * and broken links.
 */
export function libraryStats(rows: StatsRow[]) {
  const ids = new Set(rows.map((r) => r.id));
  const byType = new Map<string, number>();
  const byTag = new Map<string, number>();
  let links = 0;
  let broken = 0;
  for (const r of rows) {
    byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    for (const t of r.tags) byTag.set(t, (byTag.get(t) ?? 0) + 1);
    links += r.links.length;
    for (const dst of r.links) if (!ids.has(dst)) broken += 1;
  }
  const desc = (m: Map<string, number>) =>
    Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100));
  return {
    concepts: rows.length,
    by_type: desc(byType),
    by_tag: desc(byTag),
    links,
    broken_links: broken,
  };
}

/**
 * Breadth-first subgraph around `root`, out to `depth` hops and at most
 * `maxNodes` nodes. Edges to nodes that were not admitted are dropped, so
 * every edge endpoint resolves to a node in the result.
 */
export async function bfsGraph(
  root: string,
  opts: { depth?: number; maxNodes?: number },
  neighborsOf: (id: string) => Maybe<{ outbound: { id: string }[]; inbound: { id: string }[] }>,
  nodeFor: (id: string) => Maybe<GraphNode>,
): Promise<{ root: string; nodes: GraphNode[]; edges: GraphEdge[] }> {
  const depth = opts.depth ?? 1;
  const maxNodes = opts.maxNodes ?? 50;
  const seen = new Set([root]);
  let frontier = [root];
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  for (let hop = 0; hop < Math.max(depth, 1); hop++) {
    const next: string[] = [];
    for (const nid of frontier) {
      nodes.set(nid, await nodeFor(nid));
      const nb = await neighborsOf(nid);
      for (const o of nb.outbound) {
        edges.set(`${nid}→${o.id}`, { src: nid, dst: o.id });
        if (!seen.has(o.id) && seen.size < maxNodes) {
          seen.add(o.id);
          next.push(o.id);
        }
      }
      for (const i of nb.inbound) {
        edges.set(`${i.id}→${nid}`, { src: i.id, dst: nid });
        if (!seen.has(i.id) && seen.size < maxNodes) {
          seen.add(i.id);
          next.push(i.id);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  for (const nid of seen) if (!nodes.has(nid)) nodes.set(nid, await nodeFor(nid));
  const kept = [...edges.values()].filter((e) => nodes.has(e.src) && nodes.has(e.dst));
  return { root, nodes: [...nodes.values()], edges: kept };
}
