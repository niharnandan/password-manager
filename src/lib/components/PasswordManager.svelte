<script lang="ts">
  import {
    vault,
    lockVault,
    addPassword,
    updatePassword,
    deletePassword,
    syncStatus,
    loadVaultFromGitHub,
  } from "$lib/stores/vault";
  import { isGitHubAuthenticated } from "$lib/stores/github-auth";
  import PasswordList from "./PasswordList.svelte";
  import PasswordForm from "./PasswordForm.svelte";
  import { getFaviconUrl, hasFavicon } from "$lib/utils/favicon";

  let selectedPasswordId: string | null = null;
  let isAddingPassword = false;
  let isEditingPassword = false;
  let searchQuery = "";
  let mobileMenuOpen = false;
  let showPassword = false;
  let copiedUsernameId: string | null = null;
  let copiedPasswordId: string | null = null;

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  async function copyUsername(username: string, entryId: string) {
    await navigator.clipboard.writeText(username);
    copiedUsernameId = entryId;
    setTimeout(() => {
      if (copiedUsernameId === entryId) {
        copiedUsernameId = null;
      }
    }, 2000);
  }

  async function copyPasswordField(password: string, entryId: string) {
    await navigator.clipboard.writeText(password);
    copiedPasswordId = entryId;
    setTimeout(() => {
      if (copiedPasswordId === entryId) {
        copiedPasswordId = null;
      }
    }, 2000);
  }

  async function handleSyncClick() {
    if (!$isGitHubAuthenticated || $syncStatus.syncing) return;

    try {
      // Fetch the latest from GitHub
      await loadVaultFromGitHub();
    } catch (error) {
      console.error("Manual sync failed:", error);
    }
  }

  $: filteredPasswords =
    $vault?.vault
      ?.filter((entry) => {
        if (!searchQuery) return true;

        const query = searchQuery.toLowerCase();
        return (
          entry.title.toLowerCase().includes(query) ||
          entry.username.toLowerCase().includes(query) ||
          entry.url.toLowerCase().includes(query)
        );
      })
      .sort((a, b) =>
        a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
      ) || [];

  function selectPassword(id: string) {
    selectedPasswordId = id;
    isAddingPassword = false;
    isEditingPassword = false;
    showPassword = false;
    mobileMenuOpen = false;
  }

  function startAddPassword() {
    selectedPasswordId = null;
    isAddingPassword = true;
    isEditingPassword = false;
    mobileMenuOpen = false;
  }

  function startEditPassword() {
    if (selectedPasswordId) {
      isEditingPassword = true;
      isAddingPassword = false;
    }
  }

  function cancelForm() {
    isAddingPassword = false;
    isEditingPassword = false;
  }
  async function handlePasswordSubmit(event: CustomEvent) {
    const passwordData = event.detail;

    if (isAddingPassword) {
      await addPassword({
        title: passwordData.title,
        username: passwordData.username,
        password: passwordData.password,
        url: passwordData.url,
        notes: passwordData.notes,
      });
      isAddingPassword = false;
    } else if (isEditingPassword && selectedPasswordId) {
      await updatePassword(selectedPasswordId, {
        title: passwordData.title,
        username: passwordData.username,
        password: passwordData.password,
        url: passwordData.url,
        notes: passwordData.notes,
      });
      isEditingPassword = false;
    }
  }

  async function handleDeletePassword() {
    if (selectedPasswordId) {
      await deletePassword(selectedPasswordId);
      selectedPasswordId = null;
    }
  }

  function handleLogout() {
    lockVault();
  }
</script>

<div class="h-screen bg-slate-50 dark:bg-gray-900 flex flex-col">
  <!-- Top navbar -->
  <nav
    class="bg-gradient-to-r from-white via-white to-slate-50/50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-850 shadow-premium-lg border-b border-gray-200/80 dark:border-gray-700/80 backdrop-blur-sm transition-all duration-300"
  >
    <div class="w-full mx-auto px-3">
      <div class="flex justify-between h-14">
        <div class="flex items-center">
          <!-- Hamburger menu button (mobile only) -->
          <button
            on:click={() => (mobileMenuOpen = !mobileMenuOpen)}
            class="md:hidden mr-3 p-2 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors duration-200"
            aria-label="Toggle menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <h1 class="text-2xl font-bold animate-shimmer">
            Secure Password Manager
          </h1>
        </div>
        <div class="flex items-center space-x-4">
          <!-- Add New button -->
          <button
            on:click={startAddPassword}
            class="hidden sm:inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-lg text-white gradient-blue btn-gradient-shift btn-hover-shine btn-hover-elevate focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Add New
          </button>

          <div class="relative hidden sm:block">
            <input
              type="search"
              placeholder="Search passwords..."
              bind:value={searchQuery}
              class="w-48 md:w-64 pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm hover:shadow-md transition-all duration-300"
            />
            <div
              class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"
            >
              <svg
                class="h-5 w-5 text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
          </div>

          <!-- Sync Status -->
          {#if $isGitHubAuthenticated}
            <div class="hidden sm:flex items-center space-x-2">
              {#if $syncStatus.syncing}
                <button
                  disabled
                  class="flex items-center text-blue-600 dark:text-blue-400 text-sm font-medium cursor-not-allowed"
                >
                  <svg
                    class="animate-spin h-4 w-4 mr-1.5"
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
                  Syncing...
                </button>
              {:else if $syncStatus.error}
                <button
                  on:click={handleSyncClick}
                  class="flex items-center text-red-600 dark:text-red-400 text-sm font-medium hover:text-red-700 dark:hover:text-red-300 transition-colors cursor-pointer"
                  title={$syncStatus.error}
                >
                  <svg
                    class="h-4 w-4 mr-1.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  Sync error
                </button>
              {:else if $syncStatus.lastSync}
                <button
                  on:click={handleSyncClick}
                  class="flex items-center text-green-600 dark:text-green-400 text-sm font-medium hover:text-green-700 dark:hover:text-green-300 transition-colors cursor-pointer"
                  title="Click to fetch latest passwords from GitHub"
                >
                  <svg
                    class="h-4 w-4 mr-1.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Synced
                </button>
              {:else}
                <button
                  on:click={handleSyncClick}
                  class="flex items-center text-gray-700 dark:text-gray-300 text-sm font-medium hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
                  title="Click to fetch latest passwords from GitHub"
                >
                  <svg
                    class="h-4 w-4 mr-1.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Sync
                </button>
              {/if}
            </div>
          {/if}

          <button
            on:click={handleLogout}
            class="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 btn-hover-elevate"
          >
            Logout
          </button>
        </div>
      </div>

      <!-- Mobile search box -->
      <div class="sm:hidden pb-3">
        <div class="relative">
          <input
            type="search"
            placeholder="Search passwords..."
            bind:value={searchQuery}
            class="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all duration-300"
          />
          <div
            class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"
          >
            <svg
              class="h-5 w-5 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
        </div>
        <!-- Mobile buttons -->
        <div class="flex items-center justify-between mt-2 gap-2">
          <button
            on:click={startAddPassword}
            class="inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-lg text-white gradient-blue btn-gradient-shift btn-hover-shine btn-hover-elevate focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Add New
          </button>

          <!-- Mobile Sync Status -->
          {#if $isGitHubAuthenticated}
            <div class="flex items-center">
              {#if $syncStatus.syncing}
                <button
                  disabled
                  class="inline-flex items-center px-3 py-2 text-blue-600 dark:text-blue-400 text-sm font-medium cursor-not-allowed border border-blue-300 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/20"
                >
                  <svg
                    class="animate-spin h-4 w-4 mr-1.5"
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
                  Syncing...
                </button>
              {:else if $syncStatus.error}
                <button
                  on:click={handleSyncClick}
                  class="inline-flex items-center px-3 py-2 text-red-600 dark:text-red-400 text-sm font-medium hover:text-red-700 dark:hover:text-red-300 transition-colors cursor-pointer border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                  title={$syncStatus.error}
                >
                  <svg
                    class="h-4 w-4 mr-1.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  Error
                </button>
              {:else if $syncStatus.lastSync}
                <button
                  on:click={handleSyncClick}
                  class="inline-flex items-center px-3 py-2 text-green-600 dark:text-green-400 text-sm font-medium hover:text-green-700 dark:hover:text-green-300 transition-colors cursor-pointer border border-green-300 dark:border-green-700 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20"
                  title="Click to fetch latest passwords from GitHub"
                >
                  <svg
                    class="h-4 w-4 mr-1.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Synced
                </button>
              {:else}
                <button
                  on:click={handleSyncClick}
                  class="inline-flex items-center px-3 py-2 text-gray-700 dark:text-gray-300 text-sm font-medium hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  title="Click to fetch latest passwords from GitHub"
                >
                  <svg
                    class="h-4 w-4 mr-1.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Sync
                </button>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </nav>

  <div class="flex-1 flex flex-row overflow-hidden relative min-h-0">
      <div
        class="bg-gradient-to-b from-white via-white to-slate-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-850 border-r border-gray-200 dark:border-gray-700 overflow-y-auto hidden md:block md:w-2/5 shadow-premium transition-all duration-300 custom-scrollbar"
      >
        <div class="p-4 pb-0">
          <PasswordList
            passwords={filteredPasswords}
            {selectedPasswordId}
            onSelectPassword={selectPassword}
          />
        </div>
      </div>

      <!-- Password details/form -->
      <div
        class="flex-1 bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-850 overflow-y-auto p-4 md:p-8 transition-all duration-300 animate-fade-in custom-scrollbar"
      >
        {#if isAddingPassword}
          <div class="mb-4 flex justify-between items-center">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Add New Password
            </h2>
            <button
              on:click={cancelForm}
              class="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
            >
              Cancel
            </button>
          </div>
          <PasswordForm
            onCancel={cancelForm}
            on:submit={handlePasswordSubmit}
          />
        {:else if isEditingPassword && selectedPasswordId && $vault}
          <div class="mb-4 flex justify-between items-center">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Edit Password
            </h2>
            <button
              on:click={cancelForm}
              class="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100 transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
          <PasswordForm
            password={$vault?.vault.find(
              (entry) => entry.id === selectedPasswordId,
            )}
            onCancel={cancelForm}
            on:submit={handlePasswordSubmit}
          />
        {:else if selectedPasswordId && $vault?.vault}
          {#each $vault.vault.filter((entry) => entry.id === selectedPasswordId) as entry (entry.id)}
            <div class="mb-4 flex justify-between items-center">
              <div class="flex items-center gap-3 text-glisten">
                {#if hasFavicon(entry.title)}
                  <img
                    src={getFaviconUrl(entry.title)}
                    alt={entry.title}
                    class="h-8 w-8 rounded-lg flex-shrink-0 object-contain bg-white dark:bg-gray-700 p-1 shadow-sm"
                    on:error={(e) => {
                      // Fallback to default icon on error
                      const img = e.currentTarget as HTMLImageElement;
                      img.style.display = 'none';
                      img.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div class="hidden h-8 w-8 rounded-lg flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                {:else}
                  <div class="h-8 w-8 rounded-lg flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                {/if}
                <h2
                  class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  {entry.title}
                </h2>
              </div>
              <div class="flex space-x-3">
                <button
                  on:click={startEditPassword}
                  class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-lg text-white gradient-blue btn-gradient-shift btn-hover-shine btn-hover-elevate focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 mr-1.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Edit
                </button>
                <button
                  on:click={handleDeletePassword}
                  class="inline-flex items-center px-4 py-2 border border-red-200 dark:border-red-800 text-sm font-medium rounded-lg text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 btn-hover-elevate"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 mr-1.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Delete
                </button>
              </div>
            </div>

            <div
              class="bg-gradient-to-br from-white via-white to-slate-50/40 dark:from-gray-800/80 dark:via-gray-800/60 dark:to-gray-700/50 rounded-xl p-6 mb-6 shadow-premium-lg ring-1 ring-gray-900/5 dark:ring-white/10 transition-shadow duration-300 backdrop-blur-sm"
            >
              <div class="grid grid-cols-1 gap-4">
                <div>
                  <h3
                    class="text-sm font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Username
                  </h3>
                  <div class="mt-1 flex items-center">
                    <p
                      class="text-sm text-gray-900 dark:text-gray-100 break-all font-medium"
                    >
                      {entry.username}
                    </p>
                    <button
                      class="ml-2 flex-shrink-0 transition-all duration-200 p-0.5 w-6 h-6 flex items-center justify-center cursor-pointer"
                      class:text-green-500={copiedUsernameId === entry.id}
                      class:text-gray-400={copiedUsernameId !== entry.id}
                      class:hover:text-gray-500={copiedUsernameId !== entry.id}
                      class:dark:hover:text-gray-300={copiedUsernameId !==
                        entry.id}
                      on:click={() => copyUsername(entry.username, entry.id)}
                      title={copiedUsernameId === entry.id
                        ? "Copied!"
                        : "Copy username"}
                    >
                      {#if copiedUsernameId === entry.id}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="2"
                            fill="none"
                            opacity="0.15"
                            class="animate-checkmark-pop"
                          />
                          <path
                            d="M20 6L9 17l-5-5"
                            class="animate-checkmark-draw"
                            style="stroke-dasharray: 50; stroke-dashoffset: 50;"
                          />
                        </svg>
                      {:else}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"
                          />
                          <path
                            d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"
                          />
                        </svg>
                      {/if}
                    </button>
                  </div>
                </div>

                <div>
                  <h3
                    class="text-sm font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Password
                  </h3>
                  <div class="mt-1 flex items-center">
                    <p
                      class="text-sm text-gray-900 dark:text-gray-100 break-all font-medium"
                    >
                      {showPassword ? entry.password : "••••••••••••"}
                    </p>
                    <div class="ml-2 flex space-x-1">
                      <button
                        class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 flex-shrink-0"
                        on:click={togglePasswordVisibility}
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {#if showPassword}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                            />
                          </svg>
                        {:else}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        {/if}
                      </button>

                      <button
                        class="flex-shrink-0 transition-all duration-200 p-0.5 w-6 h-6 flex items-center justify-center cursor-pointer"
                        class:text-green-500={copiedPasswordId === entry.id}
                        class:text-gray-400={copiedPasswordId !== entry.id}
                        class:hover:text-gray-500={copiedPasswordId !==
                          entry.id}
                        class:dark:hover:text-gray-300={copiedPasswordId !==
                          entry.id}
                        on:click={() =>
                          copyPasswordField(entry.password, entry.id)}
                        title={copiedPasswordId === entry.id
                          ? "Copied!"
                          : "Copy password"}
                      >
                        {#if copiedPasswordId === entry.id}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              stroke-width="2"
                              fill="none"
                              opacity="0.15"
                              class="animate-checkmark-pop"
                            />
                            <path
                              d="M20 6L9 17l-5-5"
                              class="animate-checkmark-draw"
                              style="stroke-dasharray: 50; stroke-dashoffset: 50;"
                            />
                          </svg>
                        {:else}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"
                            />
                            <path
                              d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"
                            />
                          </svg>
                        {/if}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <h3
                    class="text-sm font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Website
                  </h3>
                  <div class="mt-1 flex items-center">
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 break-all transition-colors duration-200 font-medium"
                    >
                      {entry.url}
                    </a>
                  </div>
                </div>

                {#if entry.notes}
                  <div>
                    <h3
                      class="text-sm font-semibold text-gray-600 dark:text-gray-300"
                    >
                      Notes
                    </h3>
                    <p
                      class="mt-1 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line"
                    >
                      {entry.notes}
                    </p>
                  </div>
                {/if}
              </div>
            </div>

            <div class="text-xs text-gray-600 dark:text-gray-400">
              <p>Created: {new Date(entry.created).toLocaleString()}</p>
              <p>Last modified: {new Date(entry.modified).toLocaleString()}</p>
            </div>
          {/each}
        {:else}
          <div
            class="flex flex-col items-center justify-center h-full animate-fade-in"
          >
            <div class="relative">
              <div
                class="absolute inset-0 bg-blue-500/10 rounded-full blur-3xl"
              ></div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-20 w-20 mb-6 text-blue-500/80 dark:text-blue-400/80 relative"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <p
              class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2"
            >
              Select a password to get started
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Or create a new one using the button above
            </p>
          </div>
        {/if}
      </div>
  </div>

  <!-- Mobile password list overlay drawer -->
  {#if mobileMenuOpen}
    <div class="fixed inset-0 z-40 md:hidden">
      <div
        class="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300"
        on:click={() => (mobileMenuOpen = false)}
        on:keydown={(e) => e.key === "Escape" && (mobileMenuOpen = false)}
        role="button"
        tabindex="0"
        aria-label="Close menu"
      ></div>

      <div
        class="absolute left-0 top-0 bottom-0 w-4/5 max-w-sm bg-gradient-to-b from-white via-white to-slate-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-850 shadow-premium-lg animate-slide-in-left overflow-y-auto border-r border-gray-200 dark:border-gray-700 custom-scrollbar"
      >
        <div class="p-4 pb-0">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              All Passwords
            </h2>
            <button
              on:click={() => (mobileMenuOpen = false)}
              class="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100 p-1"
              aria-label="Close menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <PasswordList
            passwords={filteredPasswords}
            {selectedPasswordId}
            onSelectPassword={selectPassword}
          />
        </div>
      </div>
    </div>
  {/if}
</div>
