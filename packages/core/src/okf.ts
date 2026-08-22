/**
 * Open Knowledge Format (OKF v0.2) read/write, the filesystem half.
 *
 * An OKF concept is a UTF-8 Markdown file: a YAML frontmatter block delimited
 * by `---`, then a Markdown body. The only required frontmatter field is
 * `type`. A bundle is a directory of concept files. The concept id is the
 * file path inside the bundle, without the `.md` suffix (for example
 * `tables/customers`).
 *
 * The text format, ids, links, and statuses live in `format.ts` (pure, shared
 * with Cloud) and are re-exported here. This file adds what needs a disk.
 *
 * Spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type Concept, OKFError, parse, RESERVED_NAMES } from "./format.ts";

export * from "./format.ts";

/** The concept id for a file: its bundle-relative path minus the .md suffix. */
export function conceptIdFor(filePath: string, bundle: string): string {
  const rel = path.relative(path.resolve(bundle), path.resolve(filePath));
  return rel.split(path.sep).join("/").replace(/\.md$/, "");
}

/**
 * The file path for a concept id: append `.md`, never replace an extension.
 *
 * Appending keeps ids that contain dots round-trip exact. For example
 * `code/index.py` maps to `code/index.py.md`, and `conceptIdFor` strips only
 * the trailing `.md` to recover `code/index.py`. This also keeps a source file
 * named `index.py` from colliding with OKF's reserved `index.md`.
 *
 * The id must stay inside the bundle. An id that escapes it (`../x`, an
 * absolute path) raises OKFError, so untrusted ids from MCP tools cannot read
 * or write files outside the bundle.
 */
export function pathFor(bundle: string, conceptId: string): string {
  const root = path.resolve(bundle);
  const p = path.resolve(root, `${conceptId}.md`);
  const rel = path.relative(root, p);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new OKFError(`concept id escapes the bundle: ${conceptId}`);
  }
  return p;
}

/** Load a concept file from disk. */
export function load(filePath: string, bundle: string): Concept {
  const cid = conceptIdFor(filePath, bundle);
  return parse(fs.readFileSync(filePath, "utf8"), { conceptId: cid, path: filePath });
}

/** Paths of concept files in a bundle, sorted, skipping reserved names. */
export function iterConceptFiles(bundle: string): string[] {
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
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && entry.name.endsWith(".md") && !RESERVED_NAMES.has(entry.name)) {
        out.push(p);
      }
    }
  };
  walk(bundle);
  return out;
}

/**
 * Load every valid concept in a bundle. Invalid files are skipped.
 *
 * OKF requires consumers to be lenient, so a file that fails to parse or read
 * is dropped rather than aborting the whole load.
 */
export function loadBundle(bundle: string): Concept[] {
  const concepts: Concept[] = [];
  for (const p of iterConceptFiles(bundle)) {
    try {
      concepts.push(load(p, bundle));
    } catch {}
  }
  return concepts;
}
