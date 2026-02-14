import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
import type { GitHubConfig } from "$lib/utils/github-sync";

export const GITHUB_CONFIG = {
  owner: "niharnandan",
  repo: "pwms",
  get token() {
    const pat = import.meta.env.VITE_GITHUB_PAT;
    if (!pat) throw new Error("Configuration error");
    return pat;
  },
} as const;

export const isGitHubAuthenticated = writable<boolean>(false);
export const gitHubConfig = writable<GitHubConfig | null>(null);

export function loadGitHubAuth(): boolean {
  if (!browser) return false;

  try {
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

export function getGitHubConfig(): GitHubConfig | null {
  return get(gitHubConfig);
}
