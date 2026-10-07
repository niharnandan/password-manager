import { derived, writable, get } from "svelte/store";
import { browser } from "$app/environment";
import {
  endGitHubSession,
  getGitHubConfig,
  GITHUB_REPO,
  rememberGitHubToken,
  startGitHubSession,
  unwrapGitHubToken,
} from "$lib/stores/github-auth";
import {
  constantTimeEqual,
  CURRENT_KDF,
  decrypt,
  deriveVaultKey,
  encrypt,
  generateSalt,
  isCurrentKdf,
  wipeBytes,
} from "$lib/utils/crypto";
import {
  downloadVaultFromGitHub,
  resetRepoVerification,
  uploadVaultToGitHub,
} from "$lib/utils/github-sync";
import {
  cacheVault,
  clearStoredGitHubToken,
  getCachedVault,
  isSyncPending,
  readStoredGitHubToken,
  setSyncPending,
} from "$lib/utils/local-storage";
import {
  flushPendingSecurityEvents,
  getPendingSecurityEventCount,
} from "$lib/utils/security-monitor";
import {
  authenticateWithWebAuthn,
  clearWebAuthnCredential,
  getWebAuthnRecord,
  registerWebAuthnCredential,
} from "$lib/utils/webauthn";
import type { GitHubConfig, VaultDownloadResult } from "$lib/utils/github-sync";
import type {
  EncryptedVault,
  KdfParams,
  PasswordEntry,
  PasswordVault,
} from "$lib/types/password";

const CURRENT_VAULT_VERSION = 2;
export const MIN_MASTER_PASSWORD_LENGTH = 12;

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
    // v1 -> v2: drop the removed `category` field.
    const migratedEntries = vault.vault.map((entry) => {
      const rest: Record<string, unknown> = { ...entry };
      delete rest.category;
      return rest as unknown as PasswordEntry;
    });

    return {
      ...vault,
      vault: migratedEntries,
      vaultVersion: CURRENT_VAULT_VERSION,
    };
  }

  return vault;
}

interface SyncStatus {
  syncing: boolean;
  lastSync: Date | null;
  error: string | null;
}

const idleSyncStatus = (): SyncStatus => ({
  syncing: false,
  lastSync: null,
  error: null,
});

export const masterKey = writable<Uint8Array | null>(null);
export const isAuthenticated = writable<boolean>(false);
export const syncStatus = writable<SyncStatus>(idleSyncStatus());
export const encryptedVault = writable<EncryptedVault | null>(null);
/** Messages shown in the vault view after unlocking (sync problems, lockouts). */
export const notices = writable<string[]>([]);

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

export type UnlockResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * Only "wrong-password" means the password failed to open any copy of
       * the vault; the other reasons must not count as failed attempts.
       */
      reason:
        | "wrong-password"
        | "needs-password"
        | "needs-token"
        | "token-rejected"
        | "no-vault"
        | "error";
      message: string;
    };

const failure = (
  reason: Exclude<UnlockResult, { ok: true }>["reason"],
  message: string,
): UnlockResult => ({ ok: false, reason, message });

interface OpenedVault {
  envelope: EncryptedVault;
  key: Uint8Array;
  plain: PasswordVault;
}

/** Set when the GitHub copy can't be opened with our key; blocks uploads. */
let syncBlockedReason: string | null = null;

const TOKEN_REJECTED =
  "GitHub rejected the access token (it may have expired or been revoked).";

/** GitHub answered 401: the token itself is invalid, not just unreachable. */
const isTokenRejected = (download: VaultDownloadResult | null) =>
  download?.status === "error" && download.httpStatus === 401;

const REMOTE_KEY_MISMATCH =
  "The vault on GitHub is encrypted with a different master password (was it changed on another device?). Sync is paused: log out and unlock with your current master password.";

function openVault(
  envelope: EncryptedVault,
  key: Uint8Array,
): PasswordVault | null {
  const json = decrypt(envelope.ciphertext, envelope.nonce, key);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as PasswordVault;
    return parsed && Array.isArray(parsed.vault) ? parsed : null;
  } catch {
    return null;
  }
}

function sealVault(
  plain: PasswordVault,
  key: Uint8Array,
  salt: string,
  kdf: KdfParams | undefined,
): EncryptedVault {
  const { ciphertext, nonce } = encrypt(JSON.stringify(plain), key);
  return kdf ? { salt, nonce, ciphertext, kdf } : { salt, nonce, ciphertext };
}

/** Derives keys for one unlock attempt, reusing results for identical salts. */
function createKeyDeriver(password: string) {
  const cache = new Map<string, Promise<Uint8Array>>();

  const derive = (params: { salt: string; kdf?: KdfParams }) => {
    const id = `${params.kdf ? `${params.kdf.algorithm}:${params.kdf.iterations}` : "legacy"}|${params.salt}`;
    let pending = cache.get(id);
    if (!pending) {
      pending = deriveVaultKey(password, params);
      cache.set(id, pending);
    }
    return pending;
  };

  const tryOpen = async (
    envelope: EncryptedVault,
  ): Promise<OpenedVault | null> => {
    try {
      const key = await derive(envelope);
      const plain = openVault(envelope, key);
      return plain ? { envelope, key, plain } : null;
    } catch {
      return null;
    }
  };

  const wipeAllExcept = async (keep: Uint8Array | null) => {
    for (const pending of cache.values()) {
      try {
        const key = await pending;
        if (key !== keep) wipeBytes(key);
      } catch {
        // Derivation failed; nothing to wipe.
      }
    }
    cache.clear();
  };

  return { derive, tryOpen, wipeAllExcept };
}

interface CommitOptions {
  envelope: EncryptedVault;
  key: Uint8Array;
  token: string | null;
  download: VaultDownloadResult | null;
  needsUpload: boolean;
  adoptedRemote: boolean;
  blockedReason: string | null;
  messages: string[];
}

/** Installs an opened vault as the active session. */
function commitUnlock(options: CommitOptions): void {
  const { envelope, key, token, download, blockedReason, messages } = options;

  syncBlockedReason = blockedReason;
  encryptedVault.set(envelope);
  masterKey.set(key);
  cacheVault(envelope);
  // The pending flag means "this device has edits GitHub hasn't seen". Only
  // edits set it; unlocking only clears it when GitHub's copy replaced ours.
  if (options.adoptedRemote) setSyncPending(false);

  let config: GitHubConfig | null = null;
  if (token && !isTokenRejected(download)) {
    config = startGitHubSession(token);
    if (envelope.kdf)
      rememberGitHubToken(token, key, envelope.salt, envelope.kdf);
  } else {
    endGitHubSession();
    if (token) {
      clearStoredGitHubToken();
      messages.push(
        `${TOKEN_REJECTED} Sync is off; log out and enter a new token to turn it back on.`,
      );
    } else {
      messages.push(
        "GitHub sync is off on this device. To turn it on, log out and enter your GitHub access token when unlocking.",
      );
    }
  }

  const record = getWebAuthnRecord();
  if (record && record.vaultSalt !== envelope.salt) {
    clearWebAuthnCredential();
    messages.push(
      "Biometric unlock was turned off because your vault's encryption key changed. You can turn it on again the next time you unlock with your password.",
    );
  }

  if (blockedReason) {
    syncStatus.set({ syncing: false, lastSync: null, error: blockedReason });
  } else if (!download) {
    syncStatus.set(idleSyncStatus());
  } else if (download.status === "ok") {
    syncStatus.set({ syncing: false, lastSync: new Date(), error: null });
  } else if (download.status === "not-found") {
    syncStatus.set({
      syncing: false,
      lastSync: null,
      error: "No vault on GitHub yet; uploading this device's copy",
    });
  } else {
    syncStatus.set({
      syncing: false,
      lastSync: null,
      error: `Using cached vault (offline): ${download.error}`,
    });
  }

  const pendingEvents = getPendingSecurityEventCount();
  if (pendingEvents > 0) {
    messages.push(
      `${pendingEvents} failed-login lockout${pendingEvents === 1 ? " was" : "s were"} recorded on this device since it was last unlocked. Details are in security-log.json in your vault repository.`,
    );
  }

  notices.set(messages);
  isAuthenticated.set(true);

  if (options.needsUpload && config && !blockedReason) {
    void syncVaultToGitHub();
  }
  if (config && pendingEvents > 0) {
    void flushPendingSecurityEvents(config);
  }
}

/**
 * Unlocks with the master password. Tries the GitHub copy and the local
 * cache, upgrades legacy encryption, and stores the GitHub token (typed now,
 * or previously saved on this device) encrypted under the vault key.
 */
export async function unlockVault(
  password: string,
  options: { token?: string } = {},
): Promise<UnlockResult> {
  if (!browser) return failure("error", "Unavailable outside the browser");
  if (!password) return failure("error", "Enter your master password.");

  const deriver = createKeyDeriver(password);
  const local = getCachedVault();
  const pending = isSyncPending();

  let token = options.token?.trim() || null;
  let storedTokenRejected = false;
  if (!token) {
    const stored = readStoredGitHubToken();
    if (stored) {
      try {
        token = unwrapGitHubToken(stored, await deriver.derive(stored));
      } catch {
        token = null;
      }
      storedTokenRejected = token === null;
    }
  }

  let download: VaultDownloadResult | null = null;
  if (token) {
    syncStatus.set({ syncing: true, lastSync: null, error: null });
    download = await downloadVaultFromGitHub({ ...GITHUB_REPO, token });
    syncStatus.set(idleSyncStatus());
  }
  const remote = download?.status === "ok" ? download.vault : null;

  const remoteOpened = remote ? await deriver.tryOpen(remote) : null;
  const localOpened = local ? await deriver.tryOpen(local) : null;

  const messages: string[] = [];
  let opened: OpenedVault;
  let needsUpload = false;
  let adoptedRemote = false;
  let blockedReason: string | null = null;

  if (remoteOpened) {
    if (pending && localOpened) {
      // This device has changes GitHub hasn't seen: last write wins.
      opened = localOpened;
      needsUpload = true;
    } else {
      opened = remoteOpened;
      adoptedRemote = true;
      if (pending && local) {
        messages.push(
          "Unsynced changes on this device were encrypted with a different master password and could not be kept.",
        );
      }
    }
  } else if (localOpened) {
    opened = localOpened;
    if (remote) {
      blockedReason = REMOTE_KEY_MISMATCH;
    } else if (download?.status === "invalid") {
      blockedReason = `Sync is paused: ${download.error}.`;
    } else if (download?.status === "not-found" || pending) {
      needsUpload = true;
    }
  } else {
    await deriver.wipeAllExcept(null);
    if (remote || local || storedTokenRejected) {
      return failure("wrong-password", "Invalid master password.");
    }
    if (!token) {
      return failure(
        "needs-token",
        "Enter your GitHub access token to download your vault on this device.",
      );
    }
    if (isTokenRejected(download)) {
      // Reaching here with a stored token means the password unwrapped it.
      clearStoredGitHubToken();
      return failure("token-rejected", `${TOKEN_REJECTED} Enter a new one.`);
    }
    if (download?.status === "not-found") {
      return failure(
        "no-vault",
        "No vault found in the GitHub repository, or the token can't access it.",
      );
    }
    return failure(
      "error",
      download && download.status !== "ok"
        ? download.error
        : "Could not load your vault.",
    );
  }

  // A re-encrypted copy may only be uploaded when GitHub's copy is known to
  // be older (just adopted, or missing). Otherwise this device's cache may be
  // stale, and uploading it would overwrite newer changes from elsewhere.
  const remoteKnownOlder = adoptedRemote || download?.status === "not-found";
  let { envelope, key } = opened;
  const plain = migrateVault(opened.plain);
  if (!isCurrentKdf(envelope.kdf)) {
    // Re-encrypt with PBKDF2 (fresh salt). Old copies in the repository's
    // git history keep the weak encryption; changing the master password is
    // the only way to make them useless.
    const salt = generateSalt();
    key = await deriveVaultKey(password, { salt, kdf: CURRENT_KDF });
    envelope = sealVault(plain, key, salt, CURRENT_KDF);
    if (remoteKnownOlder) needsUpload = true;
  } else if (plain !== opened.plain) {
    envelope = sealVault(plain, key, envelope.salt, envelope.kdf);
    if (remoteKnownOlder) needsUpload = true;
  }

  await deriver.wipeAllExcept(key);
  commitUnlock({
    envelope,
    key,
    token,
    download,
    needsUpload,
    adoptedRemote,
    blockedReason,
    messages,
  });
  return { ok: true };
}

/** Unlocks with the biometric record created by enableBiometricUnlock(). */
export async function unlockWithBiometrics(): Promise<UnlockResult> {
  if (!browser) return failure("error", "Unavailable outside the browser");

  const auth = await authenticateWithWebAuthn();
  if (!auth.success) {
    if (auth.staleRecord) {
      clearWebAuthnCredential();
      return failure(
        "needs-password",
        "Biometric unlock is out of date on this device. Unlock with your master password, then turn it on again.",
      );
    }
    if (auth.passwordRequired) return failure("needs-password", auth.error);
    return failure("error", auth.error);
  }

  const { masterKey: key, record } = auth;
  const local = getCachedVault();
  const pending = isSyncPending();

  const stored = readStoredGitHubToken();
  const token =
    stored && stored.salt === record.vaultSalt
      ? unwrapGitHubToken(stored, key)
      : null;

  let download: VaultDownloadResult | null = null;
  if (token) {
    syncStatus.set({ syncing: true, lastSync: null, error: null });
    download = await downloadVaultFromGitHub({ ...GITHUB_REPO, token });
    syncStatus.set(idleSyncStatus());
  }
  const remote = download?.status === "ok" ? download.vault : null;

  const openWithKey = (envelope: EncryptedVault | null) =>
    envelope && envelope.salt === record.vaultSalt
      ? openVault(envelope, key)
      : null;
  const remotePlain = openWithKey(remote);
  const localPlain = openWithKey(local);

  let opened: OpenedVault;
  let needsUpload = false;
  let adoptedRemote = false;
  let blockedReason: string | null = null;

  if (remote && remotePlain) {
    if (pending && local && localPlain) {
      opened = { envelope: local, key, plain: localPlain };
      needsUpload = true;
    } else {
      opened = { envelope: remote, key, plain: remotePlain };
      adoptedRemote = true;
    }
  } else if (local && localPlain && !remote) {
    opened = { envelope: local, key, plain: localPlain };
    if (download?.status === "invalid") {
      blockedReason = `Sync is paused: ${download.error}.`;
    } else if (download?.status === "not-found" || pending) {
      needsUpload = true;
    }
  } else if (local && localPlain) {
    // GitHub has a copy this key can't open: it was re-encrypted elsewhere
    // (new password or upgraded encryption). The password can open it.
    wipeBytes(key);
    return failure(
      "needs-password",
      "Your vault was re-encrypted on another device. Unlock with your master password.",
    );
  } else {
    wipeBytes(key);
    clearWebAuthnCredential();
    return failure(
      "needs-password",
      "Biometric unlock is out of date on this device. Unlock with your master password, then turn it on again.",
    );
  }

  let envelope = opened.envelope;
  const plain = migrateVault(opened.plain);
  if (plain !== opened.plain) {
    envelope = sealVault(plain, key, envelope.salt, envelope.kdf);
    // Same rule as unlockVault: never push a possibly stale cache.
    if (adoptedRemote || download?.status === "not-found") needsUpload = true;
  }

  commitUnlock({
    envelope,
    key,
    token,
    download,
    needsUpload,
    adoptedRemote,
    blockedReason,
    messages: [],
  });
  return { ok: true };
}

/** Registers a platform authenticator that can unlock the current vault key. */
export async function enableBiometricUnlock(): Promise<{
  success: boolean;
  error?: string;
}> {
  const key = get(masterKey);
  const envelope = get(encryptedVault);
  if (!key || !envelope) return { success: false, error: "Vault is locked" };

  const keyCopy = key.slice();
  try {
    return await registerWebAuthnCredential(keyCopy, envelope.salt);
  } finally {
    wipeBytes(keyCopy);
  }
}

export function lockVault(): void {
  const key = get(masterKey);
  isAuthenticated.set(false);
  masterKey.set(null);
  encryptedVault.set(null);
  wipeBytes(key);
  endGitHubSession();
  resetRepoVerification();
  syncBlockedReason = null;
  syncStatus.set(idleSyncStatus());
  notices.set([]);
}

async function uploadLatestVault(): Promise<boolean> {
  const config = getGitHubConfig();
  const envelope = get(encryptedVault);
  if (!config || !envelope) return false;

  if (syncBlockedReason) {
    syncStatus.set({
      syncing: false,
      lastSync: null,
      error: syncBlockedReason,
    });
    return false;
  }

  syncStatus.update((s) => ({ ...s, syncing: true, error: null }));
  const result = await uploadVaultToGitHub(envelope, config);

  // The vault was locked while uploading; leave state for the next unlock.
  if (getGitHubConfig() !== config) return result.success;

  if (result.success) {
    if (get(encryptedVault) === envelope) setSyncPending(false);
    syncStatus.set({ syncing: false, lastSync: new Date(), error: null });
  } else {
    syncStatus.update((s) => ({
      ...s,
      syncing: false,
      error: result.error || "Upload failed",
    }));
  }
  return result.success;
}

let activeSync: Promise<boolean> | null = null;
let syncRequestedAgain = false;

/**
 * Uploads the current vault. Calls made while an upload is running are
 * coalesced into one more upload of the latest state, so rapid edits can't
 * race each other or leave GitHub behind.
 */
export function syncVaultToGitHub(): Promise<boolean> {
  if (activeSync) {
    syncRequestedAgain = true;
    return activeSync;
  }

  activeSync = (async () => {
    try {
      let ok = false;
      do {
        syncRequestedAgain = false;
        ok = await uploadLatestVault();
      } while (syncRequestedAgain);
      return ok;
    } finally {
      activeSync = null;
    }
  })();
  return activeSync;
}

/** Manual sync: pushes pending local changes, otherwise pulls GitHub's copy. */
export async function refreshFromGitHub(): Promise<void> {
  const config = getGitHubConfig();
  const key = get(masterKey);
  const current = get(encryptedVault);
  if (!config || !key || !current) return;

  if (isSyncPending() && !syncBlockedReason) {
    await syncVaultToGitHub();
    return;
  }

  syncStatus.update((s) => ({ ...s, syncing: true, error: null }));
  const download = await downloadVaultFromGitHub(config);
  if (getGitHubConfig() !== config || get(masterKey) !== key) return;

  if (download.status === "ok") {
    const remote = download.vault;
    const remotePlain =
      remote.salt === current.salt ? openVault(remote, key) : null;
    if (!remotePlain) {
      syncBlockedReason = REMOTE_KEY_MISMATCH;
      syncStatus.set({
        syncing: false,
        lastSync: null,
        error: REMOTE_KEY_MISMATCH,
      });
      return;
    }

    syncBlockedReason = null;
    if (isSyncPending() || get(encryptedVault) !== current) {
      // Local changes happened meanwhile; they win.
      syncStatus.update((s) => ({ ...s, syncing: false }));
      void syncVaultToGitHub();
      return;
    }
    if (remote.ciphertext !== current.ciphertext) {
      encryptedVault.set(remote);
      cacheVault(remote);
    }
    syncStatus.set({ syncing: false, lastSync: new Date(), error: null });
  } else if (download.status === "not-found") {
    // Nothing on GitHub to lose: restore it from this device.
    syncStatus.update((s) => ({ ...s, syncing: false }));
    await syncVaultToGitHub();
  } else {
    syncStatus.update((s) => ({
      ...s,
      syncing: false,
      error: download.error,
    }));
  }
}

/** Re-encrypts and stores an updated vault, then syncs it in the background. */
function saveVault(updated: PasswordVault): void {
  const envelope = get(encryptedVault);
  const key = get(masterKey);
  if (!browser || !envelope || !key) return;

  const next = sealVault(updated, key, envelope.salt, envelope.kdf);
  encryptedVault.set(next);
  cacheVault(next);
  setSyncPending(true);
  void syncVaultToGitHub();
}

export async function addPassword(
  entry: Omit<PasswordEntry, "id" | "created" | "modified">,
): Promise<void> {
  const $vault = get(vault);
  if (!browser || !$vault) return;

  const now = new Date().toISOString();
  const newEntry: PasswordEntry = {
    ...entry,
    id: crypto.randomUUID(),
    created: now,
    modified: now,
  };

  saveVault({ ...$vault, vault: [...$vault.vault, newEntry] });
}

export async function updatePassword(
  id: string,
  updates: Partial<Omit<PasswordEntry, "id" | "created">>,
): Promise<void> {
  const $vault = get(vault);
  if (!browser || !$vault) return;

  const index = $vault.vault.findIndex((entry) => entry.id === id);
  if (index === -1) return;

  const updatedEntry: PasswordEntry = {
    ...$vault.vault[index],
    ...updates,
    modified: new Date().toISOString(),
  };

  saveVault({
    ...$vault,
    vault: [
      ...$vault.vault.slice(0, index),
      updatedEntry,
      ...$vault.vault.slice(index + 1),
    ],
  });
}

export async function deletePassword(id: string): Promise<void> {
  const $vault = get(vault);
  if (!browser || !$vault) return;

  saveVault({
    ...$vault,
    vault: $vault.vault.filter((entry) => entry.id !== id),
  });
}

/**
 * Re-encrypts the vault under a new master password (fresh salt) and
 * uploads it. Biometric unlock is reset because it wraps the old key.
 */
export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string; warning?: string }> {
  const key = get(masterKey);
  const envelope = get(encryptedVault);
  const plain = get(vault);
  if (!browser || !key || !envelope || !plain) {
    return { success: false, error: "The vault is locked." };
  }
  if (syncBlockedReason) {
    return {
      success: false,
      error:
        "Sync is paused because the vault on GitHub uses a different key. Resolve that before changing your master password.",
    };
  }
  if (newPassword.length < MIN_MASTER_PASSWORD_LENGTH) {
    return {
      success: false,
      error: `Use at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`,
    };
  }
  if (newPassword === currentPassword) {
    return {
      success: false,
      error: "The new master password must be different from the current one.",
    };
  }

  let currentKey: Uint8Array;
  try {
    currentKey = await deriveVaultKey(currentPassword, envelope);
  } catch {
    return { success: false, error: "Could not verify the current password." };
  }
  const currentMatches = constantTimeEqual(currentKey, key);
  wipeBytes(currentKey);
  if (!currentMatches) {
    return { success: false, error: "Current master password is incorrect." };
  }

  const salt = generateSalt();
  const newKey = await deriveVaultKey(newPassword, { salt, kdf: CURRENT_KDF });
  if (get(masterKey) !== key || get(encryptedVault) !== envelope) {
    wipeBytes(newKey);
    return {
      success: false,
      error: "The vault changed while updating. Please try again.",
    };
  }

  const next = sealVault(plain, newKey, salt, CURRENT_KDF);
  encryptedVault.set(next);
  masterKey.set(newKey);
  wipeBytes(key);
  cacheVault(next);
  setSyncPending(true);

  const config = getGitHubConfig();
  if (config) rememberGitHubToken(config.token, newKey, salt, CURRENT_KDF);
  if (getWebAuthnRecord()) clearWebAuthnCredential();

  if (!config) {
    return {
      success: true,
      warning:
        "GitHub sync is off on this device, so the vault on GitHub still uses the old password.",
    };
  }
  const uploaded = await syncVaultToGitHub();
  return uploaded
    ? { success: true }
    : {
        success: true,
        warning:
          "Saved on this device, but the upload to GitHub failed. It will retry with your next change or sync.",
      };
}
