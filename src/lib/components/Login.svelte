<script lang="ts">
  import { unlockVault } from '$lib/stores/vault';
  
  let password = '';
  let errorMessage = '';
  let isLoading = false;
  
  async function handleSubmit() {
    errorMessage = '';
    isLoading = true;
    
    try {
      // Always unlock vault from GitHub
      const success = await unlockVault(password);
      if (!success) {
        errorMessage = 'Invalid password or connection error';
      }
    } catch (error) {
      errorMessage = 'An error occurred';
      console.error(error);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
  <div class="w-full max-w-md">
    <div class="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md">
      <h1 class="text-2xl font-bold mb-6 text-center text-gray-700 dark:text-gray-200">
        Enter Master Password
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
      </form>
      
    </div>
  </div>
</div>