import { browser } from "$app/environment";
import { isEncryptedVault, isSupportedKdf } from "$lib/utils/crypto";
import type { EncryptedVault, KdfParams } from "$lib/types/password";

const VAULT_STORAGE_KEY = "encrypted_vault";
const SYNC_PENDING_KEY = "vault_sync_pending";
const GITHUB_TOKEN_KEY = "github_token_encrypted";

/** GitHub token encrypted under the vault key (same salt + KDF as the vault). */
export interface StoredGitHubToken {
  version: 1;
  salt: string;
  kdf: KdfParams;
  nonce: string;
  ciphertext: string;
}

export function cacheVault(vault: EncryptedVault): void {
  if (!browser) return;
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
  } catch (error) {
    console.error("Error caching vault:", error);
  }
}

export function getCachedVault(): EncryptedVault | null {
  if (!browser) return null;
  try {
    const vaultData = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!vaultData) return null;
    const parsed: unknown = JSON.parse(vaultData);
    return isEncryptedVault(parsed) ? parsed : null;
  } catch (error) {
    console.error("Error retrieving cached vault:", error);
    return null;
  }
}

export function clearCachedVault(): void {
  if (!browser) return;
  try {
    localStorage.removeItem(VAULT_STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing cached vault:", error);
  }
}

/** True when the cached vault has changes that have not reached GitHub yet. */
export function isSyncPending(): boolean {
  if (!browser) return false;
  try {
    return localStorage.getItem(SYNC_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSyncPending(pending: boolean): void {
  if (!browser) return;
  try {
    if (pending) localStorage.setItem(SYNC_PENDING_KEY, "1");
    else localStorage.removeItem(SYNC_PENDING_KEY);
  } catch (error) {
    console.error("Error updating sync state:", error);
  }
}

export function readStoredGitHubToken(): StoredGitHubToken | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(GITHUB_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGitHubToken> | null;
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.salt !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.ciphertext !== "string" ||
      !isSupportedKdf(parsed.kdf)
    ) {
      return null;
    }
    return parsed as StoredGitHubToken;
  } catch {
    return null;
  }
}

export function writeStoredGitHubToken(blob: StoredGitHubToken): void {
  if (!browser) return;
  try {
    localStorage.setItem(GITHUB_TOKEN_KEY, JSON.stringify(blob));
  } catch (error) {
    console.error("Error storing GitHub token:", error);
  }
}

export function clearStoredGitHubToken(): void {
  if (!browser) return;
  try {
    localStorage.removeItem(GITHUB_TOKEN_KEY);
  } catch (error) {
    console.error("Error removing GitHub token:", error);
  }
}

export function hasStoredGitHubToken(): boolean {
  return readStoredGitHubToken() !== null;
}
