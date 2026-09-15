/**
 * The tier flip, end to end: the exact BUILT artifact (dist/main.js) run
 * with `node`, once with no token (Local) and once with a token pointed at
 * a running librocat Cloud endpoint (its own repo, not part of this one) —
 * same binary, same MCP config shape, only the environment differs. Opt-in,
 * so it needs no Cloud stack to pass here:
 *
 *   LIBROCAT_MCP_URL=http://localhost:3000/mcp LIBROCAT_MCP_TOKEN=lc_... pnpm test
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { beforeAll, expect, test } from "vitest";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distMain = path.join(pkgDir, "dist", "main.js");

const url = process.env.LIBROCAT_MCP_URL;
const token = process.env.LIBROCAT_MCP_TOKEN;
const run = url && token ? test : test.skip;

beforeAll(() => {
  if (!fs.existsSync(distMain)) {
    const build = spawnSync("pnpm", ["run", "build"], { cwd: pkgDir, stdio: "inherit" });
    if (build.status !== 0) throw new Error("pnpm run build failed");
  }
});

async function connect(env: Record<string, string>): Promise<Client> {
  const client = new Client({ name: "cloud-mode-e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: [distMain],
      env: { ...(process.env as Record<string, string>), ...env },
    }),
  );
  return client;
}

// biome-ignore lint/suspicious/noExplicitAny: test assertions poke freely at parsed JSON
async function call(client: Client, tool: string, args: Record<string, unknown>): Promise<any> {
  const res = await client.callTool({ name: tool, arguments: args });
  expect(res.isError).toBeFalsy();
  return JSON.parse((res.content as { text: string }[])[0]?.text ?? "null");
}

run("Cloud mode lists 16 tools, matching Local: reindex is a no-op", async () => {
  const client = await connect({
    LIBROCAT_MCP_URL: url as string,
    LIBROCAT_TOKEN: token as string,
  });
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  expect(names).toContain("reindex");
  expect(names).toContain("ingest_repo");
  expect(names.length).toBe(16);
  const reindexed = await call(client, "reindex", {});
  expect(typeof reindexed.indexed).toBe("number");
  expect(reindexed.note).toContain("no-op");
  await client.close();
});

run("Local mode (no token) still lists 16 tools, unaffected by the bridge", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "librocat-cloud-mode-e2e-"));
  const client = await connect({ LIBROCAT_BUNDLE: path.join(dir, "okf") });
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  expect(names).toContain("reindex");
  expect(names.length).toBe(16);
  await client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

run(
  "a real workflow through the bridge: ingest, read, ingest_repo, delete",
  async () => {
    const client = await connect({
      LIBROCAT_MCP_URL: url as string,
      LIBROCAT_TOKEN: token as string,
    });
    const stamp = Date.now();
    const id = `e2e/bridge/${stamp}`;

    const written = await call(client, "ingest", {
      type: "Note",
      id,
      title: "Bridge e2e",
      description: "Written through the local Cloud-mode bridge process.",
      body: "hello from the bridge",
      tags: ["bridge"],
    });
    expect(written.id).toBe(id);

    const read = await call(client, "get_concept", { id });
    expect(read.body).toContain("hello from the bridge");

    // ingest_repo: this process has a filesystem, Cloud's HTTP endpoint does
    // not — the bridge is the one thing that can offer it in Cloud mode.
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "librocat-bridge-repo-"));
    fs.writeFileSync(path.join(repo, "hello.ts"), "export function hello() { return 1; }\n");
    const prefix = `e2e/bridge-repo/${stamp}`;
    const repoResult = await call(client, "ingest_repo", { path: repo, prefix });
    expect(repoResult.ingested).toBe(1);
    expect(repoResult.indexed).toBe(1);
    const code = await call(client, "get_concept", { id: `${prefix}/hello.ts` });
    expect(code.tags).toEqual(["typescript", "code"]);
    await call(client, "delete", { id: `${prefix}/hello.ts` });
    fs.rmSync(repo, { recursive: true, force: true });

    expect(await call(client, "delete", { id })).toEqual({ deleted: id });
    await client.close();
  },
  30_000,
);

run("a rejected token comes back as a structured error, not a crash", async () => {
  const client = await connect({
    LIBROCAT_MCP_URL: url as string,
    LIBROCAT_TOKEN: "lc_not_a_token",
  });
  // tools/list answers without touching the network — the connection opens
  // lazily on the first real tool call.
  const names = (await client.listTools()).tools.map((t) => t.name);
  expect(names).toContain("status");
  const res = await call(client, "status", {});
  expect(res.error).toBeTruthy();
  expect(typeof res.error).toBe("string");
  await client.close();
});
