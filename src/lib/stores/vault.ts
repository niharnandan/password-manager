import { derived, writable, get } from "svelte/store";
import { browser } from "$app/environment";
import { encrypt, decrypt, deriveKey, stringToSalt } from "$lib/utils/crypto";
import {
  uploadVaultToGitHub,
  downloadVaultFromGitHub,
} from "$lib/utils/github-sync";
import {
  loadGitHubAuth,
  getGitHubConfig,
  isGitHubAuthenticated,
} from "$lib/stores/github-auth";
import { cacheVault, getCachedVault } from "$lib/utils/local-storage";
import type {
  PasswordEntry,
  PasswordVault,
  EncryptedVault,
} from "$lib/types/password";

const CURRENT_VAULT_VERSION = 2;

function migrateVault(vault: PasswordVault): PasswordVault {
  const vaultVersion = vault.vaultVersion ?? 1;

  if (vaultVersion >= CURRENT_VAULT_VERSION) return vault;

  console.log(
    "Migrating vault from version",
    vaultVersion,
    "to",
    CURRENT_VAULT_VERSION,
  );

  if (vaultVersion === 1) {
    const migratedEntries = vault.vault.map(
      (entry: PasswordEntry & { category?: string }) => {
        delete entry.category;
        return entry as PasswordEntry;
      },
    );

    return {
      ...vault,
      vault: migratedEntries,
      vaultVersion: CURRENT_VAULT_VERSION,
    };
  }

  return vault;
}

export const masterKey = writable<Uint8Array | null>(null);
export const isAuthenticated = writable<boolean>(false);
export const syncStatus = writable<{
  syncing: boolean;
  lastSync: Date | null;
  error: string | null;
}>({
  syncing: false,
  lastSync: null,
  error: null,
});

export const encryptedVault = writable<EncryptedVault | null>(null);

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

async function syncVaultToGitHub(): Promise<boolean> {
  const config = getGitHubConfig();
  const $encryptedVault = get(encryptedVault);

  if (!config || !$encryptedVault) {
    if ($encryptedVault) cacheVault($encryptedVault);
    return false;
  }

  syncStatus.update((s) => ({ ...s, syncing: true, error: null }));

  try {
    const result = await uploadVaultToGitHub($encryptedVault, config);

    if (result.success) {
      cacheVault($encryptedVault);
      syncStatus.update((s) => ({
        ...s,
        syncing: false,
        lastSync: new Date(),
        error: null,
      }));
      return true;
    } else {
      cacheVault($encryptedVault);
      syncStatus.update((s) => ({
        ...s,
        syncing: false,
        error: result.error || "Upload failed",
      }));
      return false;
    }
  } catch (error) {
    cacheVault($encryptedVault);
    syncStatus.update((s) => ({
      ...s,
      syncing: false,
      error: `Sync error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }));
    return false;
  }
}

async function loadVaultFromGitHub(): Promise<boolean> {
  const config = getGitHubConfig();

  if (!config) {
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
      const vaultData = result.data as EncryptedVault;
      encryptedVault.set(vaultData);
      cacheVault(vaultData);
      syncStatus.update((s) => ({
        ...s,
        syncing: false,
        lastSync: new Date(),
        error: null,
      }));
      return true;
    } else {
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

export async function unlockVault(password: string): Promise<boolean> {
  if (!browser) return false;

  // WebAuthn case: master key already set, just load vault data
  if (!password && get(masterKey)) {
    const loaded = await loadVaultFromGitHub();
    if (loaded) {
      isAuthenticated.set(true);
      return true;
    }
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
          console.error("Failed to decrypt vault with WebAuthn master key:", e);
        }
      }
    }
    return false;
  }

  if (password) {
    loadGitHubAuth();
  }
  const loaded = await loadVaultFromGitHub();
  if (!loaded) return false;

  const currentEncryptedVault = get(encryptedVault);
  if (!currentEncryptedVault) return false;

  try {
    const salt = stringToSalt(currentEncryptedVault.salt);
    const key = deriveKey(password, salt);
    const decrypted = decrypt(
      currentEncryptedVault.ciphertext,
      currentEncryptedVault.nonce,
      key,
    );
    if (!decrypted) return false;

    try {
      const parsedVault = JSON.parse(decrypted) as PasswordVault;

      if (parsedVault.globalNotes === undefined) {
        parsedVault.globalNotes = "";
      }

      const migratedVault = migrateVault(parsedVault);

      if (
        migratedVault !== parsedVault ||
        migratedVault.vaultVersion !== parsedVault.vaultVersion
      ) {
        console.log("Vault migration completed, saving...");
        const { ciphertext, nonce } = encrypt(
          JSON.stringify(migratedVault),
          key,
        );
        const newEncryptedVault = {
          ...currentEncryptedVault,
          ciphertext,
          nonce,
        };
        encryptedVault.set(newEncryptedVault);
        cacheVault(newEncryptedVault);
      }

      masterKey.set(key);
      isAuthenticated.set(true);
      loadGitHubAuth();

      if (get(isGitHubAuthenticated)) {
        syncVaultToGitHub().catch(console.error);
      }

      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export function lockVault(): void {
  masterKey.set(null);
  encryptedVault.set(null);
  isAuthenticated.set(false);
}

export async function addPassword(
  entry: Omit<PasswordEntry, "id" | "created" | "modified">,
): Promise<void> {
  const $vault = get(vault);
  if (!browser || !$vault) return;
  const $masterKey = get(masterKey);
  if (!$masterKey) return;
  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return;

  const newEntry: PasswordEntry = {
    ...entry,
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
  };

  const updatedVault: PasswordVault = {
    ...$vault,
    vault: [...$vault.vault, newEntry],
  };

  const { ciphertext, nonce } = encrypt(
    JSON.stringify(updatedVault),
    $masterKey,
  );
  const newEncryptedVault = { ...$encryptedVault, ciphertext, nonce };
  encryptedVault.set(newEncryptedVault);
  cacheVault(newEncryptedVault);

  if (get(isGitHubAuthenticated)) {
    syncVaultToGitHub().catch(console.error);
  }
}

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

  const index = $vault.vault.findIndex((entry) => entry.id === id);
  if (index === -1) return;

  const updatedEntry: PasswordEntry = {
    ...$vault.vault[index],
    ...updates,
    modified: new Date().toISOString(),
  };

  const updatedVault: PasswordVault = {
    ...$vault,
    vault: [
      ...$vault.vault.slice(0, index),
      updatedEntry,
      ...$vault.vault.slice(index + 1),
    ],
  };

  const { ciphertext, nonce } = encrypt(
    JSON.stringify(updatedVault),
    $masterKey,
  );
  const newEncryptedVault = { ...$encryptedVault, ciphertext, nonce };
  encryptedVault.set(newEncryptedVault);
  cacheVault(newEncryptedVault);

  if (get(isGitHubAuthenticated)) {
    syncVaultToGitHub().catch(console.error);
  }
}

export async function deletePassword(id: string): Promise<void> {
  const $vault = get(vault);
  if (!browser || !$vault) return;
  const $masterKey = get(masterKey);
  if (!$masterKey) return;
  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return;

  const updatedVault: PasswordVault = {
    ...$vault,
    vault: $vault.vault.filter((entry) => entry.id !== id),
  };

  const { ciphertext, nonce } = encrypt(
    JSON.stringify(updatedVault),
    $masterKey,
  );
  const newEncryptedVault = { ...$encryptedVault, ciphertext, nonce };
  encryptedVault.set(newEncryptedVault);
  cacheVault(newEncryptedVault);

  if (get(isGitHubAuthenticated)) {
    syncVaultToGitHub().catch(console.error);
  }
}

export { loadVaultFromGitHub, syncVaultToGitHub };
