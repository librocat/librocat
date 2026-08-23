# @librocat/server

The librocat MCP server (internal workspace package, never published).
`pnpm run build` bundles `src/main.ts` with esbuild into the
zero-dependency `dist/main.js`. The build scripts commit that bundle into
the Agent Plugin repository as `server/main.js`, and the plugin's
`mcp.json` starts it with `node ${PLUGIN_ROOT}/server/main.js`.

The npm package `librocat` is a pointer with no code (see
`packages/pointer`): its page names the one install command,
`npx plugins add librocat/librocat`.

`src/tools.ts` defines the tool table once for both tiers; librocat Cloud
imports it as `@librocat/server/tools`.

```bash
pnpm run build     # bundle dist/main.js
pnpm test          # end-to-end over stdio against the built artifact
```
