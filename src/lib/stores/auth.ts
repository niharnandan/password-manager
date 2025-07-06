import { browser } from "$app/environment";
import { writable } from "svelte/store";
import {
  encrypt,
  decrypt,
  deriveKey,
  generateSalt,
  saltToString,
  stringToSalt,
  createVerificationObject,
  verifyPassword,
} from "$lib/utils/crypto";
import type { EncryptedVault } from "$lib/types/password";

// Store to track if user is authenticated
export const isAuthenticated = writable(false);

// Store to keep the master key in memory (never persisted)
export const masterKey = writable<Uint8Array | null>(null);

// Initialize vault when app starts
export const initializeVault = async (
  password: string,
): Promise<EncryptedVault> => {
  if (!browser) {
    throw new Error("Vault operations can only be performed in the browser");
  }

  // Generate a new salt
  const salt = generateSalt();

  // Derive key from password
  const key = deriveKey(password, salt);

  // Create and encrypt verification object
  const verificationObj = createVerificationObject();
  const { ciphertext: encryptedVerification, nonce: verificationNonce } =
    encrypt(verificationObj, key);

  // Create initial empty vault
  const emptyVault = JSON.stringify({
    version: "1.0",
    vault: [],
    verification: {
      marker: "VALID_VAULT",
      version: "1.0",
    },
  });

  // Encrypt the empty vault
  const { ciphertext, nonce } = encrypt(emptyVault, key);

  // Create the encrypted vault object
  const encryptedVault: EncryptedVault = {
    salt: saltToString(salt),
    nonce,
    ciphertext,
  };

  // Store the encryption key in memory
  masterKey.set(key);
  isAuthenticated.set(true);

  return encryptedVault;
};

// Unlock the vault with master password
export const unlockVault = async (
  password: string,
  encryptedVault: EncryptedVault,
): Promise<boolean> => {
  if (!browser) {
    throw new Error("Vault operations can only be performed in the browser");
  }

  try {
    // Convert salt string back to Uint8Array
    const salt = stringToSalt(encryptedVault.salt);

    // Derive key from password and salt
    const key = deriveKey(password, salt);

    // Attempt to decrypt the vault
    const decrypted = decrypt(
      encryptedVault.ciphertext,
      encryptedVault.nonce,
      key,
    );

    // If decryption fails, return false
    if (!decrypted) return false;

    try {
      // Verify the decrypted content is valid JSON
      JSON.parse(decrypted);

      // Store the key in memory
      masterKey.set(key);
      isAuthenticated.set(true);

      return true;
    } catch (e) {
      return false;
    }
  } catch (e) {
    return false;
  }
};

// Lock the vault (clear the key from memory)
export const lockVault = (): void => {
  masterKey.set(null);
  isAuthenticated.set(false);
};
