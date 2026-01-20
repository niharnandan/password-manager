// Password entry type for individual passwords
export interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  created: string;
  modified: string;
}

// Legacy password entry with category field (for migration)
export interface LegacyPasswordEntry extends PasswordEntry {
  category?: string;
}

// Vault type for storing the entire encrypted collection
export interface PasswordVault {
  version: string;
  vaultVersion?: number; // Track data schema version for migrations
  vault: PasswordEntry[];
  globalNotes: string; // Added global notes field
  verification: {
    marker: string;
    version: string;
  };
}

// Type for encrypted vault data
export interface EncryptedVault {
  salt: string;
  nonce: string;
  ciphertext: string;
}
