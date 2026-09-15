# Security policy

## Report a vulnerability

Email hello@librocat.dev with "Security" in the subject. Include the steps to
reproduce the problem. Do not open a public issue for a vulnerability.

We acknowledge a report within three business days. We keep you informed
until the fix ships, and we credit you in the release notes if you want.
Please give us 90 days before public disclosure.

## Scope

- The npm package `librocat` (the stdio MCP server) and the Agent Plugin in
  this repository.
- librocat Cloud: https://librocat.dev, the dashboard, and the remote MCP
  endpoint https://librocat.dev/mcp.

Out of scope: denial of service, social engineering, and problems in a
third-party service (Vercel, Convex, Stripe). Report those to the provider.

## Supported versions

The latest version of `librocat` published on npm. Older versions get no
security fixes.

## What the Local tool does

- It runs on your machine over stdio. **With no token, it opens no network
  connection**, makes no model call, and sends no telemetry — the agent that
  calls it is the AI. It reads and writes the OKF Markdown files under
  `LIBROCAT_BUNDLE`. The `ingest_repo` tool also reads the repository path
  your agent passes it (limited to `LIBROCAT_INGEST_ROOT` when that is set).
  It touches nothing else on your disk.
- **With a token** (`LIBROCAT_TOKEN`, or one saved by `librocat login`), the
  same binary switches to Cloud mode: every tool call becomes one HTTPS
  request to your workspace at `https://librocat.dev/mcp` (or the endpoint
  from `LIBROCAT_MCP_URL`) with `Authorization: Bearer <token>`, and nowhere
  else. It still makes no model call itself — Cloud's automatic indexation
  runs server-side, not in this process. `ingest_repo` still reads the local
  filesystem in this mode (the same `LIBROCAT_INGEST_ROOT` limit applies);
  `reindex` has no meaning against Cloud and is dropped from the tool list.
  A rejected token surfaces as a `{"error": ...}` tool result, not a crash.
- The published package has zero runtime dependencies. esbuild bundles it
  (including the official MCP TypeScript SDK's client, used only for the
  Cloud-mode bridge above) from this repository, and each release is a
  tagged commit.
- It runs on Node 20 or later.
- `librocat login` writes the token to `~/.librocat/credentials.json`, mode
  `0600` (owner read/write only). `librocat logout` removes it. The token
  itself is your workspace's, minted and revocable from the dashboard's
  Connect page — this tool never sees your account password.

## Cloud

Hosting, encryption, access, and data deletion are described at
https://librocat.dev/security.
