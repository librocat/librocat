/**
 * Ingest files and code repositories into OKF concepts.
 *
 * Local ingestion is mechanical: no model calls, no network. It extracts
 * symbols with light regexes and writes OKF Markdown files. JavaScript and
 * TypeScript import specifiers that resolve to other ingested files become
 * cross-links. The agent that calls the MCP is the AI: it improves a
 * description with `update`. Cloud's automatic indexation lives apart, in
 * apps/web/convex/indexation.ts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildFrontmatter,
  type Concept,
  conceptIdFor,
  dump,
  normalizeSegments,
  parse,
  pathFor,
} from "./okf.ts";

// Directories and files that are never worth indexing as concepts.
export const IGNORE_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  "dist",
  "build",
  ".next",
  "target",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".librocat",
  "coverage",
  ".turbo",
  ".convex",
]);

export const LANG_BY_EXT: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".swift": "swift",
  ".kt": "kotlin",
  ".sh": "shell",
  ".sql": "sql",
};

const MAX_FILE_BYTES = 400_000;
const MAX_SYMBOLS = 60;
const EXCERPT_LINES = 40;

// Best-effort definition patterns across languages.
const DEF_RE =
  /^\s*(?:export\s+)?(?:public\s+|private\s+|static\s+|async\s+|default\s+)*(?:function|class|def|func|fn|interface|type|struct|enum)\s+([A-Za-z_]\w*)/gm;

// ES/CJS import specifiers: `import x from "..."`, `export ... from "..."`,
// `import("...")`, `require("...")`.
const IMPORT_RE =
  /(?:\bimport|\bexport)\s[^'"]*?from\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Write an OKF concept file into the bundle and return the parsed Concept. */
export function writeConcept(
  bundle: string,
  conceptId: string,
  opts: {
    type: string;
    title?: string | null;
    description?: string | null;
    body?: string;
    tags?: string[] | null;
    status?: string | null;
    extra?: Record<string, unknown>;
  },
): Concept {
  const filePath = pathFor(bundle, conceptId);
  // The id is the file's bundle-relative path: `a/../b` is `b`.
  conceptId = conceptIdFor(filePath, bundle);
  // Unknown frontmatter keys of an existing file survive the write, as in Cloud.
  let existing: Record<string, unknown> | undefined;
  if (fs.existsSync(filePath)) {
    try {
      existing = parse(fs.readFileSync(filePath, "utf8"), { conceptId }).frontmatter;
    } catch {}
  }
  const fm = buildFrontmatter(existing, opts);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const concept = parse(
    dump({ id: conceptId, type: opts.type, body: opts.body ?? "", frontmatter: fm, links: [] }),
    { conceptId, path: filePath },
  );
  fs.writeFileSync(filePath, dump(concept), "utf8");
  return concept;
}

/**
 * Walk a code repo and write one OKF concept per source file.
 *
 * `prefix` namespaces the generated concept ids (default `code/...`). Returns
 * the concepts written. JS/TS imports that resolve to other ingested files
 * become cross-links, so the graph tools work on the result.
 */
export async function ingestRepo(
  bundle: string,
  repo: string,
  opts: { prefix?: string } = {},
): Promise<Concept[]> {
  const prefix = opts.prefix ?? "code";
  const root = path.resolve(repo);
  const files = sourceFiles(root);
  const relSet = new Set(files.map((f) => toPosix(path.relative(root, f))));
  const out: Concept[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = toPosix(path.relative(root, file));
    const lang = LANG_BY_EXT[path.extname(file).toLowerCase()] ?? "text";
    const cid = `${prefix}/${rel}`;
    const symbols = extractSymbols(text);
    const links = extractImportLinks(text, rel, relSet, prefix);
    const description = `${lang} source file ${rel}`;
    const concept = writeConcept(bundle, cid, {
      type: "Code File",
      title: rel,
      description,
      body: renderBody(rel, lang, symbols, text, links),
      tags: [lang, "code"],
      extra: { resource: rel, language: lang },
    });
    out.push(concept);
  }
  return out;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) walk(p);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!(path.extname(entry.name).toLowerCase() in LANG_BY_EXT)) continue;
      try {
        if (fs.statSync(p).size > MAX_FILE_BYTES) continue;
      } catch {
        continue;
      }
      out.push(p);
    }
  };
  walk(root);
  return out;
}

function extractSymbols(text: string): string[] {
  const symbols: string[] = [];
  for (const m of text.matchAll(DEF_RE)) {
    symbols.push(m[1] as string);
    if (symbols.length >= MAX_SYMBOLS) break;
  }
  return symbols;
}

/**
 * Resolve relative JS/TS import specifiers to concept ids of other ingested
 * files. Tries the specifier as-is, with common extensions, and as a
 * directory index.
 */
function extractImportLinks(
  text: string,
  rel: string,
  relSet: Set<string>,
  prefix: string,
): string[] {
  const slash = rel.lastIndexOf("/");
  const dir = slash === -1 ? "" : rel.slice(0, slash);
  const links: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = (m[1] ?? m[2] ?? m[3]) as string | undefined;
    if (!spec?.startsWith(".")) continue;
    const base = normalizeSegments(dir ? `${dir}/${spec}` : spec);
    const candidates = [
      base,
      ...[".ts", ".tsx", ".js", ".jsx"].map((e) => base + e),
      ...[".ts", ".tsx", ".js", ".jsx"].map((e) => `${base}/index${e}`),
      base.replace(/\.js$/, ".ts"),
    ];
    for (const cand of candidates) {
      if (relSet.has(cand)) {
        const cid = `${prefix}/${cand}`;
        if (!links.includes(cid)) links.push(cid);
        break;
      }
    }
  }
  return links;
}

function renderBody(
  rel: string,
  lang: string,
  symbols: string[],
  text: string,
  links: string[],
): string {
  const lines = [`# ${rel}`, ""];
  if (symbols.length > 0) {
    lines.push("## Symbols");
    lines.push(...symbols.map((s) => `- \`${s}\``));
    lines.push("");
  }
  if (links.length > 0) {
    lines.push("## Imports");
    // Bundle-relative markdown links so the graph indexer picks them up.
    lines.push(...links.map((lid) => `- [${lid}](/${lid}.md)`));
    lines.push("");
  }
  const excerpt = text.split("\n").slice(0, EXCERPT_LINES).join("\n");
  lines.push("## Excerpt", "", `\`\`\`${lang}`, excerpt, "```", "");
  return lines.join("\n");
}
