<script lang="ts">
  import { onMount } from "svelte";
  import {
    vault,
    lockVault,
    clearAllData,
    addPassword,
    updatePassword,
    deletePassword,
    updateGlobalNotes,
    exportVault,
    importVault,
    unlockVault,
    syncStatus,
    loadVaultFromGitHub,
  } from "$lib/stores/vault";
  import { clearWebAuthnCredential } from "$lib/utils/webauthn";
  import { isGitHubAuthenticated } from "$lib/stores/github-auth";
  import PasswordList from "./PasswordList.svelte";
  import PasswordForm from "./PasswordForm.svelte";
  import CategoryTree from "./CategoryTree.svelte";
  import { slide } from "svelte/transition";

  // State for the UI
  let selectedCategory: string = "all";
  let selectedPasswordId: string | null = null;
  let isAddingPassword: boolean = false;
  let isEditingPassword: boolean = false;
  let searchQuery: string = "";
  let showingNotes: boolean = false; // New state for notes view

  // Notes editing state
  let isEditingNotes: boolean = false;
  let notesEditContent: string = "";

  // Import/Export state
  let showImportModal: boolean = false;
  let importFile: File | null = null;
  let importPassword: string = "";
  let importError: string = "";
  let showImportConfirmation: boolean = false;
  let importFileContent: string = "";

  // Mobile drawer state
  let drawerOpen: boolean = false;

  // Password visibility state
  let showPassword: boolean = false;

  // Toggle drawer
  function toggleDrawer() {
    drawerOpen = !drawerOpen;
  }

  // Close drawer (useful after selecting a category on mobile)
  function closeDrawer() {
    drawerOpen = false;
  }

  // Toggle password visibility
  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  // Manual sync - fetch latest passwords from GitHub
  async function handleSyncClick() {
    if (!$isGitHubAuthenticated || $syncStatus.syncing) return;
    
    try {
      // Fetch the latest from GitHub
      await loadVaultFromGitHub();
    } catch (error) {
      console.error("Manual sync failed:", error);
    }
  }

  // Derived state for filtering and sorting passwords
  $: filteredPasswords =
    $vault?.vault?.filter((entry) => {
      const matchesCategory =
        selectedCategory === "all" || entry.category === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.url.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    }).sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase())) || [];

  // Extract all unique categories for the sidebar - Uncategorized first, then alphabetical
  $: categories = $vault?.vault
    ? Array.from(new Set($vault.vault.map((entry) => entry.category).filter(cat => cat.trim() !== ""))).sort((a, b) => {
        if (a === "Uncategorized" && b !== "Uncategorized") return -1;
        if (b === "Uncategorized" && a !== "Uncategorized") return 1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
      })
    : [];

  // Handle category selection
  function selectCategory(category: string) {
    selectedCategory = category;
    selectedPasswordId = null;
    showingNotes = false; // Hide notes when selecting category
    closeDrawer(); // Close drawer after selection on mobile
  }

  // Handle notes selection
  function selectNotes() {
    showingNotes = true;
    selectedPasswordId = null;
    selectedCategory = "";
    isAddingPassword = false;
    isEditingPassword = false;
    closeDrawer(); // Close drawer after selection on mobile
  }

  // Password selection handler
  function selectPassword(id: string) {
    selectedPasswordId = id;
    showingNotes = false;
    isAddingPassword = false;
    isEditingPassword = false;
    showPassword = false; // Reset password visibility when selecting a new password
  }

  // Start adding a new password
  function startAddPassword() {
    selectedPasswordId = null;
    showingNotes = false;
    isAddingPassword = true;
    isEditingPassword = false;
  }

  // Start editing a password
  function startEditPassword() {
    if (selectedPasswordId) {
      isEditingPassword = true;
      isAddingPassword = false;
      showingNotes = false;
    }
  }

  // Cancel form
  function cancelForm() {
    isAddingPassword = false;
    isEditingPassword = false;
  }

  // Notes editing functions
  function startEditNotes() {
    isEditingNotes = true;
    notesEditContent = $vault?.globalNotes || "";
  }

  async function saveNotes() {
    await updateGlobalNotes(notesEditContent);
    isEditingNotes = false;
  }

  function cancelEditNotes() {
    isEditingNotes = false;
    notesEditContent = "";
  }

  // Handle password form submission
  async function handlePasswordSubmit(event: CustomEvent) {
    const passwordData = event.detail;

    if (isAddingPassword) {
      await addPassword({
        title: passwordData.title,
        username: passwordData.username,
        password: passwordData.password,
        url: passwordData.url,
        category: passwordData.category,
        notes: passwordData.notes,
      });
      isAddingPassword = false;
    } else if (isEditingPassword && selectedPasswordId) {
      await updatePassword(selectedPasswordId, {
        title: passwordData.title,
        username: passwordData.username,
        password: passwordData.password,
        url: passwordData.url,
        category: passwordData.category,
        notes: passwordData.notes,
      });
      isEditingPassword = false;
    }
  }

  // Handle password deletion
  async function handleDeletePassword() {
    if (selectedPasswordId) {
      await deletePassword(selectedPasswordId);
      selectedPasswordId = null;
    }
  }

  // Handle logout
  function handleLogout() {
    lockVault();
  }
  
  // Handle complete logout (clear all data including cache)
  function handleCompleteLogout() {
    clearAllData();
    clearWebAuthnCredential();
  }

  // Export vault to file
  function handleExportVault() {
    const vaultData = exportVault();
    if (!vaultData) return;

    const blob = new Blob([vaultData], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `vault-backup-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // Handle file selection for import
  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      importFile = input.files[0];
    }
  }

  // Start import process
  function startImport() {
    showImportModal = true;
    importFile = null;
    importPassword = "";
    importError = "";
    showImportConfirmation = false;
    importFileContent = "";
  }

  // Process the selected import file
  function processImportFile() {
    if (!importFile) {
      importError = "Please select a vault file to import";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        // Basic validation - check if it's JSON
        JSON.parse(content);
        importFileContent = content;
        showImportConfirmation = true;
      } catch (error) {
        importError = "The selected file is not a valid vault file";
        console.error("Error parsing import file:", error);
      }
    };
    reader.onerror = () => {
      importError = "Error reading the file";
    };
    reader.readAsText(importFile);
  }

  // Verify password and import vault
  async function confirmImport() {
    if (!importPassword) {
      importError = "Please enter your master password";
      return;
    }

    try {
      // First verify the password is correct
      const unlockSuccess = await unlockVault(importPassword);
      if (unlockSuccess) {
        // Then import the vault data
        if (importVault(importFileContent)) {
          // Close the modal
          showImportModal = false;
          // Reset state
          importFile = null;
          importPassword = "";
          importError = "";
          showImportConfirmation = false;
          importFileContent = "";
        } else {
          importError = "Failed to import vault data";
        }
      } else {
        importError = "Incorrect master password";
      }
    } catch (error) {
      importError = "An error occurred during import";
      console.error("Import error:", error);
    }
  }

  // Cancel import
  function cancelImport() {
    showImportModal = false;
    importFile = null;
    importPassword = "";
    importError = "";
    showImportConfirmation = false;
    importFileContent = "";
  }
</script>

<div class="h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
  <!-- Top navbar -->
  <nav class="bg-white dark:bg-gray-800 shadow-sm">
    <div class="w-full mx-auto px-4">
      <div class="flex justify-between h-16">
        <div class="flex items-center">
          <!-- Hamburger button for mobile -->
          <button
            on:click={toggleDrawer}
            class="md:hidden mr-3 text-gray-600 dark:text-gray-300 focus:outline-none"
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
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">
            Secure Password Manager
          </h1>
        </div>
        <div class="flex items-center space-x-4">
          <!-- Add New button -->
          <button
            on:click={startAddPassword}
            class="hidden sm:inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              class="w-48 md:w-64 pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <button disabled class="flex items-center text-blue-600 text-sm cursor-not-allowed">
                  <svg class="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Syncing...
                </button>
              {:else if $syncStatus.error}
                <button 
                  on:click={handleSyncClick}
                  class="flex items-center text-red-600 text-sm hover:text-red-800 transition-colors cursor-pointer" 
                  title={$syncStatus.error}
                >
                  <svg class="h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  Sync error
                </button>
              {:else if $syncStatus.lastSync}
                <button 
                  on:click={handleSyncClick}
                  class="flex items-center text-green-600 text-sm hover:text-green-800 transition-colors cursor-pointer"
                  title="Click to fetch latest passwords from GitHub"
                >
                  <svg class="h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Synced
                </button>
              {:else}
                <button 
                  on:click={handleSyncClick}
                  class="flex items-center text-gray-600 text-sm hover:text-gray-800 transition-colors cursor-pointer"
                  title="Click to fetch latest passwords from GitHub"
                >
                  <svg class="h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync
                </button>
              {/if}
            </div>
          {/if}

          <button
            on:click={handleLogout}
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
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
            class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            class="inline-flex justify-center items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <button disabled class="inline-flex items-center px-3 py-1 text-blue-600 text-sm cursor-not-allowed border border-blue-300 rounded-md">
                  <svg class="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Syncing...
                </button>
              {:else if $syncStatus.error}
                <button 
                  on:click={handleSyncClick}
                  class="inline-flex items-center px-3 py-1 text-red-600 text-sm hover:text-red-800 transition-colors cursor-pointer border border-red-300 rounded-md hover:bg-red-50"
                  title={$syncStatus.error}
                >
                  <svg class="h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  Error
                </button>
              {:else if $syncStatus.lastSync}
                <button 
                  on:click={handleSyncClick}
                  class="inline-flex items-center px-3 py-1 text-green-600 text-sm hover:text-green-800 transition-colors cursor-pointer border border-green-300 rounded-md hover:bg-green-50"
                  title="Click to fetch latest passwords from GitHub"
                >
                  <svg class="h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Synced
                </button>
              {:else}
                <button 
                  on:click={handleSyncClick}
                  class="inline-flex items-center px-3 py-1 text-gray-600 text-sm hover:text-gray-800 transition-colors cursor-pointer border border-gray-300 rounded-md hover:bg-gray-50"
                  title="Click to fetch latest passwords from GitHub"
                >
                  <svg class="h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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

  <!-- Main content -->
  <div class="flex-1 flex flex-row overflow-hidden relative min-h-0">
    <!-- Mobile overlay to close drawer when clicking outside -->
    {#if drawerOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="fixed inset-0 bg-black bg-opacity-50 z-10 md:hidden"
        on:click={closeDrawer}
        transition:slide={{ duration: 150 }}
      ></div>
    {/if}

    <!-- Sidebar with categories (drawer on mobile) -->
    <aside
      class="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto
              {drawerOpen ? 'fixed inset-y-0 left-0 z-20 w-64' : 'hidden'} 
              md:relative md:block md:w-64 md:z-0"
      transition:slide={{ duration: 200 }}
    >
      <div class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white">
            Categories
          </h2>

          <!-- Close button for mobile -->
          <button
            on:click={closeDrawer}
            class="md:hidden text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
            aria-label="Close menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        <CategoryTree
          {categories}
          {selectedCategory}
          onSelectCategory={selectCategory}
        />

        <button
          on:click={() => selectCategory("all")}
          class="mt-4 w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer {selectedCategory ===
            'all' && !showingNotes
            ? 'bg-gray-100 dark:bg-gray-700'
            : ''}"
        >
          All Passwords
        </button>

        <!-- Notes section -->
        <button
          on:click={selectNotes}
          class="mt-2 w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center cursor-pointer {showingNotes
            ? 'bg-gray-100 dark:bg-gray-700'
            : ''}"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 mr-2"
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
          Notes
        </button>
      </div>
    </aside>

    {#if !showingNotes}
      <!-- Password list - 50% width on mobile, 1/3 on desktop -->
      <div
        class="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto w-1/2 md:w-1/3"
      >
        <div class="p-4">
          <div class="mb-4">
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">
              {selectedCategory === "all" ? "All Passwords" : selectedCategory}
            </h2>
          </div>

          <PasswordList
            passwords={filteredPasswords}
            {selectedPasswordId}
            onSelectPassword={selectPassword}
          />
        </div>
      </div>

      <!-- Password details/form - 50% width on mobile, 2/3 on desktop -->
      <div class="flex-1 bg-white dark:bg-gray-800 overflow-y-auto p-4 md:p-6">
        {#if isAddingPassword}
          <div class="mb-4 flex justify-between items-center">
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">
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
            initialCategory={selectedCategory !== "all" ? selectedCategory : ""}
            onCancel={cancelForm}
            on:submit={handlePasswordSubmit}
          />
        {:else if isEditingPassword && selectedPasswordId && $vault}
          <div class="mb-4 flex justify-between items-center">
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">
              Edit Password
            </h2>
            <button
              on:click={cancelForm}
              class="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
            >
              Cancel
            </button>
          </div>
          <PasswordForm
            password={$vault?.vault.find(
              (entry) => entry.id === selectedPasswordId
            )}
            onCancel={cancelForm}
            on:submit={handlePasswordSubmit}
          />
        {:else if selectedPasswordId && $vault?.vault}
          {#each $vault.vault.filter((entry) => entry.id === selectedPasswordId) as entry}
            <div class="mb-4 flex justify-between items-center">
              <h2 class="text-lg font-medium text-gray-900 dark:text-white">
                {entry.title}
              </h2>
              <div class="flex space-x-2">
                <button
                  on:click={startEditPassword}
                  class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Edit
                </button>
                <button
                  on:click={handleDeletePassword}
                  class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Delete
                </button>
              </div>
            </div>

            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
              <div class="grid grid-cols-1 gap-4">
                <div>
                  <h3
                    class="text-sm font-medium text-gray-500 dark:text-gray-400"
                  >
                    Username
                  </h3>
                  <div class="mt-1 flex items-center">
                    <p class="text-sm text-gray-900 dark:text-white break-all">
                      {entry.username}
                    </p>
                    <!-- svelte-ignore a11y_consider_explicit_label -->
                    <button
                      class="ml-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 flex-shrink-0"
                      on:click={() =>
                        navigator.clipboard.writeText(entry.username)}
                    >
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
                    </button>
                  </div>
                </div>

                <div>
                  <h3
                    class="text-sm font-medium text-gray-500 dark:text-gray-400"
                  >
                    Password
                  </h3>
                  <div class="mt-1 flex items-center">
                    <p class="text-sm text-gray-900 dark:text-white break-all">
                      {showPassword ? entry.password : "••••••••••••"}
                    </p>
                    <div class="ml-2 flex space-x-1">
                      <!-- Eye icon to toggle password visibility -->
                      <!-- svelte-ignore a11y_consider_explicit_label -->
                      <button
                        class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 flex-shrink-0"
                        on:click={togglePasswordVisibility}
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {#if showPassword}
                          <!-- Eye slash (hide) icon -->
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
                          <!-- Eye (show) icon -->
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
                      
                      <!-- Copy button -->
                      <!-- svelte-ignore a11y_consider_explicit_label -->
                      <button
                        class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 flex-shrink-0"
                        on:click={() =>
                          navigator.clipboard.writeText(entry.password)}
                        title="Copy password"
                      >
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
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <h3
                    class="text-sm font-medium text-gray-500 dark:text-gray-400"
                  >
                    Website
                  </h3>
                  <div class="mt-1 flex items-center">
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 break-all"
                    >
                      {entry.url}
                    </a>
                  </div>
                </div>

                <div>
                  <h3
                    class="text-sm font-medium text-gray-500 dark:text-gray-400"
                  >
                    Category
                  </h3>
                  <p class="mt-1 text-sm text-gray-900 dark:text-white">
                    {entry.category}
                  </p>
                </div>

                {#if entry.notes}
                  <div>
                    <h3
                      class="text-sm font-medium text-gray-500 dark:text-gray-400"
                    >
                      Notes
                    </h3>
                    <p
                      class="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-line"
                    >
                      {entry.notes}
                    </p>
                  </div>
                {/if}
              </div>
            </div>

            <div class="text-xs text-gray-500 dark:text-gray-400">
              <p>Created: {new Date(entry.created).toLocaleString()}</p>
              <p>Last modified: {new Date(entry.modified).toLocaleString()}</p>
            </div>
          {/each}
        {:else}
          <div
            class="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-16 w-16 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <p class="text-lg font-medium">
              Select a password or add a new one
            </p>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Notes section - full width when selected -->
      <div class="flex-1 bg-white dark:bg-gray-800 overflow-y-auto p-4 md:p-6">
        <div class="mb-4 flex justify-between items-center">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white">
            Global Notes
          </h2>
          {#if !isEditingNotes}
            <button
              on:click={startEditNotes}
              class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Edit
            </button>
          {:else}
            <div class="flex space-x-2">
              <button
                on:click={saveNotes}
                class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                Save
              </button>
              <button
                on:click={cancelEditNotes}
                class="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
            </div>
          {/if}
        </div>

        {#if isEditingNotes}
          <!-- svelte-ignore a11y_autofocus -->
          <!-- svelte-ignore element_invalid_self_closing_tag -->
          <textarea
            bind:value={notesEditContent}
            rows="20"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm break-words"
            placeholder="Write your notes here..."
            autofocus
          />
        {:else}
          <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 min-h-96">
            {#if $vault?.globalNotes}
              <pre
                class="whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-white font-mono">{$vault.globalNotes}</pre>
            {:else}
              <p class="text-gray-500 dark:text-gray-400 text-sm">
                No notes yet. Click "Edit" to add some notes.
              </p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Import Modal -->
  {#if showImportModal}
    <div
      class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
    >
      <div
        class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full"
      >
        <div class="p-6">
          <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">
            {showImportConfirmation ? "Confirm Import" : "Import Vault"}
          </h2>

          {#if showImportConfirmation}
            <p class="mb-4 text-gray-700 dark:text-gray-300">
              Warning: Importing a vault will replace all your current
              passwords. This action cannot be undone.
            </p>
            <div class="mb-4">
              <label
                for="import-password"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Enter your master password to confirm
              </label>
              <input
                id="import-password"
                type="password"
                bind:value={importPassword}
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Master password"
              />
            </div>
          {:else}
            <p class="mb-4 text-gray-700 dark:text-gray-300">
              Import an encrypted vault backup to restore your passwords.
            </p>
            <div class="mb-4">
              <!-- svelte-ignore a11y_label_has_associated_control -->
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Select vault backup file
              </label>
              <input
                type="file"
                accept=".json"
                on:change={handleFileSelect}
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          {/if}

          {#if importError}
            <p class="mb-4 text-sm text-red-600">{importError}</p>
          {/if}

          <div class="flex justify-end space-x-3">
            <button
              type="button"
              on:click={cancelImport}
              class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>

            {#if showImportConfirmation}
              <button
                type="button"
                on:click={confirmImport}
                class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Confirm Import
              </button>
            {:else}
              <button
                type="button"
                on:click={processImportFile}
                class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!importFile}
              >
                Next
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
