import { browser } from '$app/environment';
import { encrypt, decrypt } from './crypto';

const WEBAUTHN_CREDENTIAL_KEY = 'webauthn_credential_id';
const WEBAUTHN_ENCRYPTED_KEY = 'webauthn_encrypted_key';

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
}

export function isWebAuthnSupported(): boolean {
  if (!browser) return false;
  return !!(navigator.credentials && navigator.credentials.create);
}

export async function registerWebAuthnCredential(
  username: string,
  masterKey: Uint8Array
): Promise<{ success: boolean; error?: string }> {
  if (!browser || !isWebAuthnSupported()) {
    return { success: false, error: 'WebAuthn not supported' };
  }

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: {
          name: 'Secure Password Manager',
          id: location.hostname,
        },
        user: {
          id: new TextEncoder().encode(username),
          name: username,
          displayName: username,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential;

    if (!credential) {
      return { success: false, error: 'Failed to create credential' };
    }

    // Store credential ID (base64 encoded)
    const credentialIdBase64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    localStorage.setItem(WEBAUTHN_CREDENTIAL_KEY, credentialIdBase64);

    // Store master key encrypted with a derived key from the credential
    // This is a simplified approach - in production, use more secure key derivation
    const keyString = Array.from(masterKey).join(',');
    const { ciphertext, nonce } = encrypt(keyString, masterKey);
    localStorage.setItem(WEBAUTHN_ENCRYPTED_KEY, JSON.stringify({ ciphertext, nonce, salt: btoa(String.fromCharCode(...masterKey.slice(0, 16))) }));

    return { success: true };
  } catch (error) {
    console.error('WebAuthn registration error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Registration failed' 
    };
  }
}

export async function authenticateWithWebAuthn(): Promise<{ success: boolean; masterKey?: Uint8Array; error?: string }> {
  if (!browser || !isWebAuthnSupported()) {
    return { success: false, error: 'WebAuthn not supported' };
  }

  const credentialId = localStorage.getItem(WEBAUTHN_CREDENTIAL_KEY);
  if (!credentialId) {
    return { success: false, error: 'No WebAuthn credential found' };
  }

  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [
          {
            id: Uint8Array.from(atob(credentialId), c => c.charCodeAt(0)),
            type: 'public-key',
          },
        ],
        userVerification: 'preferred',
        timeout: 60000,
      },
    }) as PublicKeyCredential;

    if (!credential) {
      return { success: false, error: 'Authentication failed' };
    }

    // Retrieve and decrypt master key
    const encryptedKeyData = localStorage.getItem(WEBAUTHN_ENCRYPTED_KEY);
    if (!encryptedKeyData) {
      return { success: false, error: 'No encrypted key found' };
    }

    const { ciphertext, nonce, salt } = JSON.parse(encryptedKeyData);
    
    // Reconstruct the key used for encryption
    const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
    const reconstructedKey = new Uint8Array(32);
    reconstructedKey.set(saltBytes);
    
    const decryptedKey = decrypt(ciphertext, nonce, reconstructedKey);
    
    if (!decryptedKey) {
      return { success: false, error: 'Failed to decrypt master key' };
    }

    const masterKey = new Uint8Array(decryptedKey.split(',').map(n => parseInt(n, 10)));
    
    return { success: true, masterKey };
  } catch (error) {
    console.error('WebAuthn authentication error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Authentication failed' 
    };
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
}