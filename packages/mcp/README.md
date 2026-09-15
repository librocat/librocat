# @librocat/server

The librocat MCP server (internal workspace package, never published).
`pnpm run build` bundles `src/main.ts` with esbuild into the
zero-dependency `dist/main.js`. The build scripts commit that bundle into
the Agent Plugin repository as `server/main.js`, and the plugin's
`mcp.json` starts it with `node ${PLUGIN_ROOT}/server/main.js`.

The npm package `librocat` (see `packages/npm`) ships this bundle directly —
`npx -y librocat` runs the server standalone, the fallback for agents that
support Agent Skills and MCP but not Agent Plugins yet. The recommended
install stays `npx plugins add librocat/librocat` (MCP + skills together).

`src/tools.ts` defines the tool table once for both tiers; librocat Cloud
imports it as `@librocat/server/tools`.

```bash
pnpm run build     # bundle dist/main.js
pnpm test          # end-to-end over stdio against the built artifact
```
