# Changelog

All notable changes to librocat. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version can
change a tool argument. A patch version never does.

## [Unreleased]

## [0.1.2] - 2026-08-22

### Changed

- The plugin is self-contained: the built MCP server ships in the
  repository as `server/main.js`, and `mcp.json` starts it with
  `node ${PLUGIN_ROOT}/server/main.js`. Installing the plugin downloads
  nothing from npm.
- The npm package `librocat` is now a pointer with no code and no
  executable. Its page says the one real install command:
  `npx plugins add librocat/librocat`. The pointer version is frozen at
  1.0.0 and never tracks plugin versions. The server package is internal
  (`@librocat/server`).
- The server, run by hand in a terminal, prints the plugin guidance
  instead of silently waiting for MCP on stdio.
- The repository ships the plain Apache-2.0 text. The monorepo-specific
  license note is gone.
- Documentation cleanup after a public audit of the published repo: no
  internal file references, no stale AI Gateway mention, and a lint config
  without paths that only exist in the private monorepo.
- This version replaces 0.1.0 and 0.1.1, which are unpublished from the
  registry.

## [0.1.1] - 2026-08-20

### Added

- The npm package ships the Apache-2.0 `LICENSE` file.

- `SECURITY.md`, this changelog, a CI workflow, Dependabot, and the Security
  page at https://librocat.dev/security.

### Removed

- The optional AI Gateway call in `ingest_repo`. Local makes no model call
  and opens no network connection. The agent that calls the MCP writes and
  improves descriptions.

### Changed

- The package description and README now say what the tool is: library and
  information science applied to Google's OKF, persistent AI memory,
  organized for retrieval. "Supabase for AI memory" is the Cloud pitch.
- Cloud is built on the Local core: the new pure module
  `@librocat/core/format` holds the OKF format, ids, links, snippets,
  statuses, frontmatter construction, the weeding rules, the status counts,
  and the graph walk. `apps/web/convex/model.ts` imports it instead of
  carrying copies (about 200 lines removed). An id that climbs above the
  bundle root (`../x`) is now refused in both tiers. Cloud summaries now
  carry `resource`, like Local.
- The repository runs on pnpm and Node (vitest for tests, esbuild for the
  bundle). It ran on bun before. The published package is unchanged: Node 20
  or later, zero runtime dependencies.

## [0.1.0] - 2026-08-20

### Added

- First release of the `librocat` npm package: the stdio MCP server over OKF
  Markdown files, with sixteen tools (`search`, `get_concept`, `list`,
  `neighbors`, `graph`, `ingest`, `update`, `rename`, `delete`, `history`,
  `weed_report`, `thesaurus`, `finding_aid`, `ingest_repo`, `reindex`,
  `status`).
- The Agent Plugin (`plugin.json`, `mcp.json`, the skills), installed with
  `npx plugins add librocat/librocat`.
- The OSS bundle of the Local tier (`pnpm run oss`).

[Unreleased]: https://github.com/librocat/librocat/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/librocat/librocat/releases/tag/v0.1.2
[0.1.1]: https://github.com/librocat/librocat/releases/tag/v0.1.1
[0.1.0]: https://github.com/librocat/librocat/releases/tag/v0.1.0
