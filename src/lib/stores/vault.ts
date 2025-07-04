import { derived, writable, get } from "svelte/store";
import { browser } from "$app/environment";
import {
  encrypt,
  decrypt,
  deriveKey,
  generateSalt,
  saltToString,
  stringToSalt,
} from "$lib/utils/crypto";
import {
  uploadVaultToGitHub,
  downloadVaultFromGitHub,
} from "$lib/utils/github-sync";
import {
  loadGitHubAuth,
  getGitHubConfig,
  isGitHubAuthenticated,
} from "$lib/stores/github-auth";
import {
  cacheVault,
  getCachedVault,
  clearCachedVault,
} from "$lib/utils/local-storage";
import type {
  PasswordEntry,
  PasswordVault,
  EncryptedVault,
} from "$lib/types/password";

// Store for the master key (never persisted)
export const masterKey = writable<Uint8Array | null>(null);

// Store for authentication state
export const isAuthenticated = writable<boolean>(false);

// Store for sync status
export const syncStatus = writable<{
  syncing: boolean;
  lastSync: Date | null;
  error: string | null;
}>({
  syncing: false,
  lastSync: null,
  error: null,
});

// Store for the encrypted vault (in memory only - no persistence)
export const encryptedVault = writable<EncryptedVault | null>(null);

// Derived store for the decrypted vault (computed from masterKey and encryptedVault)
export const vault = derived(
  [masterKey, encryptedVault],
  ([$masterKey, $encryptedVault], set) => {
    if (!browser || !$masterKey || !$encryptedVault) {
      set(null);
      return;
    }

    try {
      const decrypted = decrypt(
        $encryptedVault.ciphertext,
        $encryptedVault.nonce,
        $masterKey,
      );

      if (!decrypted) {
        set(null);
        return;
      }

      set(JSON.parse(decrypted) as PasswordVault);
    } catch (error) {
      console.error("Error decrypting vault:", error);
      set(null);
    }
  },
  null as PasswordVault | null,
);

// Sync vault to GitHub
async function syncVaultToGitHub(): Promise<boolean> {
  const config = getGitHubConfig();
  const $encryptedVault = get(encryptedVault);

  if (!config || !$encryptedVault) {
    // If no GitHub config, at least cache locally
    if ($encryptedVault) {
      cacheVault($encryptedVault);
    }
    return false;
  }

  syncStatus.update((s) => ({ ...s, syncing: true, error: null }));

  try {
    const result = await uploadVaultToGitHub($encryptedVault, config);

    if (result.success) {
      // Cache the vault locally after successful sync
      cacheVault($encryptedVault);
      syncStatus.update((s) => ({
        ...s,
        syncing: false,
        lastSync: new Date(),
        error: null,
      }));
      return true;
    } else {
      // Even if GitHub sync fails, cache locally
      cacheVault($encryptedVault);
      syncStatus.update((s) => ({
        ...s,
        syncing: false,
        error: result.error || "Upload failed",
      }));
      return false;
    }
  } catch (error) {
    // Cache locally even if sync fails
    cacheVault($encryptedVault);
    syncStatus.update((s) => ({
      ...s,
      syncing: false,
      error: `Sync error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }));
    return false;
  }
}

// Load vault from GitHub or localStorage
async function loadVaultFromGitHub(): Promise<boolean> {
  const config = getGitHubConfig();

  if (!config) {
    // Try to load from localStorage if GitHub not configured
    const cachedVault = getCachedVault();
    if (cachedVault) {
      encryptedVault.set(cachedVault);
      return true;
    }
    return false;
  }

  syncStatus.update((s) => ({ ...s, syncing: true, error: null }));

  try {
    const result = await downloadVaultFromGitHub(config);

    if (result.success && result.data) {
      // Update local vault with GitHub data
      encryptedVault.set(result.data);
      // Cache the vault data locally
      cacheVault(result.data);
      syncStatus.update((s) => ({
        ...s,
        syncing: false,
        lastSync: new Date(),
        error: null,
      }));
      return true;
    } else {
      // If GitHub sync fails, try localStorage fallback
      const cachedVault = getCachedVault();
      if (cachedVault) {
        encryptedVault.set(cachedVault);
        syncStatus.update((s) => ({
          ...s,
          syncing: false,
          error: "Using cached vault (offline)",
        }));
        return true;
      }

      syncStatus.update((s) => ({
        ...s,
        syncing: false,
        error: result.error || "Download failed",
      }));
      return false;
    }
  } catch (error) {
    // If network error, try localStorage fallback
    const cachedVault = getCachedVault();
    if (cachedVault) {
      encryptedVault.set(cachedVault);
      syncStatus.update((s) => ({
        ...s,
        syncing: false,
        error: "Using cached vault (offline)",
      }));
      return true;
    }

    syncStatus.update((s) => ({
      ...s,
      syncing: false,
      error: `Load error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }));
    return false;
  }
}

// Initialize a new vault with master password
export function initializeVault(password: string): void {
  if (!browser) return;

  try {
    // Generate a new salt
    const salt = generateSalt();

    // Derive key from password
    const key = deriveKey(password, salt);

    // Create initial empty vault
    const emptyVault: PasswordVault = {
      version: "1.0",
      vault: [],
      globalNotes: "", // Initialize empty global notes
      verification: {
        marker: "VALID_VAULT",
        version: "1.0",
      },
    };

    // Encrypt the empty vault
    const { ciphertext, nonce } = encrypt(JSON.stringify(emptyVault), key);

    // Store encrypted vault
    encryptedVault.set({
      salt: saltToString(salt),
      nonce,
      ciphertext,
    });

    // Set master key in memory
    masterKey.set(key);
    isAuthenticated.set(true);
  } catch (error) {
    console.error("Error initializing vault:", error);
    throw error;
  }
}

// Unlock the vault with master password
export async function unlockVault(password: string): Promise<boolean> {
  if (!browser) return false;

  // If password is empty, assume master key is already set (WebAuthn case)
  if (!password && get(masterKey)) {
    // Just try to load vault data, don't derive key
    const loaded = await loadVaultFromGitHub();
    if (loaded) {
      isAuthenticated.set(true);
      return true;
    }
    // If loading fails but we have a master key, check if we can decrypt existing vault
    const currentEncryptedVault = get(encryptedVault);
    if (currentEncryptedVault) {
      const currentMasterKey = get(masterKey);
      if (currentMasterKey) {
        try {
          const decrypted = decrypt(
            currentEncryptedVault.ciphertext,
            currentEncryptedVault.nonce,
            currentMasterKey,
          );
          if (decrypted) {
            isAuthenticated.set(true);
            return true;
          }
        } catch (e) {
          // Failed to decrypt with current master key
          console.error("Failed to decrypt vault with WebAuthn master key:", e);
        }
      }
    }
    return false;
  }

  // Normal password flow
  if (password) {
    loadGitHubAuth(password);
  }
  const loaded = await loadVaultFromGitHub();
  if (!loaded) return false;

  // Get the (possibly updated) encrypted vault
  const currentEncryptedVault = get(encryptedVault);
  if (!currentEncryptedVault) return false;

  try {
    // Convert salt string back to Uint8Array
    const salt = stringToSalt(currentEncryptedVault.salt);

    // Derive key from password and salt
    const key = deriveKey(password, salt);

    // Attempt to decrypt the vault
    const decrypted = decrypt(
      currentEncryptedVault.ciphertext,
      currentEncryptedVault.nonce,
      key,
    );

    // If decryption fails, return false
    if (!decrypted) return false;

    try {
      // Verify the decrypted content is valid JSON
      const parsedVault = JSON.parse(decrypted) as PasswordVault;

      // Handle migration for vaults without globalNotes field
      if (parsedVault.globalNotes === undefined) {
        parsedVault.globalNotes = "";
      }

      // Store the key in memory
      masterKey.set(key);
      isAuthenticated.set(true);

      // Load GitHub authentication if available
      loadGitHubAuth(password);

      // Try to sync with GitHub if auth is available
      if (get(isGitHubAuthenticated)) {
        // Upload local changes to GitHub instead of downloading
        syncVaultToGitHub().catch(console.error);
      }

      return true;
    } catch (e) {
      return false;
    }
  } catch (e) {
    return false;
  }
}

// Lock the vault (clear everything from memory)
export function lockVault(): void {
  masterKey.set(null);
  encryptedVault.set(null);
  isAuthenticated.set(false);
  // Note: We don't clear localStorage cache on lock - only on explicit logout
}

// Clear all data including cache (for logout)
export function clearAllData(): void {
  lockVault();
  clearCachedVault();
}

// Add a password to the vault
export async function addPassword(
  entry: Omit<PasswordEntry, "id" | "created" | "modified">,
): Promise<void> {
  const $vault = get(vault);
  if (!browser || !$vault) return;

  const $masterKey = get(masterKey);
  if (!$masterKey) return;

  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return;

  // Create a new password entry
  const newEntry: PasswordEntry = {
    ...entry,
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
  };

  // Add the entry to the vault
  const updatedVault: PasswordVault = {
    ...$vault,
    vault: [...$vault.vault, newEntry],
  };

  // Encrypt the updated vault
  const { ciphertext, nonce } = encrypt(
    JSON.stringify(updatedVault),
    $masterKey,
  );

  // Update the encrypted vault
  const newEncryptedVault = {
    ...$encryptedVault,
    ciphertext,
    nonce,
  };
  encryptedVault.set(newEncryptedVault);

  // Always cache locally
  cacheVault(newEncryptedVault);

  // Sync to GitHub if available
  if (get(isGitHubAuthenticated)) {
    syncVaultToGitHub().catch(console.error);
  }
}

// Update a password in the vault
export async function updatePassword(
  id: string,
  updates: Partial<Omit<PasswordEntry, "id" | "created">>,
): Promise<void> {
  const $vault = get(vault);
  if (!browser || !$vault) return;

  const $masterKey = get(masterKey);
  if (!$masterKey) return;

  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return;

  // Find the password entry
  const index = $vault.vault.findIndex((entry) => entry.id === id);
  if (index === -1) return;

  // Update the entry
  const updatedEntry: PasswordEntry = {
    ...$vault.vault[index],
    ...updates,
    modified: new Date().toISOString(),
  };

  // Update the vault
  const updatedVault: PasswordVault = {
    ...$vault,
    vault: [
      ...$vault.vault.slice(0, index),
      updatedEntry,
      ...$vault.vault.slice(index + 1),
    ],
  };

  // Encrypt the updated vault
  const { ciphertext, nonce } = encrypt(
    JSON.stringify(updatedVault),
    $masterKey,
  );

  // Update the encrypted vault
  const newEncryptedVault = {
    ...$encryptedVault,
    ciphertext,
    nonce,
  };
  encryptedVault.set(newEncryptedVault);

  // Always cache locally
  cacheVault(newEncryptedVault);

  // Sync to GitHub if available
  if (get(isGitHubAuthenticated)) {
    syncVaultToGitHub().catch(console.error);
  }
}

// Delete a password from the vault
export async function deletePassword(id: string): Promise<void> {
  const $vault = get(vault);
  if (!browser || !$vault) return;

  const $masterKey = get(masterKey);
  if (!$masterKey) return;

  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return;

  // Filter out the password entry
  const updatedVault: PasswordVault = {
    ...$vault,
    vault: $vault.vault.filter((entry) => entry.id !== id),
  };

  // Encrypt the updated vault
  const { ciphertext, nonce } = encrypt(
    JSON.stringify(updatedVault),
    $masterKey,
  );

  // Update the encrypted vault
  const newEncryptedVault = {
    ...$encryptedVault,
    ciphertext,
    nonce,
  };
  encryptedVault.set(newEncryptedVault);

  // Always cache locally
  cacheVault(newEncryptedVault);

  // Sync to GitHub if available
  if (get(isGitHubAuthenticated)) {
    syncVaultToGitHub().catch(console.error);
  }
}

// Update global notes
export async function updateGlobalNotes(notes: string): Promise<void> {
  const $vault = get(vault);
  if (!browser || !$vault) return;

  const $masterKey = get(masterKey);
  if (!$masterKey) return;

  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return;

  // Update the vault with new global notes
  const updatedVault: PasswordVault = {
    ...$vault,
    globalNotes: notes,
  };

  // Encrypt the updated vault
  const { ciphertext, nonce } = encrypt(
    JSON.stringify(updatedVault),
    $masterKey,
  );

  // Update the encrypted vault
  const newEncryptedVault = {
    ...$encryptedVault,
    ciphertext,
    nonce,
  };
  encryptedVault.set(newEncryptedVault);

  // Always cache locally
  cacheVault(newEncryptedVault);

  // Sync to GitHub if available
  if (get(isGitHubAuthenticated)) {
    syncVaultToGitHub().catch(console.error);
  }
}

// Export entire vault (for GitHub backup)
export function exportVault(): string | null {
  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return null;

  return JSON.stringify($encryptedVault);
}

// Import vault (from GitHub backup)
export function importVault(vaultData: string): boolean {
  if (!browser) return false;

  try {
    const parsedVault = JSON.parse(vaultData) as EncryptedVault;
    encryptedVault.set(parsedVault);
    return true;
  } catch (e) {
    console.error("Error importing vault:", e);
    return false;
  }
}

// Export sync functions for manual sync
export { loadVaultFromGitHub, syncVaultToGitHub };

// Auto-sync is enabled by default
// All vault changes automatically sync to GitHub when authenticated
