/**
 * Library-science helpers shared by both tiers (pure functions, no I/O):
 * the tag thesaurus (controlled vocabulary with broader / narrower / use-for
 * relations), query expansion over it, and finding aids (the shelf list an
 * `index.md` holds). Local and Cloud store the thesaurus as one OKF concept
 * with id `thesaurus` (type `Thesaurus`, `terms` in the frontmatter), so it
 * exports, imports, and versions like any other concept.
 */

export const THESAURUS_ID = "thesaurus";
export const THESAURUS_TYPE = "Thesaurus";

/** The catalog record of the thesaurus concept, the same in both tiers. */
export const THESAURUS_CONCEPT = {
  type: THESAURUS_TYPE,
  title: "Tag thesaurus",
  description:
    "The controlled vocabulary of this library: preferred tags with broader, narrower, and use-for relations.",
  body:
    "Edit with the `thesaurus` tool. Writes map use-for synonyms onto the preferred tag; " +
    "`search` expands a preferred tag with its narrower terms.\n",
} as const;

/** SKOS-shaped relations for one preferred tag. */
export interface Term {
  broader?: string[];
  narrower?: string[];
  /** Non-preferred synonyms that map onto this tag ("use for"). */
  use_for?: string[];
}

export type Thesaurus = Record<string, Term>;

const clean = (xs: unknown): string[] =>
  Array.isArray(xs)
    ? [...new Set(xs.map((x) => String(x).trim().toLowerCase()).filter((x) => x.length > 0))]
    : [];

/** Read the thesaurus out of the concept's frontmatter (lenient: unknown shapes are ignored). */
export function thesaurusFrom(frontmatter: Record<string, unknown> | null | undefined): Thesaurus {
  const raw = frontmatter?.terms;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Thesaurus = {};
  for (const [tag, rel] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof rel !== "object" || rel === null) continue;
    const r = rel as Record<string, unknown>;
    const term: Term = {};
    const b = clean(r.broader);
    const n = clean(r.narrower);
    const u = clean(r.use_for);
    if (b.length) term.broader = b;
    if (n.length) term.narrower = n;
    if (u.length) term.use_for = u;
    out[tag.trim().toLowerCase()] = term;
  }
  return out;
}

/**
 * Return a copy of `th` with `tag` set (or removed when `term` is null). An
 * omitted relation keeps its current value; `[]` clears it. Authority
 * control: a term is either preferred or a synonym of exactly one preferred
 * term, never both.
 */
export function withTerm(th: Thesaurus, tag: string, term: Term | null): Thesaurus {
  const key = tag.trim().toLowerCase();
  if (!key) throw new Error("tag must not be empty");
  const next: Thesaurus = { ...th };
  if (term === null) {
    delete next[key];
    return next;
  }
  const prev = th[key] ?? {};
  const t: Term = {};
  const b = clean(term.broader ?? prev.broader);
  const n = clean(term.narrower ?? prev.narrower);
  const u = clean(term.use_for ?? prev.use_for).filter((x) => x !== key);
  for (const [other, rel] of Object.entries(th)) {
    if (other === key) continue;
    if ((rel.use_for ?? []).includes(key)) {
      throw new Error(`'${key}' is a use_for synonym of '${other}'; remove it there first`);
    }
    const clash = u.find((x) => x === other || (rel.use_for ?? []).includes(x));
    if (clash) throw new Error(`'${clash}' is already a preferred tag or a use_for of '${other}'`);
  }
  if (b.length) t.broader = b;
  if (n.length) t.narrower = n;
  if (u.length) t.use_for = u;
  next[key] = t;
  return next;
}

/** Map non-preferred synonyms onto their preferred tag; drop duplicates, keep order. */
export function normalizeTags(tags: string[], th: Thesaurus): string[] {
  const preferred = new Map<string, string>();
  for (const [tag, term] of Object.entries(th))
    for (const u of term.use_for ?? []) preferred.set(u, tag);
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    // A preferred tag in any case lands on its thesaurus spelling; a synonym
    // lands on its preferred tag; anything else passes through as written.
    const mapped = Object.hasOwn(th, key) ? key : (preferred.get(key) ?? t);
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

/**
 * Expand a query with the thesaurus: a synonym adds its preferred tag, a
 * preferred tag adds its narrower terms (one level). Returns the original
 * query when nothing applies, so ranking is unchanged for ordinary queries.
 */
export function expandQuery(query: string, th: Thesaurus): string {
  if (Object.keys(th).length === 0) return query;
  const tokens = query.split(/\s+/).filter((t) => t.length > 0);
  const extra: string[] = [];
  const add = (w: string) => {
    if (!tokens.some((t) => t.toLowerCase() === w) && !extra.includes(w)) extra.push(w);
  };
  for (const raw of tokens) {
    const t = raw.toLowerCase();
    const term = th[t];
    if (term) for (const n of term.narrower ?? []) add(n);
    for (const [tag, rel] of Object.entries(th)) if ((rel.use_for ?? []).includes(t)) add(tag);
  }
  // Prepend: Convex prefix-matches only the last term, so the reader's last
  // (possibly partial) word must stay last.
  return extra.length ? `${extra.join(" ")} ${query}` : query;
}

/** One catalog line for a finding aid. */
export interface AidEntry {
  id: string;
  title: string | null;
  description: string | null;
  type: string;
  status: string;
}

/**
 * Finding aids: one Markdown listing per directory of the bundle (the shelf
 * list OKF's reserved `index.md` is for). Root entries land in the "" aid.
 */
export function renderFindingAids(entries: AidEntry[]): { dir: string; markdown: string }[] {
  const byDir = new Map<string, AidEntry[]>();
  const dirs = new Set<string>([""]);
  for (const e of entries) {
    if (e.id === THESAURUS_ID) continue;
    const slash = e.id.lastIndexOf("/");
    const dir = slash === -1 ? "" : e.id.slice(0, slash);
    const list = byDir.get(dir) ?? [];
    list.push(e);
    byDir.set(dir, list);
    // Every ancestor gets an aid too, so each directory is reachable from the root.
    const parts = dir.split("/").filter((p) => p.length > 0);
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  if (entries.filter((e) => e.id !== THESAURUS_ID).length === 0) return [];
  const all = [...dirs].sort();
  const parentOf = (d: string) => (d.includes("/") ? d.slice(0, d.lastIndexOf("/")) : "");
  return all.map((dir) => {
    const items = (byDir.get(dir) ?? []).sort((a, b) => (a.id < b.id ? -1 : 1));
    const subdirs = all.filter((d) => d !== "" && parentOf(d) === dir);
    const lines = [
      `# ${dir || "Collection"}`,
      "",
      `${items.length} concept${items.length === 1 ? "" : "s"} here` +
        (subdirs.length
          ? `, ${subdirs.length} shelf${subdirs.length === 1 ? "" : "s"} below.`
          : "."),
      "",
    ];
    for (const sub of subdirs)
      lines.push(`- [${sub.slice(dir ? dir.length + 1 : 0)}/](/${sub}/index.md)`);
    if (subdirs.length) lines.push("");
    for (const e of items) {
      const name = e.title?.trim() || e.id.slice(e.id.lastIndexOf("/") + 1);
      const flag = e.status === "stable" ? "" : ` _(${e.status})_`;
      const desc = e.description?.trim() ? ` — ${e.description.trim()}` : "";
      lines.push(`- [${name}](/${e.id}.md) \`${e.type}\`${flag}${desc}`);
    }
    return { dir, markdown: `${lines.join("\n")}\n` };
  });
}

/**
 * A shelf is the leading directory of a concept id: one library, many
 * shelves, and a project scopes its reads to its own shelf ("acme" or
 * "acme/") and falls back to the whole library when the shelf is empty.
 * "acme", "acme/", "/acme/" all mean the shelf "acme/".
 */
export function shelfPrefix(shelf: string): string {
  const s = shelf.replace(/^\/+/, "").replace(/\/+$/, "");
  return s ? `${s}/` : "";
}
