import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
import {
  encrypt,
  decrypt,
  deriveKey,
  generateSalt,
  saltToString,
  stringToSalt,
} from "$lib/utils/crypto";
import type { GitHubConfig } from "$lib/utils/github-sync";

// GitHub configuration constants
export const GITHUB_CONFIG = {
  owner: "niharnandan",
  repo: "pwms",
  get token() {
    const pat = import.meta.env.VITE_GITHUB_PAT;
    if (!pat) {
      throw new Error("Configuration error");
    }
    return pat;
  },
} as const;

// Store for GitHub authentication state
export const isGitHubAuthenticated = writable<boolean>(false);

// Store for GitHub configuration (never persisted)
export const gitHubConfig = writable<GitHubConfig | null>(null);

// Key for localStorage
const GITHUB_AUTH_KEY = "github_auth_encrypted";

interface EncryptedGitHubAuth {
  salt: string;
  nonce: string;
  ciphertext: string;
}

// Check if GitHub auth is stored
export function hasStoredGitHubAuth(): boolean {
  if (!browser) return false;

  try {
    const stored = localStorage.getItem(GITHUB_AUTH_KEY);
    return stored !== null;
  } catch {
    return false;
  }
}

// Store GitHub PAT (simplified since token is hardcoded)
export function storeGitHubAuth(pat: string, masterPassword: string): boolean {
  // Not needed since token is hardcoded, but keeping for compatibility
  return loadGitHubAuth(masterPassword);
}

// Load GitHub PAT (simplified since token is hardcoded)
export function loadGitHubAuth(masterPassword: string): boolean {
  if (!browser) return false;

  try {
    // Since token is hardcoded, just set up the config directly
    gitHubConfig.set({
      owner: GITHUB_CONFIG.owner,
      repo: GITHUB_CONFIG.repo,
      token: GITHUB_CONFIG.token,
    });
    isGitHubAuthenticated.set(true);

    return true;
  } catch (error) {
    console.error("Error loading GitHub auth:", error);
    return false;
  }
}

// Clear GitHub authentication
export function clearGitHubAuth(): void {
  if (!browser) return;

  try {
    localStorage.removeItem(GITHUB_AUTH_KEY);
    gitHubConfig.set(null);
    isGitHubAuthenticated.set(false);
  } catch (error) {
    console.error("Error clearing GitHub auth:", error);
  }
}

// Get current GitHub config (for API calls)
export function getGitHubConfig(): GitHubConfig | null {
  return get(gitHubConfig);
}
