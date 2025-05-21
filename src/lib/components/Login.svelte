<script lang="ts">
  import { onMount } from 'svelte';
  import { encryptedVault, initializeVault, unlockVault } from '$lib/stores/vault';
  
  let password = '';
  let errorMessage = '';
  let isFirstTime = false;
  
  onMount(() => {
    // Check if this is the first time (no vault exists yet)
    isFirstTime = $encryptedVault === null;
  });
  
  function handleSubmit() {
    errorMessage = '';
    
    try {
      if (isFirstTime) {
        // First time setup - create vault with the password
        if (password.length < 8) {
          errorMessage = 'Password must be at least 8 characters long';
          return;
        }
        
        initializeVault(password);
      } else {
        // Unlock existing vault
        const success = unlockVault(password);
        if (!success) {
          errorMessage = 'Invalid password';
        }
      }
    } catch (error) {
      errorMessage = 'An error occurred';
      console.error(error);
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
  <div class="w-full max-w-md">
    <div class="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md">
      <h1 class="text-2xl font-bold mb-6 text-center text-gray-700 dark:text-gray-200">
        {isFirstTime ? 'Set Master Password' : 'Enter Master Password'}
      </h1>
      
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
        
        {#if errorMessage}
          <p class="text-red-500 text-sm">{errorMessage}</p>
        {/if}
        
        <button 
          type="submit"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {isFirstTime ? 'Create Vault' : 'Unlock Vault'}
        </button>
      </form>
      
      {#if isFirstTime}
        <p class="text-xs text-center mt-4 text-gray-600 dark:text-gray-400">
          This is your first time. Please set a master password<br>
          that you'll remember. It cannot be recovered if forgotten.
        </p>
      {/if}
    </div>
  </div>
</div>