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

/** Parameters of the password-based key derivation used to encrypt a vault. */
export interface KdfParams {
  algorithm: "PBKDF2-SHA256";
  iterations: number;
}

export interface EncryptedVault {
  salt: string;
  nonce: string;
  ciphertext: string;
  /**
   * Absent on legacy vaults, whose key was a single SHA-512 pass over
   * password + salt. Those are re-encrypted with PBKDF2 on the next
   * password unlock.
   */
  kdf?: KdfParams;
}
