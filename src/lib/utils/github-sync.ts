import { browser } from "$app/environment";
import util from "tweetnacl-util";
import { isEncryptedVault } from "$lib/utils/crypto";
import type { EncryptedVault } from "$lib/types/password";

const GITHUB_API_BASE = "https://api.github.com";
const VAULT_FILENAME = "vault.json";
const SECURITY_LOG_FILENAME = "security-log.json";
const MAX_SECURITY_EVENTS = 100;

export interface GitHubConfig {
  owner: string; // GitHub username
  repo: string; // Repository name
  token: string; // Personal access token (never bundled; entered at runtime)
}

export interface GitHubSyncResult {
  success: boolean;
  error?: string;
}

export type VaultDownloadResult =
  | { status: "ok"; vault: EncryptedVault }
  | { status: "not-found" }
  | { status: "invalid"; error: string }
  | { status: "error"; error: string; httpStatus?: number };

function apiHeaders(token: string, withBody = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(withBody ? { "Content-Type": "application/json" } : {}),
  };
}

function repoUrl(config: GitHubConfig): string {
  return `${GITHUB_API_BASE}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
}

function contentsUrl(config: GitHubConfig, path: string): string {
  return `${repoUrl(config)}/contents/${path}`;
}

// The Contents API caches responses for 60s; a stale copy (or stale sha)
// would make sync silently use old data, so always bypass the HTTP cache.
function githubFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, cache: "no-store" });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function readApiError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data.message === "string") return data.message;
  } catch {
    // Fall through to the status text.
  }
  return response.statusText || `HTTP ${response.status}`;
}

/** UTF-8 safe Base64 (btoa/atob only handle Latin-1). */
export function utf8ToBase64(text: string): string {
  return util.encodeBase64(util.decodeUTF8(text));
}

export function base64ToUtf8(base64: string): string {
  return util.encodeUTF8(util.decodeBase64(base64.replace(/\s/g, "")));
}

let verifiedPrivateRepo: GitHubConfig | null = null;

/** Forget the cached repository check (call when the session ends). */
export function resetRepoVerification(): void {
  verifiedPrivateRepo = null;
}

/** Refuses to write vault data or logs to a repository that is not private. */
async function ensurePrivateRepo(
  config: GitHubConfig,
): Promise<GitHubSyncResult> {
  if (verifiedPrivateRepo === config) return { success: true };
  const response = await githubFetch(repoUrl(config), {
    headers: apiHeaders(config.token),
  });
  if (!response.ok) {
    return {
      success: false,
      error: `Could not verify the vault repository: ${await readApiError(response)}`,
    };
  }
  const data = await response.json();
  if (data?.private !== true) {
    return {
      success: false,
      error: "Refusing to sync: the vault repository is not private.",
    };
  }
  verifiedPrivateRepo = config;
  return { success: true };
}

async function readFile(
  config: GitHubConfig,
  path: string,
): Promise<
  | { status: "ok"; sha: string; content: string }
  | { status: "not-found" }
  | { status: "error"; error: string; httpStatus?: number }
> {
  const response = await githubFetch(contentsUrl(config, path), {
    headers: apiHeaders(config.token),
  });
  if (response.status === 404) return { status: "not-found" };
  if (!response.ok) {
    return {
      status: "error",
      error: `GitHub API error: ${await readApiError(response)}`,
      httpStatus: response.status,
    };
  }
  const data = await response.json();
  if (typeof data?.sha !== "string" || typeof data?.content !== "string") {
    return { status: "error", error: `Unexpected response for ${path}` };
  }
  return { status: "ok", sha: data.sha, content: data.content };
}

async function writeFile(
  config: GitHubConfig,
  path: string,
  contentBase64: string,
  message: string,
  sha: string | undefined,
): Promise<{ ok: true } | { ok: false; conflict: boolean; error: string }> {
  const response = await githubFetch(contentsUrl(config, path), {
    method: "PUT",
    headers: apiHeaders(config.token, true),
    body: JSON.stringify({
      message,
      content: contentBase64,
      ...(sha ? { sha } : {}),
    }),
  });
  if (response.ok) return { ok: true };
  return {
    ok: false,
    // 409: sha is stale; 422: file appeared after we checked (sha missing).
    conflict: response.status === 409 || response.status === 422,
    error: `GitHub API error: ${await readApiError(response)}`,
  };
}

export async function uploadVaultToGitHub(
  vault: EncryptedVault,
  config: GitHubConfig,
): Promise<GitHubSyncResult> {
  if (!browser) {
    return { success: false, error: "GitHub sync only available in browser" };
  }

  try {
    const check = await ensurePrivateRepo(config);
    if (!check.success) return check;

    const content = utf8ToBase64(JSON.stringify(vault));
    // Last write wins; retry once if another upload changed the sha meanwhile.
    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = await readFile(config, VAULT_FILENAME);
      if (existing.status === "error")
        return { success: false, error: existing.error };
      const result = await writeFile(
        config,
        VAULT_FILENAME,
        content,
        `Update vault - ${new Date().toISOString()}`,
        existing.status === "ok" ? existing.sha : undefined,
      );
      if (result.ok) return { success: true };
      if (!result.conflict || attempt === 1)
        return { success: false, error: result.error };
    }
    return { success: false, error: "Upload failed" };
  } catch (error) {
    return {
      success: false,
      error: `Network error: ${errorMessage(error)}`,
    };
  }
}

export async function downloadVaultFromGitHub(
  config: GitHubConfig,
): Promise<VaultDownloadResult> {
  if (!browser) {
    return { status: "error", error: "GitHub sync only available in browser" };
  }

  try {
    const file = await readFile(config, VAULT_FILENAME);
    if (file.status !== "ok") return file;

    let parsed: unknown;
    try {
      parsed = JSON.parse(base64ToUtf8(file.content));
    } catch {
      return { status: "invalid", error: "vault.json on GitHub is not valid" };
    }
    if (!isEncryptedVault(parsed)) {
      return {
        status: "invalid",
        error: "vault.json on GitHub has an unexpected format",
      };
    }
    return { status: "ok", vault: parsed };
  } catch (error) {
    return {
      status: "error",
      error: `Error downloading vault: ${errorMessage(error)}`,
    };
  }
}

/** Appends events to security-log.json, keeping the most recent 100. */
export async function appendSecurityEvents(
  config: GitHubConfig,
  events: unknown[],
): Promise<GitHubSyncResult> {
  if (!browser) {
    return { success: false, error: "GitHub sync only available in browser" };
  }
  if (events.length === 0) return { success: true };

  try {
    const check = await ensurePrivateRepo(config);
    if (!check.success) return check;

    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = await readFile(config, SECURITY_LOG_FILENAME);
      if (existing.status === "error")
        return { success: false, error: existing.error };

      let securityEvents: unknown[] = [];
      if (existing.status === "ok") {
        try {
          const log = JSON.parse(base64ToUtf8(existing.content));
          if (Array.isArray(log?.securityEvents))
            securityEvents = log.securityEvents;
        } catch {
          // Unreadable log: start a fresh one rather than failing.
        }
      }

      securityEvents = [...securityEvents, ...events].slice(
        -MAX_SECURITY_EVENTS,
      );
      const lastEvent = events[events.length - 1] as { timestamp?: string };
      const log = {
        securityEvents,
        metadata: {
          version: "1.0",
          totalEvents: securityEvents.length,
          lastUpdated: lastEvent?.timestamp ?? new Date().toISOString(),
        },
      };

      const result = await writeFile(
        config,
        SECURITY_LOG_FILENAME,
        utf8ToBase64(JSON.stringify(log, null, 2)),
        `Security Alert: Failed login threshold exceeded - ${new Date().toISOString()}`,
        existing.status === "ok" ? existing.sha : undefined,
      );
      if (result.ok) return { success: true };
      if (!result.conflict || attempt === 1)
        return { success: false, error: result.error };
    }
    return { success: false, error: "Upload failed" };
  } catch (error) {
    return {
      success: false,
      error: `Network error: ${errorMessage(error)}`,
    };
  }
}
