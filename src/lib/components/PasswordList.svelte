<script lang="ts">
  import type { PasswordEntry } from "$lib/types/password";

  export let passwords: PasswordEntry[];
  export let selectedPasswordId: string | null;
  export let onSelectPassword: (id: string) => void;

  // Group passwords by first letter
  $: groupedPasswords = passwords.reduce((groups, password) => {
    const firstLetter = password.title.charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(firstLetter) ? firstLetter : '#';

    if (!groups[letter]) {
      groups[letter] = [];
    }
    groups[letter].push(password);
    return groups;
  }, {} as Record<string, PasswordEntry[]>);

  // Get sorted letters
  $: letters = Object.keys(groupedPasswords).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });
</script>

{#if passwords.length === 0}
  <p class="text-gray-500 dark:text-gray-400 text-sm text-center py-8 animate-fade-in">
    No passwords found
  </p>
{:else}
  <div class="space-y-4">
    {#each letters as letter, i}
      <div class="animate-slide-in" style="animation-delay: {i * 50}ms;">
        <!-- Letter header -->
        <div class="sticky top-0 bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 z-10">
          {letter}
        </div>

        <!-- Passwords in this group -->
        <div class="space-y-1 mt-1">
          {#each groupedPasswords[letter] as password}
            <button
              on:click={() => onSelectPassword(password.id)}
              class="w-full text-left px-3 py-2.5 rounded-md text-sm transition-all duration-200 ease-in-out
                {selectedPasswordId === password.id
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shadow-sm ring-1 ring-blue-500/20'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-sm'
                }
              "
            >
              <div class="font-medium truncate">{password.title}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {password.username}
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}
