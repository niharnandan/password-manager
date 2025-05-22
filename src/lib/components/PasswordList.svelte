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
  <div class="text-center py-10">
    <p class="text-gray-500 dark:text-gray-400">No passwords found</p>
  </div>
{:else if isMobile}
  <!-- Mobile: Simple alphabetical list -->
  <ul class="space-y-1">
    {#each sortedPasswords as entry}
      <li>
        <button
          on:click={() => onSelectPassword(entry.id)}
          class="w-full text-left px-3 py-2 rounded-md text-sm flex items-center {selectedPasswordId ===
          entry.id
            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-200'
            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'}"
        >
          <div
            class="mr-3 flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300"
          >
            {entry.title.charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="font-medium">{entry.title}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {entry.username}
            </div>
          </div>
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <!-- Desktop: Grouped by first letter -->
  <div class="space-y-6">
    {#each Object.entries(groupedPasswords) as [letter, entries]}
      <div>
        <h3
          class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2"
        >
          {letter}
        </h3>
        <ul class="space-y-1">
          {#each entries as entry}
            <li>
              <button
                on:click={() => onSelectPassword(entry.id)}
                class="w-full text-left px-3 py-2 rounded-md text-sm flex items-center {selectedPasswordId ===
                entry.id
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-200'
                  : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'}"
              >
                <div
                  class="mr-3 flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300"
                >
                  {entry.title.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div class="font-medium">{entry.title}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {entry.username}
                  </div>
                </div>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{/if}
