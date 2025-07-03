<script lang="ts">
  import type { PasswordEntry } from "$lib/types/password";
  import { onMount } from "svelte";

  export let passwords: PasswordEntry[] = [];
  export let selectedPasswordId: string | null = null;
  export let onSelectPassword: (id: string) => void;

  let isMobile = false;

  onMount(() => {
    function updateMobileDetection() {
      isMobile = window.innerWidth < 768; // md breakpoint
    }

    updateMobileDetection();
    window.addEventListener("resize", updateMobileDetection);

    return () => {
      window.removeEventListener("resize", updateMobileDetection);
    };
  });

  // Group passwords by first letter for desktop, sort alphabetically for mobile
  $: sortedPasswords = [...passwords].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  $: groupedPasswords = groupPasswordsByFirstLetter(passwords);

  function groupPasswordsByFirstLetter(passwords: PasswordEntry[]) {
    const groups: { [key: string]: PasswordEntry[] } = {};

    passwords.forEach((password) => {
      const firstLetter = password.title.charAt(0).toUpperCase();
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(password);
    });

    return groups;
  }
</script>

{#if passwords.length === 0}
  <div class="text-center py-8">
    <p class="text-gray-500 dark:text-gray-400">No passwords found</p>
  </div>
{:else if isMobile}
  <!-- Mobile: Simple alphabetical list -->
  <ul class="space-y-0">
    {#each sortedPasswords as entry}
      <li>
        <button
          on:click={() => onSelectPassword(entry.id)}
          class="w-full text-left px-2 py-1.5 rounded text-sm flex items-center {selectedPasswordId ===
          entry.id
            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-200'
            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'}"
        >
          <div
            class="mr-2 flex-shrink-0 h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs"
          >
            {entry.title.charAt(0).toUpperCase()}
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-medium truncate">{entry.title}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
              {entry.username}
            </div>
          </div>
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <!-- Desktop: Grouped by first letter with left marker -->
  <div class="space-y-3">
    {#each Object.entries(groupedPasswords) as [letter, entries]}
      <div class="flex">
        <!-- Letter marker column -->
        <div class="flex-shrink-0 w-4 pt-1">
          <div
            class="text-sm font-bold text-gray-600 dark:text-gray-300 uppercase"
          >
            {letter}
          </div>
        </div>
        
        <!-- Password entries column -->
        <div class="flex-1 ml-2">
          <ul class="space-y-0">
            {#each entries as entry}
              <li>
                <button
                  on:click={() => onSelectPassword(entry.id)}
                  class="w-full text-left px-2 py-1.5 rounded text-sm flex items-center {selectedPasswordId ===
                  entry.id
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-200'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'}"
                >
                  <div class="min-w-0 flex-1">
                    <div class="font-medium truncate">{entry.title}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {entry.username}
                    </div>
                  </div>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    {/each}
  </div>
{/if}
