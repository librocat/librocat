/**
 * Assemble the distributable Agent Plugin (Agent Plugins Standard):
 *   dist/plugin/            plugin.json + mcp.json + skills/
 *   dist/librocat-plugin.zip  the same, zipped for release attachment
 *
 * Run with: pnpm run plugin
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist", "plugin");
const zip = path.join(root, "dist", "librocat-plugin.zip");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of ["plugin.json", "mcp.json"]) {
  fs.copyFileSync(path.join(root, "plugin", file), path.join(out, file));
}
// Dotted mirrors, so the plugins CLI (open-plugin form) can install the
// unzipped download directly: `npx plugins add ./librocat-plugin`.
fs.mkdirSync(path.join(out, ".plugin"), { recursive: true });
fs.copyFileSync(path.join(root, "plugin", "plugin.json"), path.join(out, ".plugin", "plugin.json"));
fs.copyFileSync(path.join(root, "plugin", "mcp.json"), path.join(out, ".mcp.json"));
fs.cpSync(path.join(root, "skills"), path.join(out, "skills"), {
  recursive: true,
  filter: (src) => path.basename(src) !== "README.md",
});

fs.rmSync(zip, { force: true });
const res = spawnSync("zip", ["-r", "-q", zip, "."], { cwd: out, stdio: "inherit" });
if (res.status !== 0) {
  console.error("zip failed — is the `zip` tool installed? dist/plugin/ is still complete.");
  process.exit(1);
}
console.log(`built ${path.relative(root, out)}/ and ${path.relative(root, zip)}`);
