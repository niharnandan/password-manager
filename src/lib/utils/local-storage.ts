import { browser } from "$app/environment";
import type { EncryptedVault } from "$lib/types/password";

const VAULT_STORAGE_KEY = "encrypted_vault";
const VAULT_TIMESTAMP_KEY = "vault_timestamp";

export function cacheVault(vault: EncryptedVault): void {
  if (!browser) return;

  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
    localStorage.setItem(VAULT_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.error("Error caching vault to localStorage:", error);
  }
}

export function getCachedVault(): EncryptedVault | null {
  if (!browser) return null;

  try {
    const vaultData = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!vaultData) return null;

    return JSON.parse(vaultData) as EncryptedVault;
  } catch (error) {
    console.error("Error retrieving cached vault:", error);
    return null;
  }
}

export function clearCachedVault(): void {
  if (!browser) return;

  try {
    localStorage.removeItem(VAULT_STORAGE_KEY);
    localStorage.removeItem(VAULT_TIMESTAMP_KEY);
  } catch (error) {
    console.error("Error clearing cached vault:", error);
  }
}
