/**
 * The `librocat` CLI: `login`, `logout`, `whoami`, `push`, `--help`,
 * `--version`. Everything else (search, ingest, ...) is the MCP tool
 * surface an agent calls — this file only manages the tier switch itself.
 *
 * Deliberately not here: browser device-flow OAuth. It needs an
 * authorization server Cloud does not yet have; `librocat login --oauth`
 * can be added later without changing any agent's MCP config, since the
 * switch is "a token is present," not how it got there.
 */

import * as readline from "node:readline/promises";
import { loadBundle, THESAURUS_ID, tagsOf, thesaurusFrom } from "@librocat/core";
import { cloudBackend } from "./cloud-backend.ts";
import {
  clearCredentials,
  DEFAULT_CLOUD_URL,
  readCredentials,
  writeCredentials,
} from "./credentials.ts";
import type { ConceptWrite } from "./tools.ts";

const PACKAGE_VERSION = "2.2.0"; // keep in sync with packages/npm/package.json

const HELP = `librocat — persistent AI memory over MCP (Open Knowledge Format)

Usage:
  librocat                    run the MCP server on stdio (what an agent runs)
  librocat login [token]      switch this install to Cloud: paste a workspace
                               token from librocat.dev -> dashboard -> Connect.
                               If the workspace is empty and a local OKF
                               bundle exists, offers to push it in the same
                               step (never touches a workspace that already
                               has data)
  librocat login --url <url>  log into a non-default endpoint (self-hosted dev)
  librocat login --yes        skip the push prompt and push automatically
  librocat login --no-push    skip the push check/prompt entirely
  librocat logout             switch back to Local (forget the stored token)
  librocat whoami             show which tier is active and why
  librocat push [dir]         upload a local OKF bundle (default ./okf) into
                               the logged-in Cloud workspace, any time
  librocat --version          print the version
  librocat --help             show this message

No token: Local, offline, the OKF bundle in LIBROCAT_BUNDLE (default ./okf).
A token (env LIBROCAT_TOKEN, or \`librocat login\`): Cloud, the same MCP tools
served from your workspace at ${DEFAULT_CLOUD_URL}. Same binary, same MCP
config in every agent — restart the agent after logging in or out so it
re-reads the tool list.

Install: npx plugins add librocat/librocat (MCP + Agent Skills), or
npx skills add librocat/librocat plus this binary as the MCP server, for
agents that support Agent Skills and MCP but not Agent Plugins yet.
Docs: https://github.com/librocat/librocat`;

async function promptToken(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const token = await rl.question(
      "Paste your workspace token (librocat.dev -> dashboard -> Connect): ",
    );
    return token.trim();
  } finally {
    rl.close();
  }
}

async function login(args: string[]): Promise<void> {
  // Consistent with whoami/push: an explicit --url wins, then
  // LIBROCAT_MCP_URL (mainly for pointing at a local dev stack), then the
  // real default.
  let url = process.env.LIBROCAT_MCP_URL || DEFAULT_CLOUD_URL;
  let autoYes = false;
  let noPush = false;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url") url = args[++i] ?? url;
    else if (args[i] === "--yes" || args[i] === "-y") autoYes = true;
    else if (args[i] === "--no-push") noPush = true;
    else positional.push(args[i] as string);
  }
  const token = positional[0] || (await promptToken());
  if (!token) {
    console.error("no token given");
    process.exitCode = 1;
    return;
  }

  console.log(`Checking the token against ${url} ...`);
  let status: Record<string, unknown>;
  try {
    status = (await cloudBackend(url, token).status()) as Record<string, unknown>;
  } catch (exc) {
    console.error(`Login failed: ${exc instanceof Error ? exc.message : String(exc)}`);
    process.exitCode = 1;
    return;
  }
  if (status?.error) {
    console.error(`Login failed: ${status.error}`);
    process.exitCode = 1;
    return;
  }

  writeCredentials({ token, ...(url === DEFAULT_CLOUD_URL ? {} : { url }) });
  const plan = status.plan ? ` (${status.plan})` : "";
  console.log(`Logged in${plan}. This install now talks to Cloud — restart any running agent.`);

  if (noPush) return;
  // Never touch a workspace that already has data — only offer on a
  // brand-new, empty one, so a re-login from a second machine (with an
  // unrelated or stale local bundle lying around) can't silently clobber it.
  if (Number(status.concepts ?? 0) > 0) return;

  const bundle = process.env.LIBROCAT_BUNDLE || "./okf";
  const local = loadBundle(bundle).filter((c) => c.id !== THESAURUS_ID);
  if (local.length === 0) return;

  let doPush = autoYes;
  if (!doPush && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(
        `Found ${local.length} concept(s) in ${bundle} — push them into this new workspace now? [Y/n] `,
      );
      doPush = answer.trim() === "" || /^y/i.test(answer.trim());
    } finally {
      rl.close();
    }
  } else if (!doPush) {
    console.log(
      `Found ${local.length} concept(s) in ${bundle}. Run \`librocat push\` to add them, or ` +
        "`librocat login --yes` next time to push automatically.",
    );
  }
  if (doPush) await pushBundle(bundle, url, cloudBackend(url, token));
}

function logout(): void {
  clearCredentials();
  console.log("Logged out. This install is back to Local (offline).");
}

async function whoami(): Promise<void> {
  const envToken = process.env.LIBROCAT_TOKEN;
  const stored = envToken ? null : readCredentials();
  const token = envToken || stored?.token;
  if (!token) {
    console.log("Local — no token set. Running offline against the OKF bundle on disk.");
    return;
  }
  const url = process.env.LIBROCAT_MCP_URL || stored?.url || DEFAULT_CLOUD_URL;
  const source = envToken ? "LIBROCAT_TOKEN" : "librocat login";
  try {
    const status = (await cloudBackend(url, token).status()) as Record<string, unknown>;
    if (status?.error) throw new Error(String(status.error));
    console.log(
      `Cloud (${url}), token from ${source}. plan=${status.plan} concepts=${status.concepts}`,
    );
  } catch (exc) {
    console.log(`Cloud (${url}), token from ${source} — but it did not work:`);
    console.log(`  ${exc instanceof Error ? exc.message : String(exc)}`);
  }
}

/**
 * Read a local OKF bundle and push every concept + thesaurus term into a
 * Cloud workspace, printing its own progress and result lines. Shared by
 * the `push` command and `login`'s auto-offer into a freshly-empty
 * workspace. Returns the failure count so a caller can set `exitCode`.
 */
async function pushBundle(
  bundle: string,
  url: string,
  backend: ReturnType<typeof cloudBackend>,
): Promise<{ failed: number }> {
  const concepts = loadBundle(bundle);
  if (concepts.length === 0) {
    console.log(`No concepts found in ${bundle}.`);
    return { failed: 0 };
  }

  // The thesaurus concept is Cloud's own reserved id (`ingest` refuses it,
  // like it refuses any write to "thesaurus"); its vocabulary moves through
  // `setTerm` instead, one preferred tag at a time. Frontmatter keys beyond
  // type/title/description/tags/status (e.g. `ingest_repo`'s `resource`,
  // `language`) have no field on the `ingest` tool and do not survive a push.
  const writes: ConceptWrite[] = [];
  let thesaurusTerms = 0;
  for (const c of concepts) {
    if (c.id === THESAURUS_ID) {
      const th = thesaurusFrom(c.frontmatter);
      for (const [tag, term] of Object.entries(th)) {
        await backend.setTerm(tag, term);
        thesaurusTerms++;
      }
      continue;
    }
    writes.push({
      type: c.type,
      title: (c.frontmatter.title as string | undefined) ?? undefined,
      description: (c.frontmatter.description as string | undefined) ?? undefined,
      body: c.body,
      tags: tagsOf(c),
      id: c.id,
      status: c.frontmatter.status as ConceptWrite["status"],
    });
  }

  console.log(`Pushing ${writes.length} concept(s) to ${url} ...`);
  const result = await backend.ingestBatch?.(writes);
  const written = result?.written ?? 0;
  const failed = writes.length - written;
  console.log(
    `Pushed ${written}/${writes.length} concept(s)` +
      (thesaurusTerms ? `, ${thesaurusTerms} thesaurus term(s)` : "") +
      ".",
  );
  if (failed > 0 && result) {
    for (const [i, r] of result.results.entries()) {
      if (!r.ok) console.log(`  failed: ${writes[i]?.id ?? "(no id)"} — ${r.error}`);
    }
  }
  return { failed };
}

async function push(args: string[]): Promise<void> {
  const bundle = args[0] || process.env.LIBROCAT_BUNDLE || "./okf";
  const envToken = process.env.LIBROCAT_TOKEN;
  const stored = envToken ? null : readCredentials();
  const token = envToken || stored?.token;
  if (!token) {
    console.error("not logged in — run `librocat login` first");
    process.exitCode = 1;
    return;
  }
  const url = process.env.LIBROCAT_MCP_URL || stored?.url || DEFAULT_CLOUD_URL;
  const { failed } = await pushBundle(bundle, url, cloudBackend(url, token));
  if (failed > 0) process.exitCode = 1;
}

/** Handle a CLI subcommand. Returns true if `argv` named one (and it ran). */
export async function runCli(argv: string[]): Promise<boolean> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "login":
      await login(rest);
      return true;
    case "logout":
      logout();
      return true;
    case "whoami":
      await whoami();
      return true;
    case "push":
      await push(rest);
      return true;
    case "--help":
    case "-h":
    case "help":
      console.log(HELP);
      return true;
    case "--version":
    case "-v":
    case "version":
      console.log(PACKAGE_VERSION);
      return true;
    default:
      return false;
  }
}

export { HELP };
