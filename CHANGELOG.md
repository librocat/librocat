# Changelog

All notable changes to librocat. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version can
change a tool argument. A patch version never does.

## [Unreleased]

## [2.2.0] - 2026-09-15

### Added

- `reindex` now works in Cloud mode too (the `librocat` binary with a
  token), as a documented no-op — it reports the current concept count and
  explains that every write already lands in the index immediately, so
  there is nothing to rebuild. This supersedes 2.1.0's note that `reindex`
  "does not" survive in Cloud mode: it now does, purely so that path's
  tool list matches Local's exactly, at sixteen. A direct HTTP connection
  to Cloud (no local process, no filesystem) still can't offer it —
  fourteen tools there, unchanged, a structural limit rather than a
  decision.
- `librocat login` now offers to push an existing local OKF bundle into
  the workspace in the same step, when (and only when) the workspace is
  brand new and empty — closing the gap where `push` was a second command
  a user had to separately know about. `--yes`/`-y` skips the prompt and
  pushes automatically; `--no-push` skips the check entirely. A workspace
  that already has data is never touched, prompted about, or pushed into.

### Fixed

- `login` now falls back to `LIBROCAT_MCP_URL` the same way `whoami` and
  `push` already did, instead of only accepting an explicit `--url`.

## [2.1.0] - 2026-09-15

### Added

- The `librocat` binary is tier-aware. With no token: unchanged, Local,
  offline, 16 tools. With a workspace token (`LIBROCAT_TOKEN`, or the new
  `librocat login`): the same process becomes the client for librocat
  Cloud instead — every tool call becomes one request to the hosted
  `/mcp` endpoint, reusing the one tool table this repo already defines.
  Same install, same MCP config, both tiers.
- `ingest_repo` survives in Cloud mode: this process still has a
  filesystem (Cloud's own HTTP endpoint does not), so it reads a local
  repo and writes the result into the Cloud workspace. `reindex` does
  not — there is no local index to rebuild against Cloud.
- New CLI subcommands: `login`, `logout`, `whoami`, `push` (uploads an
  existing local OKF bundle into the logged-in workspace once, so
  upgrading from Local does not mean starting from an empty library).
- `packages/npm` — the actual publish source of this package — is now
  part of the public repository; previously only `packages/mcp` (its
  dependency) was, so the published artifact was not reproducible from
  the repository it names as its `repository`.

### Changed

- "Opens no network connection" (`SECURITY.md`, this package's README)
  now reads "opens none until you log in" — a token means exactly one
  HTTPS connection, to the workspace, nowhere else.

## [2.0.0] - 2026-09-14

### Changed

- Reversed the 0.1.2 pointer-package decision: `librocat` on npm is the
  runnable MCP server again (`npx -y librocat`), not a pointer that only
  prints an install command. Many Agent Skills- and MCP-capable
  harnesses do not yet support the newer Agent Plugins standard, so the
  npm package is the documented fallback for them: `npx skills add
  librocat/librocat` (skills) plus this package (the server). `npx
  plugins add librocat/librocat` remains the recommended install where
  supported (MCP + skills in one command).

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

[Unreleased]: https://github.com/librocat/librocat/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/librocat/librocat/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/librocat/librocat/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/librocat/librocat/compare/v0.1.2...v2.0.0
[0.1.2]: https://github.com/librocat/librocat/releases/tag/v0.1.2
[0.1.1]: https://github.com/librocat/librocat/releases/tag/v0.1.1
[0.1.0]: https://github.com/librocat/librocat/releases/tag/v0.1.0
