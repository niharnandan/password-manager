import { browser } from "$app/environment";
import type { EncryptedVault } from "$lib/types/password";

// GitHub API configuration
const GITHUB_API_BASE = "https://api.github.com";
const VAULT_FILENAME = "vault.json";

export interface GitHubConfig {
  owner: string; // GitHub username
  repo: string; // Repository name
  token: string; // Personal Access Token
}

export interface GitHubSyncResult {
  success: boolean;
  error?: string;
  data?: any;
}

// Upload encrypted vault to GitHub
export async function uploadVaultToGitHub(
  vault: EncryptedVault,
  config: GitHubConfig,
): Promise<GitHubSyncResult> {
  if (!browser) {
    return { success: false, error: "GitHub sync only available in browser" };
  }

  try {
    const { owner, repo, token } = config;

    // First, try to get the current file to get its SHA (required for updates)
    const getFileUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${VAULT_FILENAME}`;
    let fileSha: string | undefined;

    try {
      const getResponse = await fetch(getFileUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (getResponse.ok) {
        const fileData = await getResponse.json();
        fileSha = fileData.sha;
      }
    } catch (e) {
      // File doesn't exist yet, that's okay
    }

    // Prepare the file content
    const content = btoa(JSON.stringify(vault)); // Base64 encode

    // Upload/update the file
    const uploadData = {
      message: `Update vault - ${new Date().toISOString()}`,
      content,
      ...(fileSha && { sha: fileSha }), // Include SHA if updating existing file
    };

    const uploadResponse = await fetch(getFileUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(uploadData),
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      return {
        success: false,
        error: `GitHub API error: ${errorData.message || uploadResponse.statusText}`,
      };
    }

    const result = await uploadResponse.json();
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// Download encrypted vault from GitHub
export async function downloadVaultFromGitHub(
  config: GitHubConfig,
): Promise<GitHubSyncResult> {
  if (!browser) {
    return { success: false, error: "GitHub sync only available in browser" };
  }

  try {
    const { owner, repo, token } = config;

    const getFileUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${VAULT_FILENAME}`;

    const response = await fetch(getFileUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "No vault found in repository" };
      }
      const errorData = await response.json();
      return {
        success: false,
        error: `GitHub API error: ${errorData.message || response.statusText}`,
      };
    }

    const fileData = await response.json();

    // Decode the base64 content
    const decodedContent = atob(fileData.content);
    const vault: EncryptedVault = JSON.parse(decodedContent);

    return { success: true, data: vault };
  } catch (error) {
    return {
      success: false,
      error: `Error downloading vault: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
