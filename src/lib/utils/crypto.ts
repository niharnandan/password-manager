import { browser } from "$app/environment";
import nacl from "tweetnacl";
import util from "tweetnacl-util";
import type { EncryptedVault, KdfParams } from "$lib/types/password";

const NONCE_BYTES = nacl.secretbox.nonceLength;
const KEY_BYTES = nacl.secretbox.keyLength;
export const SALT_BYTES = 24;

/** OWASP's recommended minimum for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;
// Bounds for parameters read from storage: reject obviously tampered values
// and avoid hanging the browser on absurd iteration counts.
const MIN_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 10_000_000;

export const CURRENT_KDF: Readonly<KdfParams> = Object.freeze({
  algorithm: "PBKDF2-SHA256",
  iterations: PBKDF2_ITERATIONS,
});

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function assertBrowser(): void {
  if (!browser)
    throw new Error("Crypto operations can only be performed in the browser");
}

export const encodeBase64 = util.encodeBase64;
export const decodeBase64 = util.decodeBase64;

export function randomBytes(length: number): Uint8Array {
  assertBrowser();
  return nacl.randomBytes(length);
}

/** Random salt for a new vault key, Base64 encoded. */
export function generateSalt(): string {
  return encodeBase64(randomBytes(SALT_BYTES));
}

/** Best-effort removal of key material from memory. */
export function wipeBytes(bytes: Uint8Array | null | undefined): void {
  bytes?.fill(0);
}

/** Constant-time comparison of two equal-length byte arrays. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.length > 0 && nacl.verify(a, b);
}

export function isSupportedKdf(kdf: unknown): kdf is KdfParams {
  if (!kdf || typeof kdf !== "object") return false;
  const { algorithm, iterations } = kdf as Record<string, unknown>;
  return (
    algorithm === "PBKDF2-SHA256" &&
    typeof iterations === "number" &&
    Number.isSafeInteger(iterations) &&
    iterations >= MIN_PBKDF2_ITERATIONS &&
    iterations <= MAX_PBKDF2_ITERATIONS
  );
}

/** True when a vault's KDF is at least as strong as the current default. */
export function isCurrentKdf(kdf: KdfParams | undefined): boolean {
  return (
    !!kdf &&
    kdf.algorithm === CURRENT_KDF.algorithm &&
    kdf.iterations >= CURRENT_KDF.iterations
  );
}

/** Structural validation for vault envelopes read from GitHub or storage. */
export function isEncryptedVault(value: unknown): value is EncryptedVault {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const isBase64 = (field: unknown) =>
    typeof field === "string" && field.length > 0 && BASE64_PATTERN.test(field);
  return (
    isBase64(candidate.salt) &&
    isBase64(candidate.nonce) &&
    isBase64(candidate.ciphertext) &&
    (candidate.kdf === undefined || isSupportedKdf(candidate.kdf))
  );
}

/**
 * Legacy key derivation: one SHA-512 pass over password + salt. Far too fast
 * to resist offline guessing; only used to open old vaults so they can be
 * re-encrypted with PBKDF2.
 */
export function deriveLegacyKey(
  password: string,
  salt: Uint8Array,
): Uint8Array {
  assertBrowser();
  const passwordBytes = util.decodeUTF8(password);
  const material = new Uint8Array(passwordBytes.length + salt.length);
  material.set(passwordBytes);
  material.set(salt, passwordBytes.length);
  const key = nacl.hash(material).slice(0, KEY_BYTES);
  wipeBytes(passwordBytes);
  wipeBytes(material);
  return key;
}

export async function derivePbkdf2Key(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  assertBrowser();
  const passwordBytes = new TextEncoder().encode(password.normalize("NFC"));
  try {
    const baseKey = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      baseKey,
      KEY_BYTES * 8,
    );
    return new Uint8Array(bits);
  } finally {
    wipeBytes(passwordBytes);
  }
}

/** Derives the key for a vault envelope (or anything sharing its salt + KDF). */
export async function deriveVaultKey(
  password: string,
  params: { salt: string; kdf?: KdfParams },
): Promise<Uint8Array> {
  const salt = decodeBase64(params.salt);
  if (!params.kdf) return deriveLegacyKey(password, salt);
  if (!isSupportedKdf(params.kdf))
    throw new Error("Unsupported key derivation parameters");
  return derivePbkdf2Key(password, salt, params.kdf.iterations);
}

/** HKDF-SHA256 with an empty salt, for turning a uniform secret into a key. */
export async function hkdfSha256(
  inputKeyMaterial: Uint8Array,
  info: string,
): Promise<Uint8Array> {
  assertBrowser();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    inputKeyMaterial,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    baseKey,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export function encryptBytes(
  data: Uint8Array,
  key: Uint8Array,
): { ciphertext: string; nonce: string } {
  assertBrowser();
  const nonce = nacl.randomBytes(NONCE_BYTES);
  const ciphertext = nacl.secretbox(data, nonce, key);
  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
  };
}

export function decryptBytes(
  ciphertext: string,
  nonce: string,
  key: Uint8Array,
): Uint8Array | null {
  assertBrowser();
  try {
    const nonceBytes = decodeBase64(nonce);
    if (nonceBytes.length !== NONCE_BYTES || key.length !== KEY_BYTES)
      return null;
    return nacl.secretbox.open(decodeBase64(ciphertext), nonceBytes, key);
  } catch {
    return null;
  }
}

export const encrypt = (
  data: string,
  key: Uint8Array,
): { ciphertext: string; nonce: string } =>
  encryptBytes(util.decodeUTF8(data), key);

export const decrypt = (
  ciphertext: string,
  nonce: string,
  key: Uint8Array,
): string | null => {
  const decrypted = decryptBytes(ciphertext, nonce, key);
  if (!decrypted) return null;
  try {
    return util.encodeUTF8(decrypted);
  } catch {
    return null;
  }
};
