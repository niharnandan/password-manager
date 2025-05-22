import { derived, writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { persistentStore } from '$lib/utils/persistent-store';
import { 
  encrypt, 
  decrypt, 
  deriveKey, 
  generateSalt, 
  saltToString, 
  stringToSalt, 
  createVerificationObject, 
  verifyPassword 
} from '$lib/utils/crypto';
import type { PasswordEntry, PasswordVault, EncryptedVault } from '$lib/types/password';

// Store for the master key (never persisted)
export const masterKey = writable<Uint8Array | null>(null);

// Store for authentication state
export const isAuthenticated = writable<boolean>(false);

// Store for the encrypted vault (persisted to localStorage)
export const encryptedVault = persistentStore<EncryptedVault | null>('vault', null);

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
        $masterKey
      );

      if (!decrypted) {
        set(null);
        return;
      }

      set(JSON.parse(decrypted) as PasswordVault);
    } catch (error) {
      console.error('Error decrypting vault:', error);
      set(null);
    }
  },
  null as PasswordVault | null
);

// Initialize a new vault with master password
export function initializeVault(password: string): void {
  if (!browser) return;

  try {
    // Generate a new salt
    const salt = generateSalt();
    
    // Derive key from password
    const key = deriveKey(password, salt);
    
    // Create verification object
    const verificationObj = createVerificationObject();
    
    // Create initial empty vault
    const emptyVault: PasswordVault = {
      version: "1.0",
      vault: [],
      globalNotes: "", // Initialize empty global notes
      verification: {
        marker: "VALID_VAULT",
        version: "1.0"
      }
    };
    
    // Encrypt the empty vault
    const { ciphertext, nonce } = encrypt(JSON.stringify(emptyVault), key);
    
    // Store encrypted vault
    encryptedVault.set({
      salt: saltToString(salt),
      nonce,
      ciphertext
    });
    
    // Set master key in memory
    masterKey.set(key);
    isAuthenticated.set(true);
  } catch (error) {
    console.error('Error initializing vault:', error);
    throw error;
  }
}

// Unlock the vault with master password
export function unlockVault(password: string): boolean {
  if (!browser) return false;
  
  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return false;
  
  try {
    // Convert salt string back to Uint8Array
    const salt = stringToSalt($encryptedVault.salt);
    
    // Derive key from password and salt
    const key = deriveKey(password, salt);
    
    // Attempt to decrypt the vault
    const decrypted = decrypt($encryptedVault.ciphertext, $encryptedVault.nonce, key);
    
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
      
      return true;
    } catch (e) {
      return false;
    }
  } catch (e) {
    return false;
  }
}

// Lock the vault (clear the key from memory)
export function lockVault(): void {
  masterKey.set(null);
  isAuthenticated.set(false);
}

// Add a password to the vault
export function addPassword(entry: Omit<PasswordEntry, 'id' | 'created' | 'modified'>): void {
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
    modified: new Date().toISOString()
  };
  
  // Add the entry to the vault
  const updatedVault: PasswordVault = {
    ...$vault,
    vault: [...$vault.vault, newEntry]
  };
  
  // Encrypt the updated vault
  const { ciphertext, nonce } = encrypt(JSON.stringify(updatedVault), $masterKey);
  
  // Update the encrypted vault
  encryptedVault.set({
    ...$encryptedVault,
    ciphertext,
    nonce
  });
}

// Update a password in the vault
export function updatePassword(id: string, updates: Partial<Omit<PasswordEntry, 'id' | 'created'>>): void {
  const $vault = get(vault);
  if (!browser || !$vault) return;
  
  const $masterKey = get(masterKey);
  if (!$masterKey) return;
  
  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return;
  
  // Find the password entry
  const index = $vault.vault.findIndex(entry => entry.id === id);
  if (index === -1) return;
  
  // Update the entry
  const updatedEntry: PasswordEntry = {
    ...$vault.vault[index],
    ...updates,
    modified: new Date().toISOString()
  };
  
  // Update the vault
  const updatedVault: PasswordVault = {
    ...$vault,
    vault: [
      ...$vault.vault.slice(0, index),
      updatedEntry,
      ...$vault.vault.slice(index + 1)
    ]
  };
  
  // Encrypt the updated vault
  const { ciphertext, nonce } = encrypt(JSON.stringify(updatedVault), $masterKey);
  
  // Update the encrypted vault
  encryptedVault.set({
    ...$encryptedVault,
    ciphertext,
    nonce
  });
}

// Delete a password from the vault
export function deletePassword(id: string): void {
  const $vault = get(vault);
  if (!browser || !$vault) return;
  
  const $masterKey = get(masterKey);
  if (!$masterKey) return;
  
  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return;
  
  // Filter out the password entry
  const updatedVault: PasswordVault = {
    ...$vault,
    vault: $vault.vault.filter(entry => entry.id !== id)
  };
  
  // Encrypt the updated vault
  const { ciphertext, nonce } = encrypt(JSON.stringify(updatedVault), $masterKey);
  
  // Update the encrypted vault
  encryptedVault.set({
    ...$encryptedVault,
    ciphertext,
    nonce
  });
}

// Update global notes
export function updateGlobalNotes(notes: string): void {
  const $vault = get(vault);
  if (!browser || !$vault) return;
  
  const $masterKey = get(masterKey);
  if (!$masterKey) return;
  
  const $encryptedVault = get(encryptedVault);
  if (!$encryptedVault) return;
  
  // Update the vault with new global notes
  const updatedVault: PasswordVault = {
    ...$vault,
    globalNotes: notes
  };
  
  // Encrypt the updated vault
  const { ciphertext, nonce } = encrypt(JSON.stringify(updatedVault), $masterKey);
  
  // Update the encrypted vault
  encryptedVault.set({
    ...$encryptedVault,
    ciphertext,
    nonce
  });
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
    console.error('Error importing vault:', e);
    return false;
  }
}