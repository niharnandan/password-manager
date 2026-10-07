import { browser } from "$app/environment";
import {
  decodeBase64,
  decryptBytes,
  encodeBase64,
  encryptBytes,
  hkdfSha256,
  randomBytes,
  wipeBytes,
} from "./crypto";

const WEBAUTHN_CREDENTIAL_KEY = "webauthn_credential_id";
const WEBAUTHN_ENCRYPTED_KEY = "webauthn_encrypted_key";
const WRAP_KEY_INFO = "password-manager/webauthn-prf-wrap/v2";
const TIMEOUT_MS = 30000;

/**
 * Biometric unlock record. The master key is encrypted under a key derived
 * from the authenticator's PRF output, which the authenticator only releases
 * after user verification. Nothing stored here is enough to recover the
 * master key without the authenticator.
 */
export interface WebAuthnRecord {
  version: 2;
  credentialId: string;
  prfSalt: string;
  /** Salt of the vault key this record unlocks; stale once the key changes. */
  vaultSalt: string;
  nonce: string;
  ciphertext: string;
}

export type WebAuthnAuthResult =
  | { success: true; masterKey: Uint8Array; record: WebAuthnRecord }
  | {
      success: false;
      error: string;
      /** The record can't open the vault any more; delete it. */
      staleRecord?: boolean;
      /** Not a failed verification; the password is the only way in. */
      passwordRequired?: boolean;
    };

export function isWebAuthnSupported(): boolean {
  if (!browser) return false;
  return (
    typeof window.PublicKeyCredential === "function" &&
    !!navigator.credentials?.create &&
    !!navigator.credentials?.get
  );
}

/**
 * Whether the browser reports support for the PRF extension. Returns null
 * when it can't tell (older browsers); registration then checks directly.
 */
export async function getPrfSupport(): Promise<boolean | null> {
  if (!isWebAuthnSupported()) return false;
  try {
    const credentialApi = PublicKeyCredential as typeof PublicKeyCredential & {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    };
    if (typeof credentialApi.getClientCapabilities !== "function") return null;
    const capabilities = await credentialApi.getClientCapabilities();
    const prf = capabilities?.["extension:prf"];
    return typeof prf === "boolean" ? prf : null;
  } catch {
    return null;
  }
}

function isWebAuthnRecord(value: unknown): value is WebAuthnRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 2 &&
    typeof record.credentialId === "string" &&
    typeof record.prfSalt === "string" &&
    typeof record.vaultSalt === "string" &&
    typeof record.nonce === "string" &&
    typeof record.ciphertext === "string"
  );
}

export function getWebAuthnRecord(): WebAuthnRecord | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(WEBAUTHN_ENCRYPTED_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isWebAuthnRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function hasWebAuthnCredential(): boolean {
  return getWebAuthnRecord() !== null;
}

export function clearWebAuthnCredential(): void {
  if (!browser) return;

  localStorage.removeItem(WEBAUTHN_CREDENTIAL_KEY);
  localStorage.removeItem(WEBAUTHN_ENCRYPTED_KEY);
}

/**
 * Deletes biometric data written by older versions, which derived the
 * wrapping key from the credential's public key (stored right next to it),
 * so the master key was readable from localStorage without any biometric
 * check. Returns true if anything was removed.
 */
export function discardLegacyWebAuthnData(): boolean {
  if (!browser) return false;
  const hasData =
    localStorage.getItem(WEBAUTHN_CREDENTIAL_KEY) !== null ||
    localStorage.getItem(WEBAUTHN_ENCRYPTED_KEY) !== null;
  if (!hasData || hasWebAuthnCredential()) return false;
  clearWebAuthnCredential();
  return true;
}

function prfFirstOutput(credential: PublicKeyCredential): Uint8Array | null {
  const first = credential.getClientExtensionResults().prf?.results?.first;
  if (!first) return null;
  if (first instanceof ArrayBuffer) return new Uint8Array(first);
  if (ArrayBuffer.isView(first))
    return new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  return null;
}

async function wrappingKeyFromPrf(prfOutput: Uint8Array): Promise<Uint8Array> {
  try {
    return await hkdfSha256(prfOutput, WRAP_KEY_INFO);
  } finally {
    wipeBytes(prfOutput);
  }
}

async function getAssertion(
  credentialId: Uint8Array,
  prfSalt: Uint8Array,
): Promise<PublicKeyCredential | null> {
  return (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ id: credentialId, type: "public-key" }],
      userVerification: "required",
      timeout: TIMEOUT_MS,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  })) as PublicKeyCredential | null;
}

function describeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  switch (error.name) {
    case "NotAllowedError":
      return "User cancelled or Face ID/Touch ID failed";
    case "InvalidStateError":
      return "Invalid authenticator state - please try again";
    case "NotSupportedError":
      return "WebAuthn not supported on this device";
    case "SecurityError":
      return "Security error - please try again";
    case "AbortError":
      return "Authentication was cancelled";
    default:
      return error.message || fallback;
  }
}

export async function registerWebAuthnCredential(
  masterKey: Uint8Array,
  vaultSalt: string,
): Promise<{ success: boolean; error?: string }> {
  if (!browser || !isWebAuthnSupported()) {
    return { success: false, error: "WebAuthn not supported" };
  }

  // Check if document has focus to avoid focus errors
  if (!document.hasFocus()) {
    return {
      success: false,
      error: "Document not focused. Please click and try again.",
    };
  }

  try {
    const prfSalt = randomBytes(32);
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: {
          name: "Secure Password Manager",
          id: location.hostname,
        },
        user: {
          id: randomBytes(32), // Random handle; no personal data
          name: "Password Manager",
          displayName: "Password Manager",
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" }, // ES256
          { alg: -257, type: "public-key" }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required", // Ensure biometric verification
          residentKey: "preferred",
          requireResidentKey: false,
        },
        attestation: "none",
        timeout: TIMEOUT_MS,
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { success: false, error: "Failed to create credential" };
    }

    const credentialId = new Uint8Array(credential.rawId);
    let prfOutput = prfFirstOutput(credential);
    if (!prfOutput) {
      if (!credential.getClientExtensionResults().prf?.enabled) {
        return {
          success: false,
          error:
            "this browser or authenticator doesn't support the WebAuthn PRF extension, which secure biometric unlock requires",
        };
      }
      // Some authenticators only evaluate the PRF during an assertion.
      const assertion = await getAssertion(credentialId, prfSalt);
      prfOutput = assertion ? prfFirstOutput(assertion) : null;
      if (!prfOutput) {
        return { success: false, error: "Biometric setup was not completed" };
      }
    }

    const wrappingKey = await wrappingKeyFromPrf(prfOutput);
    const { ciphertext, nonce } = encryptBytes(masterKey, wrappingKey);
    wipeBytes(wrappingKey);

    const record: WebAuthnRecord = {
      version: 2,
      credentialId: encodeBase64(credentialId),
      prfSalt: encodeBase64(prfSalt),
      vaultSalt,
      nonce,
      ciphertext,
    };

    localStorage.setItem(WEBAUTHN_ENCRYPTED_KEY, JSON.stringify(record));
    localStorage.setItem(WEBAUTHN_CREDENTIAL_KEY, record.credentialId);

    return { success: true };
  } catch (error) {
    console.error("WebAuthn registration error:", error);
    return {
      success: false,
      error: describeError(error, "Registration failed"),
    };
  }
}

export async function authenticateWithWebAuthn(): Promise<WebAuthnAuthResult> {
  if (!browser || !isWebAuthnSupported()) {
    return { success: false, error: "WebAuthn not supported" };
  }

  // Check if document has focus to avoid focus errors
  if (!document.hasFocus()) {
    return {
      success: false,
      error: "Document not focused. Please click and try again.",
    };
  }

  const record = getWebAuthnRecord();
  if (!record) {
    return { success: false, error: "No WebAuthn credential found" };
  }

  try {
    const assertion = await getAssertion(
      decodeBase64(record.credentialId),
      decodeBase64(record.prfSalt),
    );
    if (!assertion) {
      return { success: false, error: "Authentication failed" };
    }

    const prfOutput = prfFirstOutput(assertion);
    if (!prfOutput) {
      return {
        success: false,
        error:
          "This browser did not return the biometric key. Use your master password.",
        passwordRequired: true,
      };
    }

    const wrappingKey = await wrappingKeyFromPrf(prfOutput);
    const masterKey = decryptBytes(
      record.ciphertext,
      record.nonce,
      wrappingKey,
    );
    wipeBytes(wrappingKey);

    if (!masterKey || masterKey.length !== 32) {
      return {
        success: false,
        error: "Failed to decrypt master key. Please re-register.",
        staleRecord: true,
      };
    }

    return { success: true, masterKey, record };
  } catch (error) {
    console.error("WebAuthn authentication error:", error);
    return {
      success: false,
      error: describeError(error, "Authentication failed"),
    };
  }
}
