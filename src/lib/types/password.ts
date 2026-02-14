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

export interface PasswordVault {
  version: string;
  vaultVersion?: number;
  vault: PasswordEntry[];
  globalNotes: string;
  verification: {
    marker: string;
    version: string;
  };
}

export interface EncryptedVault {
  salt: string;
  nonce: string;
  ciphertext: string;
}
