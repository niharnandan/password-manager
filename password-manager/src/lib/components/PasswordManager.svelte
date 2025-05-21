<script lang="ts">
  import { onMount } from 'svelte';
  import { vault, lockVault, addPassword, updatePassword, deletePassword } from '$lib/stores/vault';
  import PasswordList from './PasswordList.svelte';
  import PasswordForm from './PasswordForm.svelte';
  import CategoryTree from './CategoryTree.svelte';
  import { slide } from 'svelte/transition';
  
  // State for the UI
  let selectedCategory: string = 'all';
  let selectedPasswordId: string | null = null;
  let isAddingPassword: boolean = false;
  let isEditingPassword: boolean = false;
  let searchQuery: string = '';
  
  // Mobile drawer state
  let drawerOpen: boolean = false;
  
  // Toggle drawer
  function toggleDrawer() {
    drawerOpen = !drawerOpen;
  }
  
  // Close drawer (useful after selecting a category on mobile)
  function closeDrawer() {
    drawerOpen = false;
  }
  
  // Derived state for filtering passwords
  $: filteredPasswords = $vault?.vault?.filter(entry => {
    const matchesCategory = selectedCategory === 'all' || entry.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.url.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesCategory && matchesSearch;
  }) || [];
  
  // Extract all unique categories for the sidebar
  $: categories = $vault?.vault 
    ? Array.from(new Set($vault.vault.map(entry => entry.category)))
    : [];
  
  // Handle category selection
  function selectCategory(category: string) {
    selectedCategory = category;
    selectedPasswordId = null;
    closeDrawer(); // Close drawer after selection on mobile
  }
  
  // Password selection handler
  function selectPassword(id: string) {
    selectedPasswordId = id;
    isAddingPassword = false;
    isEditingPassword = false;
  }
  
  // Start adding a new password
  function startAddPassword() {
    selectedPasswordId = null;
    isAddingPassword = true;
    isEditingPassword = false;
  }
  
  // Start editing a password
  function startEditPassword() {
    if (selectedPasswordId) {
      isEditingPassword = true;
      isAddingPassword = false;
    }
  }
  
  // Cancel form
  function cancelForm() {
    isAddingPassword = false;
    isEditingPassword = false;
  }
  
  // Handle password form submission
  function handlePasswordSubmit(event: CustomEvent) {
    const passwordData = event.detail;
    
    if (isAddingPassword) {
      addPassword({
        title: passwordData.title,
        username: passwordData.username,
        password: passwordData.password,
        url: passwordData.url,
        category: passwordData.category,
        notes: passwordData.notes
      });
      isAddingPassword = false;
    } else if (isEditingPassword && selectedPasswordId) {
      updatePassword(selectedPasswordId, {
        title: passwordData.title,
        username: passwordData.username,
        password: passwordData.password,
        url: passwordData.url,
        category: passwordData.category,
        notes: passwordData.notes
      });
      isEditingPassword = false;
    }
  }
  
  // Handle password deletion
  function handleDeletePassword() {
    if (selectedPasswordId) {
      deletePassword(selectedPasswordId);
      selectedPasswordId = null;
    }
  }
  
  // Handle logout
  function handleLogout() {
    lockVault();
  }
</script>

<div class="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
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
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">Secure Password Manager</h1>
        </div>
        <div class="flex items-center space-x-4">
          <div class="relative hidden sm:block">
            <input
              type="search"
              placeholder="Search passwords..."
              bind:value={searchQuery}
              class="w-48 md:w-64 pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
              </svg>
            </div>
          </div>
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
          <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </nav>
  
  <!-- Main content -->
  <div class="flex-1 flex flex-col md:flex-row overflow-hidden relative">
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
              {drawerOpen ? 'fixed inset-y-0 left-0 z-20' : 'hidden'} 
              md:relative md:block md:w-64 md:z-0"
      transition:slide={{ duration: 200 }}
    >
      <div class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white">Categories</h2>
          
          <!-- Close button for mobile -->
          <button 
            on:click={closeDrawer}
            class="md:hidden text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
            aria-label="Close menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
        
        <CategoryTree 
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={selectCategory}
        />
        <button
          on:click={() => selectCategory('all')}
          class="mt-4 w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 {selectedCategory === 'all' ? 'bg-gray-100 dark:bg-gray-700' : ''}"
        >
          All Passwords
        </button>
      </div>
    </aside>
    
    <!-- Password list and details - responsive layout -->
    <main class="flex-1 flex flex-col md:flex-row overflow-hidden">
      <!-- Password list -->
      <div class="bg-white dark:bg-gray-800 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 overflow-y-auto md:w-1/3">
        <div class="p-4">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">
              {selectedCategory === 'all' ? 'All Passwords' : selectedCategory}
            </h2>
            <button
              on:click={startAddPassword}
              class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Add New
            </button>
          </div>
          
          <PasswordList
            passwords={filteredPasswords}
            selectedPasswordId={selectedPasswordId}
            onSelectPassword={selectPassword}
          />
        </div>
      </div>
      
      <!-- Password details/form - on mobile will be below the list -->
      <div class="flex-1 bg-white dark:bg-gray-800 overflow-y-auto p-4 md:p-6">
        {#if isAddingPassword}
          <div class="mb-4 flex justify-between items-center">
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">Add New Password</h2>
            <button 
              on:click={cancelForm}
              class="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
            >
              Cancel
            </button>
          </div>
          <PasswordForm 
            initialCategory={selectedCategory !== 'all' ? selectedCategory : ''}
            onCancel={cancelForm}
            on:submit={handlePasswordSubmit}
          />
        {:else if isEditingPassword && selectedPasswordId && $vault}
          <div class="mb-4 flex justify-between items-center">
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">Edit Password</h2>
            <button 
              on:click={cancelForm}
              class="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
            >
              Cancel
            </button>
          </div>
          <PasswordForm 
            password={$vault?.vault.find(entry => entry.id === selectedPasswordId)}
            onCancel={cancelForm}
            on:submit={handlePasswordSubmit}
          />
        {:else if selectedPasswordId && $vault?.vault}
          {#each $vault.vault.filter(entry => entry.id === selectedPasswordId) as entry}
            <div class="mb-4 flex justify-between items-center">
              <h2 class="text-lg font-medium text-gray-900 dark:text-white">{entry.title}</h2>
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
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Username</h3>
                  <div class="mt-1 flex items-center">
                    <p class="text-sm text-gray-900 dark:text-white">{entry.username}</p>
                    <!-- svelte-ignore a11y_consider_explicit_label -->
                    <button 
                      class="ml-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                      on:click={() => navigator.clipboard.writeText(entry.username)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div>
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Password</h3>
                  <div class="mt-1 flex items-center">
                    <p class="text-sm text-gray-900 dark:text-white">••••••••••••</p>
                    <!-- svelte-ignore a11y_consider_explicit_label -->
                    <button 
                      class="ml-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                      on:click={() => navigator.clipboard.writeText(entry.password)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div>
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Website</h3>
                  <div class="mt-1 flex items-center">
                    <a 
                      href={entry.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      class="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {entry.url}
                    </a>
                  </div>
                </div>
                
                <div>
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Category</h3>
                  <p class="mt-1 text-sm text-gray-900 dark:text-white">{entry.category}</p>
                </div>
              </div>
              
              {#if entry.notes}
                <div class="mt-4">
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Notes</h3>
                  <p class="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-line">{entry.notes}</p>
                </div>
              {/if}
            </div>
            
            <div class="text-xs text-gray-500 dark:text-gray-400">
              <p>Created: {new Date(entry.created).toLocaleString()}</p>
              <p>Last modified: {new Date(entry.modified).toLocaleString()}</p>
            </div>
          {/each}
        {:else}
          <div class="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p class="text-lg font-medium">Select a password or add a new one</p>
          </div>
        {/if}
      </div>
    </main>
  </div>
</div>