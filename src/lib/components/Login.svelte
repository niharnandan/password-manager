<script lang="ts">
  import { onMount } from 'svelte';
  import { unlockVault, masterKey, encryptedVault, isAuthenticated } from '$lib/stores/vault';
  import { 
    isWebAuthnSupported, 
    hasWebAuthnCredential, 
    registerWebAuthnCredential, 
    authenticateWithWebAuthn 
  } from '$lib/utils/webauthn';
  import { getCachedVault } from '$lib/utils/local-storage';
  import { get } from 'svelte/store';
  
  let password = '';
  let errorMessage = '';
  let isLoading = false;
  let enableWebAuthn = false;
  let hasWebAuthn = false;
  let webAuthnAttempts = 0;
  let showPasswordForm = false;
  let autoWebAuthnTried = false;
  
  // Check if WebAuthn is supported and if user has a credential
  $: {
    hasWebAuthn = isWebAuthnSupported() && hasWebAuthnCredential();
  }
  
  // Auto-attempt WebAuthn on component mount
  onMount(() => {
    if (hasWebAuthn && !autoWebAuthnTried) {
      autoWebAuthnTried = true;
      // Small delay to let the component render first
      setTimeout(tryWebAuthnLogin, 100);
    } else if (!hasWebAuthn) {
      showPasswordForm = true;
    }
  });
  
  async function handleSubmit() {
    errorMessage = '';
    isLoading = true;
    
    try {
      // Always unlock vault from GitHub/localStorage
      const success = await unlockVault(password);
      if (!success) {
        errorMessage = 'Invalid password or connection error';
      } else if (enableWebAuthn && isWebAuthnSupported()) {
        // Register WebAuthn credential after successful login
        const currentMasterKey = get(masterKey);
        if (currentMasterKey) {
          const result = await registerWebAuthnCredential(password, currentMasterKey);
          if (!result.success) {
            console.warn('WebAuthn registration failed:', result.error);
          }
        }
      }
    } catch (error) {
      errorMessage = 'An error occurred';
      console.error(error);
    } finally {
      isLoading = false;
    }
  }
  
  async function tryWebAuthnLogin() {
    errorMessage = '';
    isLoading = true;
    webAuthnAttempts++;
    
    try {
      const result = await authenticateWithWebAuthn();
      if (result.success && result.masterKey) {
        // Try to load cached vault first
        const cachedVault = getCachedVault();
        if (cachedVault) {
          // Set the master key and vault
          masterKey.set(result.masterKey);
          encryptedVault.set(cachedVault);
          isAuthenticated.set(true);
          
          // Try to sync in the background
          try {
            await unlockVault(''); // This will attempt GitHub sync if configured
          } catch (e) {
            // Ignore sync errors when using cached vault
            console.warn('Background sync failed:', e);
          }
        } else {
          errorMessage = 'No cached vault found. Please login with password first.';
          showPasswordForm = true;
          masterKey.set(null);
        }
      } else {
        // WebAuthn failed - let user try again indefinitely
        errorMessage = `${result.error || 'Face ID failed'}. Try again or use password.`;
      }
    } catch (error) {
      console.error('WebAuthn authentication error:', error);
      errorMessage = 'Authentication error. Try again or use password.';
    } finally {
      isLoading = false;
    }
  }
  
  function usePasswordInstead() {
    showPasswordForm = true;
    errorMessage = '';
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
              <p class="text-gray-600 dark:text-gray-300">Authenticating with Face ID...</p>
            </div>
          {:else}
            <div class="flex flex-col items-center space-y-4">
              <div class="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
              <p class="text-gray-600 dark:text-gray-300">Ready to unlock with Face ID</p>
            </div>
          {/if}
          
          {#if errorMessage}
            <p class="text-red-500 text-sm">{errorMessage}</p>
          {/if}
          
          <!-- Action Buttons -->
          <div class="space-y-3">
            {#if !isLoading}
              <button 
                type="button"
                on:click={tryWebAuthnLogin}
                class="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center justify-center"
              >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
                {webAuthnAttempts === 0 ? 'Use Face ID' : `Try Face ID Again`}
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
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your master password"
              required
              autofocus
            />
          </div>
          
          <!-- WebAuthn Setup Checkbox (only show if WebAuthn is supported and not already set up) -->
          {#if isWebAuthnSupported() && !hasWebAuthnCredential()}
            <div class="flex items-center">
              <input 
                id="enable-webauthn"
                type="checkbox"
                bind:checked={enableWebAuthn}
                class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label for="enable-webauthn" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                Enable Face ID / Touch ID for future logins
              </label>
            </div>
          {/if}
          
          {#if errorMessage}
            <p class="text-red-500 text-sm">{errorMessage}</p>
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