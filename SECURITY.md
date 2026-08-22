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

- It runs on your machine over stdio. It opens no network connection, makes
  no model call, and sends no telemetry. The agent that calls it is the AI.
- It reads and writes the OKF Markdown files under `LIBROCAT_BUNDLE`. The
  `ingest_repo` tool also reads the repository path your agent passes it
  (limited to `LIBROCAT_INGEST_ROOT` when that is set). It touches nothing
  else on your disk.
- The published package has zero runtime dependencies. esbuild bundles it
  from this repository, and each release is a tagged commit.
- It runs on Node 20 or later.

## Cloud

Hosting, encryption, access, and data deletion are described at
https://librocat.dev/security.
