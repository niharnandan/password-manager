import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
import { decrypt, encrypt } from "$lib/utils/crypto";
import { writeStoredGitHubToken } from "$lib/utils/local-storage";
import type { GitHubConfig } from "$lib/utils/github-sync";
import type { StoredGitHubToken } from "$lib/utils/local-storage";
import type { KdfParams } from "$lib/types/password";

/**
 * Private repository holding vault.json and security-log.json. The access
 * token is never bundled into the site: it is entered at runtime and kept on
 * each device only encrypted under the vault key.
 */
export const GITHUB_REPO = { owner: "niharnandan", repo: "pwms" } as const;

export const isGitHubAuthenticated = writable<boolean>(false);
export const gitHubConfig = writable<GitHubConfig | null>(null);

export function startGitHubSession(token: string): GitHubConfig {
  const config: GitHubConfig = { ...GITHUB_REPO, token };
  gitHubConfig.set(config);
  isGitHubAuthenticated.set(true);
  return config;
}

export function endGitHubSession(): void {
  gitHubConfig.set(null);
  isGitHubAuthenticated.set(false);
}

export function getGitHubConfig(): GitHubConfig | null {
  return get(gitHubConfig);
}

/** Stores the token on this device, encrypted under the given vault key. */
export function rememberGitHubToken(
  token: string,
  key: Uint8Array,
  salt: string,
  kdf: KdfParams,
): void {
  if (!browser) return;
  const { ciphertext, nonce } = encrypt(token, key);
  writeStoredGitHubToken({ version: 1, salt, kdf, nonce, ciphertext });
}

export function unwrapGitHubToken(
  stored: StoredGitHubToken,
  key: Uint8Array,
): string | null {
  const token = decrypt(stored.ciphertext, stored.nonce, key);
  return token ? token : null;
}
