<script lang="ts">
  import { onMount } from 'svelte';
  import { unlockVault, masterKey, encryptedVault, isAuthenticated } from '$lib/stores/vault';
  import { 
    isWebAuthnSupported, 
    hasWebAuthnCredential, 
    registerWebAuthnCredential, 
    authenticateWithWebAuthn,
    ensureUserGesture,
    clearWebAuthnCredential
  } from '$lib/utils/webauthn';
  import { getCachedVault, clearCachedVault } from '$lib/utils/local-storage';
  import { logSecurityEvent, trackLoginAttempt, getTrackedAttempts } from '$lib/utils/security-monitor';
  import { loadGitHubAuth } from '$lib/stores/github-auth';
  import { get } from 'svelte/store';
  
  let password = '';
  let errorMessage = '';
  let isLoading = false;
  let enableWebAuthn = false;
  let hasWebAuthn = false;
  let webAuthnAttempts = 0;
  let showPasswordForm = false;
  let autoWebAuthnTried = false;
  let isDocumentFocused = true;
  // Initialize retry counts from localStorage or default to 0
  let webAuthnRetryCount = typeof localStorage !== 'undefined' ? parseInt(localStorage.getItem('webauthn_retry_count') || '0', 10) : 0;
  let passwordRetryCount = typeof localStorage !== 'undefined' ? parseInt(localStorage.getItem('password_retry_count') || '0', 10) : 0;
  const MAX_RETRIES = 5;
  
  // Persist retry counts to localStorage
  $: if (typeof localStorage !== 'undefined') {
    localStorage.setItem('webauthn_retry_count', webAuthnRetryCount.toString());
    localStorage.setItem('password_retry_count', passwordRetryCount.toString());
  }
  
  // Check if WebAuthn is supported and if user has a credential
  $: hasWebAuthn = isWebAuthnSupported() && hasWebAuthnCredential();
  
  // Auto-attempt WebAuthn on component mount
  onMount(() => {
    // Check document focus state
    const handleFocus = () => {
      isDocumentFocused = true;
    };
    const handleBlur = () => {
      isDocumentFocused = false;
    };
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    // Set initial focus state
    isDocumentFocused = document.hasFocus();
    
    if (hasWebAuthn && !autoWebAuthnTried && isDocumentFocused) {
      autoWebAuthnTried = true;
      // Minimal delay to let the component render first
      setTimeout(tryWebAuthnLogin, 50);
    } else if (!hasWebAuthn) {
      showPasswordForm = true;
    }
    
    // Cleanup event listeners
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  });
  
  async function handleSubmit() {
    errorMessage = '';
    isLoading = true;
    
    try {
      // Always unlock vault from GitHub/localStorage
      const success = await unlockVault(password);
      if (!success) {
        passwordRetryCount++;
        
        // Track failed password attempt
        trackLoginAttempt('password', 'failed');
        
        // Check if we've exceeded retry limit for password attempts
        if (passwordRetryCount >= MAX_RETRIES) {
          trackLoginAttempt('password', 'failed_threshold_exceeded');
          errorMessage = 'Too many failed password attempts. All data will be wiped for security.';
          isLoading = false;
          setTimeout(() => {
            wipeAllStorage();
          }, 2000); // Give user time to read the message
          return;
        }
        
        if (passwordRetryCount >= MAX_RETRIES - 1) {
          errorMessage = `Invalid password or connection error (${passwordRetryCount}/${MAX_RETRIES} attempts) - WARNING: One more failed attempt will wipe all data!`;
        } else {
          errorMessage = `Invalid password or connection error (${passwordRetryCount}/${MAX_RETRIES} attempts)`;
        }
      } else {
        // Track successful password login
        trackLoginAttempt('password', 'success');
        
        // Reset retry counts on successful login
        passwordRetryCount = 0;
        webAuthnRetryCount = 0;
        // Clear persisted retry counts
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('password_retry_count');
          localStorage.removeItem('webauthn_retry_count');
        }
        
        if (enableWebAuthn && isWebAuthnSupported()) {
          // Register WebAuthn credential after successful login
          const currentMasterKey = get(masterKey);
          if (currentMasterKey) {
            const result = await registerWebAuthnCredential('user', currentMasterKey);
            if (!result.success) {
              console.warn('WebAuthn registration failed:', result.error);
            }
          }
        }
      }
    } catch (error) {
      passwordRetryCount++;
      
      // Track failed password attempt (error case)
      trackLoginAttempt('password', 'error');
      
      // Check if we've exceeded retry limit for password attempts
      if (passwordRetryCount >= MAX_RETRIES) {
        trackLoginAttempt('password', 'failed_threshold_exceeded');
        errorMessage = 'Too many failed attempts. All data will be wiped for security.';
        isLoading = false;
        setTimeout(() => {
          wipeAllStorage();
        }, 2000);
        return;
      }
      
      if (passwordRetryCount >= MAX_RETRIES - 1) {
        errorMessage = `An error occurred (${passwordRetryCount}/${MAX_RETRIES} attempts) - WARNING: One more failed attempt will wipe all data!`;
      } else {
        errorMessage = `An error occurred (${passwordRetryCount}/${MAX_RETRIES} attempts)`;
      }
      console.error(error);
    } finally {
      isLoading = false;
    }
  }
  
  async function tryWebAuthnLogin() {
    errorMessage = '';
    isLoading = true;
    webAuthnAttempts++;
    webAuthnRetryCount++;
    
    // Check if document is focused
    if (!document.hasFocus()) {
      errorMessage = 'Document not focused. Please click and try again.';
      isLoading = false;
      return;
    }
    
    // Check if we've exceeded retry limit
    if (webAuthnRetryCount >= MAX_RETRIES) {
      trackLoginAttempt('webauthn', 'failed_threshold_exceeded');
      errorMessage = 'Too many failed attempts. All data will be wiped for security.';
      isLoading = false;
      setTimeout(() => {
        wipeAllStorage();
      }, 2000); // Give user time to read the message
      return;
    }
    
    try {
      // Ensure user gesture is available for older Safari versions
      const hasUserGesture = await ensureUserGesture();
      if (!hasUserGesture) {
        errorMessage = 'User interaction required. Please click and try again.';
        isLoading = false;
        return;
      }
      
      const result = await authenticateWithWebAuthn();
      if (result.success && result.masterKey) {
        // Try to load cached vault first
        const cachedVault = getCachedVault();
        if (cachedVault) {
          // Track successful WebAuthn login
          trackLoginAttempt('webauthn', 'success');
          
          // Set the master key and vault
          masterKey.set(result.masterKey);
          encryptedVault.set(cachedVault);
          isAuthenticated.set(true);
          
          // Reset retry counts on success
          webAuthnRetryCount = 0;
          passwordRetryCount = 0;
          // Clear persisted retry counts
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('webauthn_retry_count');
            localStorage.removeItem('password_retry_count');
          }
          
          // Initialize GitHub auth for sync functionality
          // Since WebAuthn doesn't provide the master password, we use a placeholder
          // The actual GitHub token is hardcoded in the config
          loadGitHubAuth('webauthn-placeholder');
          
          // Try to sync in the background
          try {
            await unlockVault(''); // This will attempt GitHub sync if configured
          } catch (e) {
            // Ignore sync errors when using cached vault
            console.warn('Background sync failed:', e);
          }
        } else {
          trackLoginAttempt('webauthn', 'failed_no_cached_vault');
          errorMessage = 'No cached vault found. Please login with password first to enable Face ID.';
          showPasswordForm = true;
          masterKey.set(null);
        }
      } else {
        // Track failed WebAuthn attempt
        trackLoginAttempt('webauthn', 'failed');
        
        // Handle specific error cases
        if (result.error?.includes('Document not focused')) {
          errorMessage = 'Document not focused. Please click and try again.';
        } else if (result.error?.includes('decrypt')) {
          errorMessage = 'Face ID data corrupted. Please login with password to re-register.';
          showPasswordForm = true;
        } else if (result.error?.includes('Legacy')) {
          errorMessage = 'Face ID needs to be re-registered. Please login with password.';
          showPasswordForm = true;
        } else {
          if (webAuthnRetryCount >= MAX_RETRIES - 1) {
            errorMessage = `${result.error || 'Face ID failed'} (${webAuthnRetryCount}/${MAX_RETRIES} attempts) - WARNING: One more failed attempt will wipe all data!`;
          } else {
            errorMessage = `${result.error || 'Face ID failed'} (${webAuthnRetryCount}/${MAX_RETRIES} attempts). Try again or use password.`;
          }
        }
      }
    } catch (error) {
      console.error('WebAuthn authentication error:', error);
      trackLoginAttempt('webauthn', 'error');
      errorMessage = 'Authentication error. Try again or use password.';
    } finally {
      isLoading = false;
    }
  }
  
  function usePasswordInstead() {
    showPasswordForm = true;
    errorMessage = '';
    webAuthnRetryCount = 0; // Reset WebAuthn retry count when switching to password
    // Don't reset password retry count - it should persist across switches
  }
  
  async function wipeAllStorage() {
    try {
      // Log security event before wiping storage
      const totalAttempts = webAuthnRetryCount + passwordRetryCount;
      const trackedAttempts = getTrackedAttempts();
      
      console.log('Logging security event for suspicious activity...');
      await logSecurityEvent(totalAttempts, trackedAttempts);
      
      // Clear all localStorage
      localStorage.clear();
      
      // Clear all sessionStorage
      sessionStorage.clear();
      
      // Clear WebAuthn credentials
      clearWebAuthnCredential();
      
      // Clear cached vault
      clearCachedVault();
      
      // Reset all state
      masterKey.set(null);
      encryptedVault.set(null);
      isAuthenticated.set(false);
      
      // Reset retry counts
      webAuthnRetryCount = 0;
      passwordRetryCount = 0;
      
      console.log('All storage wiped due to too many failed login attempts');
      
      // Reload the page to reset everything
      window.location.reload();
    } catch (error) {
      console.error('Error wiping storage:', error);
      // Force reload even if clearing fails
      window.location.reload();
    }
  }
  
  function handleOutsideClick(event: MouseEvent) {
    // If clicking outside the Face ID interface, switch to password
    if (hasWebAuthn && !showPasswordForm && !isLoading) {
      const target = event.target as HTMLElement;
      const faceIdContainer = target?.closest('.face-id-container');
      if (!faceIdContainer) {
        usePasswordInstead();
      }
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900" on:click={handleOutsideClick}>
  <div class="w-full max-w-md">
    <div class="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md">
      <h1 class="text-2xl font-bold mb-6 text-center text-gray-700 dark:text-gray-200">
        {hasWebAuthn ? 'Unlock Your Vault' : 'Enter Master Password'}
      </h1>
      
      <!-- WebAuthn Flow (when user has Face ID set up) -->
      {#if hasWebAuthn && !showPasswordForm}
        <div class="text-center space-y-4 face-id-container">
          <!-- Face ID Status -->
          {#if isLoading}
            <div class="flex flex-col items-center space-y-4">
              <div class="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <svg class="animate-pulse w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
              <p class="text-gray-600 dark:text-gray-300">Look at your device to authenticate</p>
            </div>
          {:else}
            <div class="flex flex-col items-center space-y-4">
              <div class="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
              <p class="text-gray-600 dark:text-gray-300">Tap below to unlock instantly</p>
            </div>
          {/if}
          
          {#if errorMessage}
            <p class="text-red-500 text-sm {errorMessage.includes('WARNING') ? 'font-bold bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800' : ''}">{errorMessage}</p>
          {/if}
          
          <!-- Action Buttons -->
          <div class="space-y-3">
            {#if !isLoading}
              <button 
                type="button"
                on:click={tryWebAuthnLogin}
                disabled={webAuthnRetryCount >= MAX_RETRIES}
                class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center justify-center"
              >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
                {webAuthnRetryCount >= MAX_RETRIES ? 'Too many attempts' : 
                 webAuthnAttempts === 0 ? 'Use Face ID' : `Try Face ID Again (${webAuthnRetryCount}/${MAX_RETRIES})`}
              </button>
            {/if}
            
            <button 
              type="button"
              on:click={usePasswordInstead}
              class="w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Use Password Instead
            </button>
          </div>
          
          <!-- Subtle hint about clicking outside -->
          <p class="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">
            Or click anywhere outside to use password
          </p>
        </div>
      {:else}
        <!-- Password Form -->
        <form on:submit|preventDefault={handleSubmit} class="space-y-6">
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Master Password
            </label>
            <!-- svelte-ignore a11y_autofocus -->
            <input 
              id="password"
              type="password"
              bind:value={password}
              autocomplete="current-password"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your master password"
              required
              autofocus
            />
          </div>
          
          <!-- WebAuthn Setup Checkbox (only show if WebAuthn is supported and not already set up) -->
          {#if isWebAuthnSupported() && !hasWebAuthnCredential()}
            <div class="flex items-center space-x-2">
              <input 
                id="enable-webauthn"
                type="checkbox"
                bind:checked={enableWebAuthn}
                class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label for="enable-webauthn" class="block text-sm text-gray-700 dark:text-gray-300">
                Enable Face ID / Touch ID for future logins
              </label>
              <div class="group relative">
                <svg class="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Your password won't be stored or visible during setup
                </div>
              </div>
            </div>
          {/if}
          
          {#if errorMessage}
            <p class="text-red-500 text-sm {errorMessage.includes('WARNING') ? 'font-bold bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800' : ''}">{errorMessage}</p>
          {/if}
          
          <button 
            type="submit"
            disabled={isLoading}
            class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center"
          >
            {#if isLoading}
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Unlocking...
            {:else}
              Unlock Vault
            {/if}
          </button>
          
          <!-- Back to Face ID option (if available and user chose password) -->
          {#if hasWebAuthn && showPasswordForm}
            <button 
              type="button"
              on:click={() => { showPasswordForm = false; errorMessage = ''; }}
              class="w-full text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
            >
              ← Back to Face ID
            </button>
          {/if}
        </form>
      {/if}
      
    </div>
  </div>
</div>