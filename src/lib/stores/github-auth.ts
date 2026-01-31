import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
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

// Load GitHub PAT (simplified since token is hardcoded)
export function loadGitHubAuth(): boolean {
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

// Get current GitHub config (for API calls)
export function getGitHubConfig(): GitHubConfig | null {
  return get(gitHubConfig);
}
