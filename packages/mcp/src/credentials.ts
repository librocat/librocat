/**
 * Where the librocat binary decides which tier it is: Local (no token, the
 * OKF bundle on disk) or Cloud (a workspace token, the remote MCP at
 * librocat.dev/mcp). Same binary, same install, same MCP config either way —
 * `librocat login` (or `LIBROCAT_TOKEN`) is the only thing that flips it.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_CLOUD_URL = "https://librocat.dev/mcp";

export interface Credentials {
  token: string;
  /** Only set by `librocat login` when logging into a non-default endpoint. */
  url?: string;
}

function credentialsPath(): string {
  return path.join(os.homedir(), ".librocat", "credentials.json");
}

/** Read the stored credentials file, or null if it does not exist or does not parse. */
export function readCredentials(): Credentials | null {
  try {
    const raw = fs.readFileSync(credentialsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    if (typeof parsed.token !== "string" || !parsed.token) return null;
    return { token: parsed.token, url: typeof parsed.url === "string" ? parsed.url : undefined };
  } catch {
    return null;
  }
}

/** Write the credentials file with owner-only permissions (0600), creating its directory. */
export function writeCredentials(creds: Credentials): void {
  const p = credentialsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  fs.writeFileSync(p, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(p, 0o600);
}

/** Remove the credentials file. No error if it was already absent. */
export function clearCredentials(): void {
  fs.rmSync(credentialsPath(), { force: true });
}

export interface Tier {
  mode: "local" | "cloud";
  /** Set only when mode is "cloud". */
  token?: string;
  url?: string;
}

/**
 * Resolve the tier for this run: `LIBROCAT_MODE` forces one explicitly;
 * otherwise a token — `LIBROCAT_TOKEN`, then the credentials file written by
 * `librocat login` — means Cloud, and no token means Local. The endpoint is
 * `LIBROCAT_MCP_URL`, then a URL saved at login, then the default.
 */
export function resolveTier(): Tier {
  const forced = process.env.LIBROCAT_MODE;
  if (forced === "local") return { mode: "local" };

  const envToken = process.env.LIBROCAT_TOKEN;
  const stored = envToken ? null : readCredentials();
  const token = envToken || stored?.token;

  if (forced === "cloud" && !token) {
    throw new Error(
      "LIBROCAT_MODE=cloud but no token found — set LIBROCAT_TOKEN or run `librocat login`",
    );
  }
  if (!token) return { mode: "local" };

  const url = process.env.LIBROCAT_MCP_URL || stored?.url || DEFAULT_CLOUD_URL;
  return { mode: "cloud", token, url };
}
