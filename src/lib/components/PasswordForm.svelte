<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { PasswordEntry } from "$lib/types/password";
  import { vault } from "$lib/stores/vault";

  export let password: PasswordEntry | undefined = undefined;
  export let initialCategory: string = "";
  export let onCancel: () => void;

  const dispatch = createEventDispatcher();

  // Initialize form data
  let formData = {
    title: password?.title || "",
    username: password?.username || "",
    password: password?.password || "",
    url: password?.url || "",
    category: password?.category || initialCategory || "",
    notes: password?.notes || "",
  };

  // Extract existing categories for the dropdown - Uncategorized first, then alphabetical
  $: existingCategories = $vault
    ? Array.from(new Set($vault.vault.map((entry) => entry.category).filter(cat => cat.trim() !== ""))).sort((a, b) => {
        if (a === "Uncategorized" && b !== "Uncategorized") return -1;
        if (b === "Uncategorized" && a !== "Uncategorized") return 1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
      })
    : [];

  // Generate a secure random password
  function generatePassword() {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
    const passwordLength = 16;
    let newPassword = "";

    for (let i = 0; i < passwordLength; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      newPassword += chars.charAt(randomIndex);
    }

    formData.password = newPassword;
  }

  // Handle form submission
  function handleSubmit() {
    // Default empty category to "Uncategorized"
    const submitData = {
      ...formData,
      category: formData.category.trim() || "Uncategorized"
    };
    dispatch("submit", submitData);
  }

  // Toggle password visibility
  let showPassword = false;
  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }
</script>

<form on:submit|preventDefault={handleSubmit} class="space-y-4">
  <div>
    <label
      for="title"
      class="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >Title</label
    >
    <input
      id="title"
      type="text"
      bind:value={formData.title}
      required
      class="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>

  <div>
    <label
      for="username"
      class="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >Username / Email</label
    >
    <input
      id="username"
      type="text"
      bind:value={formData.username}
      class="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>

  <div>
    <label
      for="password"
      class="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >Password</label
    >
    <div class="mt-1 relative rounded-md shadow-sm">
      <input
        id="password"
        type={showPassword ? "text" : "password"}
        bind:value={formData.password}
        required
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-20"
      />
      <div class="absolute inset-y-0 right-0 flex items-center">
        <button
          type="button"
          on:click={togglePasswordVisibility}
          class="p-1 mr-1 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            {#if showPassword}
              <path
                fill-rule="evenodd"
                d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                clip-rule="evenodd"
              />
              <path
                d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"
              />
            {:else}
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path
                fill-rule="evenodd"
                d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                clip-rule="evenodd"
              />
            {/if}
          </svg>
        </button>
        <button
          type="button"
          on:click={generatePassword}
          class="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 mr-2"
        >
          Generate
        </button>
      </div>
    </div>
  </div>

  <div>
    <label
      for="url"
      class="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >Website URL</label
    >
    <input
      id="url"
      type="text"
      bind:value={formData.url}
      class="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>

  <div>
    <label
      for="category"
      class="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >Category</label
    >
    <div class="mt-1 relative">
      <input
        id="category"
        type="text"
        bind:value={formData.category}
        list="categories"
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <datalist id="categories">
        {#each existingCategories as category}
          <!-- svelte-ignore element_invalid_self_closing_tag -->
          <option value={category} />
        {/each}
      </datalist>
    </div>
    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
      Use / to create nested categories (e.g. "Personal/Email")
    </p>
  </div>

  <div>
    <label
      for="notes"
      class="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >Notes</label
    >
    <textarea
      id="notes"
      bind:value={formData.notes}
      rows="3"
      class="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    ></textarea>
  </div>

  <div class="flex justify-end space-x-3 pt-4">
    <button
      type="button"
      on:click={onCancel}
      class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      Cancel
    </button>
    <button
      type="submit"
      class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {password ? "Update" : "Save"}
    </button>
  </div>
</form>
