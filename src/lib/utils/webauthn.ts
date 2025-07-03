import { browser } from "$app/environment";
import { encrypt, decrypt } from "./crypto";
import nacl from "tweetnacl";

const WEBAUTHN_CREDENTIAL_KEY = "webauthn_credential_id";
const WEBAUTHN_ENCRYPTED_KEY = "webauthn_encrypted_key";
const WEBAUTHN_PUBLIC_KEY = "webauthn_public_key";
const WEBAUTHN_SALT = "webauthn_salt";

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
}

export interface WebAuthnStoredData {
  credentialId: string;
  publicKey: string;
  encryptedMasterKey: string;
  nonce: string;
  salt: string;
}

export function isWebAuthnSupported(): boolean {
  if (!browser) return false;
  return !!(navigator.credentials && navigator.credentials.create);
}

export async function registerWebAuthnCredential(
  _username: string,
  masterKey: Uint8Array,
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
    // Generate a random challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: "Secure Password Manager",
          id: location.hostname,
        },
        user: {
          id: crypto.getRandomValues(new Uint8Array(32)), // Use random bytes instead of username
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
          residentKey: "preferred", // Enable discoverable credentials
          requireResidentKey: false, // Allow non-resident keys for broader compatibility
        },
        attestation: "direct",
        timeout: 30000, // Shorter timeout for faster UX
      },
    })) as PublicKeyCredential;

    if (!credential) {
      return { success: false, error: "Failed to create credential" };
    }

    // Get the public key from the credential
    const response = credential.response as AuthenticatorAttestationResponse;
    const publicKeyBytes = new Uint8Array(response.getPublicKey() || []);

    // Generate a random salt for key derivation
    const salt = nacl.randomBytes(32);

    // Derive encryption key from public key data and salt
    const keyMaterial = new Uint8Array(publicKeyBytes.length + salt.length);
    keyMaterial.set(publicKeyBytes);
    keyMaterial.set(salt, publicKeyBytes.length);
    const derivedKey = nacl.hash(keyMaterial).slice(0, 32);

    // Encrypt the master key with the derived key
    const keyString = Array.from(masterKey).join(",");
    const { ciphertext, nonce } = encrypt(keyString, derivedKey);

    // Store all necessary data
    const credentialIdBase64 = btoa(
      String.fromCharCode(...new Uint8Array(credential.rawId)),
    );
    const publicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytes));
    const saltBase64 = btoa(String.fromCharCode(...salt));

    const storedData: WebAuthnStoredData = {
      credentialId: credentialIdBase64,
      publicKey: publicKeyBase64,
      encryptedMasterKey: ciphertext,
      nonce,
      salt: saltBase64,
    };

    localStorage.setItem(WEBAUTHN_CREDENTIAL_KEY, credentialIdBase64);
    localStorage.setItem(WEBAUTHN_ENCRYPTED_KEY, JSON.stringify(storedData));

    return { success: true };
  } catch (error) {
    console.error("WebAuthn registration error:", error);

    // Provide specific error messages
    let errorMessage = "Registration failed";
    if (error instanceof Error) {
      if (error.name === "NotAllowedError") {
        errorMessage = "User cancelled or authentication failed";
      } else if (error.name === "InvalidStateError") {
        errorMessage = "Authenticator already registered";
      } else if (error.name === "NotSupportedError") {
        errorMessage = "WebAuthn not supported on this device";
      } else if (error.name === "SecurityError") {
        errorMessage = "Security error - please try again";
      } else {
        errorMessage = error.message;
      }
    }

    return { success: false, error: errorMessage };
  }
}

export async function authenticateWithWebAuthn(): Promise<{
  success: boolean;
  masterKey?: Uint8Array;
  error?: string;
}> {
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

  const credentialId = localStorage.getItem(WEBAUTHN_CREDENTIAL_KEY);
  if (!credentialId) {
    return { success: false, error: "No WebAuthn credential found" };
  }

  try {
    // Generate a random challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: Uint8Array.from(atob(credentialId), (c) => c.charCodeAt(0)),
            type: "public-key",
          },
        ],
        userVerification: "required", // Direct biometric authentication
        timeout: 30000, // Shorter timeout for faster UX
      },
    })) as PublicKeyCredential;

    if (!credential) {
      return { success: false, error: "Authentication failed" };
    }

    // Retrieve stored data
    const encryptedKeyData = localStorage.getItem(WEBAUTHN_ENCRYPTED_KEY);
    if (!encryptedKeyData) {
      return { success: false, error: "No encrypted key found" };
    }

    let storedData: WebAuthnStoredData;
    try {
      const parsed = JSON.parse(encryptedKeyData);

      // Handle legacy format
      if (parsed.salt && !parsed.credentialId) {
        return {
          success: false,
          error: "Legacy WebAuthn data detected. Please re-register.",
        };
      }

      storedData = parsed as WebAuthnStoredData;
    } catch (e) {
      return { success: false, error: "Invalid stored credential data" };
    }

    // Reconstruct the encryption key
    const publicKeyBytes = Uint8Array.from(atob(storedData.publicKey), (c) =>
      c.charCodeAt(0),
    );
    const saltBytes = Uint8Array.from(atob(storedData.salt), (c) =>
      c.charCodeAt(0),
    );

    const keyMaterial = new Uint8Array(
      publicKeyBytes.length + saltBytes.length,
    );
    keyMaterial.set(publicKeyBytes);
    keyMaterial.set(saltBytes, publicKeyBytes.length);
    const derivedKey = nacl.hash(keyMaterial).slice(0, 32);

    // Decrypt the master key
    const decryptedKey = decrypt(
      storedData.encryptedMasterKey,
      storedData.nonce,
      derivedKey,
    );

    if (!decryptedKey) {
      return {
        success: false,
        error: "Failed to decrypt master key. Please re-register.",
      };
    }

    const masterKey = new Uint8Array(
      decryptedKey.split(",").map((n) => parseInt(n, 10)),
    );

    return { success: true, masterKey };
  } catch (error) {
    console.error("WebAuthn authentication error:", error);

    // Provide specific error messages
    let errorMessage = "Authentication failed";
    if (error instanceof Error) {
      if (error.name === "NotAllowedError") {
        errorMessage = "User cancelled or Face ID/Touch ID failed";
      } else if (error.name === "InvalidStateError") {
        errorMessage = "Invalid credential state";
      } else if (error.name === "NotSupportedError") {
        errorMessage = "WebAuthn not supported on this device";
      } else if (error.name === "SecurityError") {
        errorMessage = "Security error - please try again";
      } else if (error.name === "AbortError") {
        errorMessage = "Authentication was cancelled";
      } else {
        errorMessage = error.message;
      }
    }

    return { success: false, error: errorMessage };
  }
}

export function hasWebAuthnCredential(): boolean {
  if (!browser) return false;
  return !!localStorage.getItem(WEBAUTHN_CREDENTIAL_KEY);
}

export function clearWebAuthnCredential(): void {
  if (!browser) return;

  localStorage.removeItem(WEBAUTHN_CREDENTIAL_KEY);
  localStorage.removeItem(WEBAUTHN_ENCRYPTED_KEY);
  localStorage.removeItem(WEBAUTHN_PUBLIC_KEY);
  localStorage.removeItem(WEBAUTHN_SALT);
}

// Helper function to check if user gesture is available (for older Safari versions)
export function isUserGestureAvailable(): boolean {
  if (!browser) return false;

  // Check if we're in a user gesture context by trying to open a popup
  // This is a non-intrusive way to check user gesture availability
  try {
    const popup = window.open("", "_blank", "width=1,height=1");
    if (popup) {
      popup.close();
      return true;
    }
  } catch (e) {
    // Ignore errors
  }

  return false;
}

// Helper function to ensure WebAuthn is called within user gesture
export async function ensureUserGesture(): Promise<boolean> {
  if (!browser) return false;

  // Modern browsers don't require user gesture for WebAuthn
  // This is mainly for older Safari versions
  const userAgent = navigator.userAgent;
  const isOldSafari =
    /Safari/.test(userAgent) && /Version\/1[4-6]/.test(userAgent);

  if (!isOldSafari) {
    return true;
  }

  return isUserGestureAvailable();
}
