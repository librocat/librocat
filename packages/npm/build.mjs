// Copies the built server bundle from @librocat/server into this package's
// publish payload. Run by `pnpm --filter librocat run build` (turbo orders
// @librocat/server's own build first via the workspace devDependency).
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname);
const src = path.join(root, "..", "mcp", "dist", "main.js");
const dest = path.join(root, "server", "main.js");

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`copied ${path.relative(process.cwd(), src)} -> ${path.relative(process.cwd(), dest)}`);
