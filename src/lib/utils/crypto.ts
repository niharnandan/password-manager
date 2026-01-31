import { browser } from "$app/environment";
import nacl from "tweetnacl";
import util from "tweetnacl-util";

// Constants for cryptographic operations
const SALT_BYTES = 24;
const NONCE_BYTES = nacl.secretbox.nonceLength;
const KEY_BYTES = nacl.secretbox.keyLength;

// Generate a random salt for key derivation
export const generateSalt = (): Uint8Array => {
  if (!browser) {
    throw new Error("Crypto operations can only be performed in the browser");
  }
  return nacl.randomBytes(SALT_BYTES);
};

// Convert salt to base64 for storage
export const saltToString = (salt: Uint8Array): string => {
  return util.encodeBase64(salt);
};

// Convert base64 salt to Uint8Array
export const stringToSalt = (saltStr: string): Uint8Array => {
  return util.decodeBase64(saltStr);
};

// Derive encryption key from master password and salt
export const deriveKey = (password: string, salt: Uint8Array): Uint8Array => {
  if (!browser) {
    throw new Error("Crypto operations can only be performed in the browser");
  }

  // Convert password to bytes
  const passwordBytes = util.decodeUTF8(password);

  // Combine password and salt for key derivation
  // Note: In a production environment, a more robust KDF like Argon2id or PBKDF2
  // with high iteration count would be preferred
  const material = new Uint8Array(passwordBytes.length + salt.length);
  material.set(passwordBytes);
  material.set(salt, passwordBytes.length);

  // Use SHA-512 hash (via nacl.hash) and truncate to the key size needed by secretbox
  return nacl.hash(material).slice(0, KEY_BYTES);
};

// Encrypt data with derived key
export const encrypt = (
  data: string,
  key: Uint8Array,
): { ciphertext: string; nonce: string } => {
  if (!browser) {
    throw new Error("Crypto operations can only be performed in the browser");
  }

  // Generate a random nonce
  const nonce = nacl.randomBytes(NONCE_BYTES);

  // Convert data to Uint8Array for encryption
  const messageBytes = util.decodeUTF8(data);

  // Encrypt the data using NaCl secretbox
  const ciphertext = nacl.secretbox(messageBytes, nonce, key);

  // Return base64 encoded values for storage
  return {
    ciphertext: util.encodeBase64(ciphertext),
    nonce: util.encodeBase64(nonce),
  };
};

// Decrypt data with derived key
export const decrypt = (
  ciphertext: string,
  nonce: string,
  key: Uint8Array,
): string | null => {
  if (!browser) {
    throw new Error("Crypto operations can only be performed in the browser");
  }

  // Convert base64 strings to Uint8Array
  const ciphertextBytes = util.decodeBase64(ciphertext);
  const nonceBytes = util.decodeBase64(nonce);

  // Decrypt the data
  const decrypted = nacl.secretbox.open(ciphertextBytes, nonceBytes, key);

  // If decryption fails, return null
  if (!decrypted) return null;

  // Convert decrypted bytes to string
  return util.encodeUTF8(decrypted);
};
