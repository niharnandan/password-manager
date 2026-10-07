<script lang="ts" module>
  // Prompt for biometrics automatically only on the first login screen of a
  // page load. After a logout or auto-lock nobody may be at the device, and
  // an unanswered prompt would count as a failed attempt.
  let loginScreenShownBefore = false;
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import {
    enableBiometricUnlock,
    lockVault,
    notices,
    unlockVault,
    unlockWithBiometrics,
  } from "$lib/stores/vault";
  import {
    getCachedVault,
    hasStoredGitHubToken,
  } from "$lib/utils/local-storage";
  import {
    buildSecurityEvent,
    getTrackedAttempts,
    queueSecurityEvent,
    trackLoginAttempt,
  } from "$lib/utils/security-monitor";
  import {
    discardLegacyWebAuthnData,
    getPrfSupport,
    hasWebAuthnCredential,
    isWebAuthnSupported,
  } from "$lib/utils/webauthn";

  // Older versions stored the biometric key in a form readable without
  // biometrics; remove it before deciding which login flow to show.
  const legacyBiometricsDiscarded = discardLegacyWebAuthnData();
  let hasStoredToken = hasStoredGitHubToken();
  let hasLocalVault = getCachedVault() !== null;

  let password = "";
  let githubToken = "";
  let showTokenField = !hasStoredToken;
  let errorMessage = "";
  let infoMessage = legacyBiometricsDiscarded
    ? "Biometric unlock was reset because the previous version did not protect your key properly. Unlock with your master password to set it up again."
    : "";
  let isLoading = false;
  let enableWebAuthn = false;
  let prfSupported: boolean | null = null;
  let hasWebAuthn = isWebAuthnSupported() && hasWebAuthnCredential();
  let webAuthnAttempts = 0;
  let showPasswordForm = false;
  let webAuthnRetryCount =
    typeof localStorage !== "undefined"
      ? parseInt(localStorage.getItem("webauthn_retry_count") || "0", 10)
      : 0;
  let passwordRetryCount =
    typeof localStorage !== "undefined"
      ? parseInt(localStorage.getItem("password_retry_count") || "0", 10)
      : 0;
  const MAX_RETRIES = 5;

  $: if (typeof localStorage !== "undefined") {
    localStorage.setItem("webauthn_retry_count", webAuthnRetryCount.toString());
    localStorage.setItem("password_retry_count", passwordRetryCount.toString());
  }

  onMount(() => {
    void getPrfSupport().then((supported) => (prfSupported = supported));

    const firstLoginScreen = !loginScreenShownBefore;
    loginScreenShownBefore = true;

    if (hasWebAuthn && firstLoginScreen && document.hasFocus()) {
      setTimeout(tryWebAuthnLogin, 50);
    } else if (!hasWebAuthn) {
      showPasswordForm = true;
    }
  });

  function resetRetryCounts() {
    passwordRetryCount = 0;
    webAuthnRetryCount = 0;
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("password_retry_count");
      localStorage.removeItem("webauthn_retry_count");
    }
  }

  async function handleSubmit() {
    errorMessage = "";
    infoMessage = "";
    isLoading = true;

    try {
      const result = await unlockVault(password, {
        token: showTokenField ? githubToken : undefined,
      });

      if (result.ok) {
        trackLoginAttempt("password", "success");
        resetRetryCounts();
        password = "";
        githubToken = "";

        if (enableWebAuthn && isWebAuthnSupported()) {
          const registration = await enableBiometricUnlock();
          if (!registration.success) {
            console.warn("WebAuthn registration failed:", registration.error);
            notices.update((list) => [
              ...list,
              `Biometric unlock was not turned on: ${registration.error}`,
            ]);
          }
        }
        return;
      }

      if (result.reason !== "wrong-password") {
        // Missing token, missing vault, network trouble: not a guess.
        trackLoginAttempt("password", result.reason);
        errorMessage = result.message;
        if (result.reason === "needs-token" || result.reason === "token-rejected")
          showTokenField = true;
        return;
      }

      passwordRetryCount++;
      trackLoginAttempt("password", "failed");

      if (passwordRetryCount >= MAX_RETRIES) {
        trackLoginAttempt("password", "failed_threshold_exceeded");
        errorMessage =
          "Too many failed password attempts. All data will be wiped for security.";
        isLoading = false;
        setTimeout(() => {
          wipeAllStorage();
        }, 2000); // Give user time to read the message
        return;
      }

      const tokenHint =
        hasStoredToken && !showTokenField
          ? " If you changed it on another device, also enter your GitHub token."
          : "";
      if (passwordRetryCount >= MAX_RETRIES - 1) {
        errorMessage = `Invalid master password (${passwordRetryCount}/${MAX_RETRIES} attempts) - WARNING: One more failed attempt will wipe all data!${tokenHint}`;
      } else {
        errorMessage = `Invalid master password (${passwordRetryCount}/${MAX_RETRIES} attempts).${tokenHint}`;
      }
    } catch (error) {
      console.error(error);
      errorMessage = "An unexpected error occurred. Please try again.";
    } finally {
      isLoading = false;
      // An attempt can drop a rejected token or replace the cached vault.
      hasStoredToken = hasStoredGitHubToken();
      hasLocalVault = getCachedVault() !== null;
    }
  }

  async function tryWebAuthnLogin() {
    errorMessage = "";
    infoMessage = "";
    isLoading = true;
    webAuthnAttempts++;

    // Check if document is focused
    if (!document.hasFocus()) {
      errorMessage = "Document not focused. Please click and try again.";
      isLoading = false;
      return;
    }

    // Check if we've exceeded retry limit before incrementing
    if (webAuthnRetryCount >= MAX_RETRIES) {
      trackLoginAttempt("webauthn", "failed_threshold_exceeded");
      errorMessage =
        "Too many failed attempts. All data will be wiped for security.";
      isLoading = false;
      setTimeout(() => {
        wipeAllStorage();
      }, 2000); // Give user time to read the message
      return;
    }

    webAuthnRetryCount++;

    try {
      const result = await unlockWithBiometrics();
      if (result.ok) {
        trackLoginAttempt("webauthn", "success");
        resetRetryCounts();
        return;
      }

      if (result.reason === "needs-password") {
        // Not a failed authentication: the record can't open the vault.
        trackLoginAttempt("webauthn", "needs_password");
        webAuthnRetryCount = Math.max(0, webAuthnRetryCount - 1);
        hasWebAuthn = isWebAuthnSupported() && hasWebAuthnCredential();
        showPasswordForm = true;
        errorMessage = result.message;
        return;
      }

      trackLoginAttempt("webauthn", "failed");
      if (result.message.includes("Document not focused")) {
        errorMessage = "Document not focused. Please click and try again.";
      } else if (webAuthnRetryCount >= MAX_RETRIES - 1) {
        errorMessage = `${result.message || "Face ID failed"} (${webAuthnRetryCount}/${MAX_RETRIES} attempts) - WARNING: One more failed attempt will wipe all data!`;
      } else {
        errorMessage = `${result.message || "Face ID failed"} (${webAuthnRetryCount}/${MAX_RETRIES} attempts). Try again or use password.`;
      }
    } catch (error) {
      console.error("WebAuthn authentication error:", error);
      trackLoginAttempt("webauthn", "error");
      errorMessage = "Authentication error. Try again or use password.";
    } finally {
      isLoading = false;
    }
  }

  function usePasswordInstead() {
    showPasswordForm = true;
    errorMessage = "";
    webAuthnRetryCount = 0; // Reset WebAuthn retry count when switching to password
    // Don't reset password retry count - it should persist across switches
  }

  async function wipeAllStorage() {
    try {
      const totalAttempts = webAuthnRetryCount + passwordRetryCount;
      const event = await buildSecurityEvent(
        totalAttempts,
        getTrackedAttempts(),
      );

      // Wipes the cached vault, encrypted token, and biometric record.
      localStorage.clear();
      sessionStorage.clear();

      // No credential is available before login, so the event waits on this
      // device and is uploaded after the next successful unlock.
      if (event) queueSecurityEvent(event);

      lockVault();
      webAuthnRetryCount = 0;
      passwordRetryCount = 0;

      console.log("All storage wiped due to too many failed login attempts");
      window.location.reload();
    } catch (error) {
      console.error("Error wiping storage:", error);
      // Force reload even if clearing fails
      window.location.reload();
    }
  }

  function handleOutsideClick(event: MouseEvent) {
    // If clicking outside the Face ID interface, switch to password
    if (hasWebAuthn && !showPasswordForm && !isLoading) {
      const target = event.target as HTMLElement;
      const faceIdContainer = target?.closest(".face-id-container");
      if (!faceIdContainer) {
        usePasswordInstead();
      }
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 transition-colors duration-300"
  on:click={handleOutsideClick}
>
  <div class="w-full max-w-lg mx-4 animate-fade-in animate-float">
    <div
      class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-gray-900/5 p-12"
    >
      <!-- Animated Title -->
      <div class="mb-8 text-center">
        <h1 class="text-4xl font-bold mb-2 animate-shimmer inline-block">
          Password Vault
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {hasWebAuthn ? "Welcome back" : "Secure your credentials"}
        </p>
      </div>

      <!-- WebAuthn Flow (when user has Face ID set up) -->
      {#if hasWebAuthn && !showPasswordForm}
        <div class="space-y-6 face-id-container animate-scale-in">
          <!-- Face ID Status Card -->
          <div
            class="bg-gradient-to-br from-slate-50 to-blue-50/50 dark:from-gray-900 dark:to-blue-950/30 rounded-xl p-8 border border-gray-200 dark:border-gray-700"
          >
            {#if isLoading}
              <div class="flex flex-col items-center space-y-4">
                <div
                  class="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/50 animate-pulse"
                >
                  <svg
                    class="w-10 h-10 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div class="text-center">
                  <p
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-1"
                  >
                    Authenticating...
                  </p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Look at your device to continue
                  </p>
                </div>
              </div>
            {:else}
              <div class="flex flex-col items-center space-y-4">
                <div
                  class="w-20 h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/50"
                >
                  <svg
                    class="w-10 h-10 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div class="text-center">
                  <p
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-1"
                  >
                    Biometric Ready
                  </p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Tap the button below to authenticate
                  </p>
                </div>
              </div>
            {/if}
          </div>

          {#if errorMessage}
            <div
              class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 {errorMessage.includes(
                'WARNING',
              )
                ? 'ring-2 ring-red-500'
                : ''}"
            >
              <div class="flex items-start">
                <svg
                  class="w-5 h-5 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clip-rule="evenodd"
                  />
                </svg>
                <p
                  class="text-sm text-red-800 dark:text-red-200 {errorMessage.includes(
                    'WARNING',
                  )
                    ? 'font-semibold'
                    : ''}"
                >
                  {errorMessage}
                </p>
              </div>
            </div>
          {/if}

          <!-- Action Buttons -->
          <div class="space-y-3">
            {#if !isLoading}
              <button
                type="button"
                on:click={tryWebAuthnLogin}
                disabled={webAuthnRetryCount >= MAX_RETRIES}
                class="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all duration-200 ease-in-out active:scale-[0.98] flex items-center justify-center btn-hover-elevate"
              >
                <svg
                  class="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                {webAuthnRetryCount >= MAX_RETRIES
                  ? "Too many attempts"
                  : webAuthnAttempts === 0
                    ? "Authenticate with Biometrics"
                    : `Try Again (${webAuthnRetryCount}/${MAX_RETRIES})`}
              </button>
            {/if}

            <button
              type="button"
              on:click={usePasswordInstead}
              class="w-full bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 px-6 rounded-xl border-2 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 ease-in-out hover:shadow-md active:scale-[0.98]"
            >
              Use Master Password
            </button>
          </div>

          <!-- Subtle hint -->
          <p class="text-xs text-gray-500 dark:text-gray-500 text-center">
            Click outside this area to use password authentication
          </p>
        </div>
      {:else}
        <!-- Password Form -->
        <form
          on:submit|preventDefault={handleSubmit}
          class="space-y-6 animate-slide-up"
        >
          <!-- Password Input -->
          <div class="space-y-2">
            <label
              for="password"
              class="block text-sm font-semibold text-gray-700 dark:text-gray-300"
            >
              Master Password
            </label>
            <!-- svelte-ignore a11y_autofocus -->
            <div class="relative">
              <div
                class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"
              >
                <svg
                  class="h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <input
                id="password"
                type="password"
                bind:value={password}
                autocomplete="current-password"
                class="w-full pl-12 pr-4 py-3.5 text-gray-900 dark:text-white bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                placeholder="Enter your master password"
                required
                autofocus
              />
            </div>
            <p
              class="text-xs text-gray-500 dark:text-gray-400 flex items-center"
            >
              <svg
                class="w-3.5 h-3.5 mr-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clip-rule="evenodd"
                />
              </svg>
              Your master password is never stored or transmitted
            </p>
          </div>

          <!-- GitHub sync token (never bundled into the site) -->
          {#if showTokenField}
            <div class="space-y-2">
              <label
                for="github-token"
                class="block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >
                GitHub access token
                {#if hasStoredToken}
                  <span class="font-normal text-gray-500 dark:text-gray-400"
                    >(replaces the saved one)</span
                  >
                {:else if hasLocalVault}
                  <span class="font-normal text-gray-500 dark:text-gray-400"
                    >(needed for sync)</span
                  >
                {/if}
              </label>
              <input
                id="github-token"
                type="password"
                bind:value={githubToken}
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                data-1p-ignore
                data-lpignore="true"
                required={!hasStoredToken && !hasLocalVault}
                class="w-full px-4 py-3.5 text-gray-900 dark:text-white bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                placeholder="github_pat_..."
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                A fine-grained token with read and write access to the vault
                repository's contents. Needed once per device. It is stored
                only on this device, encrypted with your master password.
              </p>
            </div>
          {:else}
            <button
              type="button"
              on:click={() => (showTokenField = true)}
              class="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-200"
            >
              Use a different GitHub token
            </button>
          {/if}

          <!-- WebAuthn Setup Option -->
          {#if isWebAuthnSupported() && !hasWebAuthn && prfSupported !== false}
            <div
              class="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-4"
            >
              <div class="flex items-start space-x-3">
                <input
                  id="enable-webauthn"
                  type="checkbox"
                  bind:checked={enableWebAuthn}
                  class="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5 cursor-pointer"
                />
                <div class="flex-1">
                  <label
                    for="enable-webauthn"
                    class="block text-sm font-semibold text-gray-900 dark:text-white cursor-pointer"
                  >
                    Enable Biometric Authentication
                  </label>
                  <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Use Face ID or Touch ID for faster, more secure access
                  </p>
                </div>
                <div class="group relative">
                  <svg
                    class="w-5 h-5 text-blue-600 dark:text-blue-400 cursor-help"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div
                    class="absolute bottom-full right-0 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-10"
                  >
                    Zero-knowledge setup - password never stored
                  </div>
                </div>
              </div>
            </div>
          {/if}

          {#if infoMessage}
            <div
              class="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-4"
              role="status"
            >
              <p class="text-sm text-blue-800 dark:text-blue-200">
                {infoMessage}
              </p>
            </div>
          {/if}

          <!-- Error Message -->
          {#if errorMessage}
            <div
              class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 {errorMessage.includes(
                'WARNING',
              )
                ? 'ring-2 ring-red-500'
                : ''}"
            >
              <div class="flex items-start">
                <svg
                  class="w-5 h-5 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clip-rule="evenodd"
                  />
                </svg>
                <p
                  class="text-sm text-red-800 dark:text-red-200 {errorMessage.includes(
                    'WARNING',
                  )
                    ? 'font-semibold'
                    : ''}"
                >
                  {errorMessage}
                </p>
              </div>
            </div>
          {/if}

          <!-- Submit Button -->
          <button
            type="submit"
            disabled={isLoading}
            class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 ease-in-out active:scale-[0.98] flex items-center justify-center btn-hover-elevate"
          >
            {#if isLoading}
              <svg
                class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Authenticating...
            {:else}
              <svg
                class="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                />
              </svg>
              Unlock Vault
            {/if}
          </button>

          <!-- Back to Face ID -->
          {#if hasWebAuthn && showPasswordForm}
            <button
              type="button"
              on:click={() => {
                showPasswordForm = false;
                errorMessage = "";
              }}
              class="w-full text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 py-2 transition-colors duration-200 flex items-center justify-center"
            >
              <svg
                class="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Biometric Authentication
            </button>
          {/if}
        </form>
      {/if}
    </div>
  </div>
</div>
