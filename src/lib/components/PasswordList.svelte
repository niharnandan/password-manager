<script lang="ts">
  import type { PasswordEntry } from "$lib/types/password";
  import { getFaviconUrl, hasFavicon } from "$lib/utils/favicon";

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
  <div class="-mx-4 pb-4">
    {#each letters as letter, i}
      <div class="animate-slide-up {i > 0 ? 'mt-6' : ''}" style="animation-delay: {i * 40}ms;">
        <!-- Letter header -->
        <div class="sticky top-0 bg-white dark:bg-gray-800 backdrop-blur-md px-4 py-3 z-10 border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div class="flex items-center gap-2">
            <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{letter}</span>
            <div class="flex-1 h-px bg-gradient-to-r from-gray-300/50 to-transparent dark:from-gray-600/50"></div>
          </div>
        </div>

        <!-- Passwords in this group -->
        <div class="space-y-1.5 mt-2 px-4">
          {#each groupedPasswords[letter] as password}
            <button
              on:click={() => onSelectPassword(password.id)}
              class="w-full text-left px-4 py-3 rounded-lg text-sm ease-out group
                {selectedPasswordId === password.id
                  ? 'bg-gradient-to-r from-blue-50 via-blue-50 to-blue-100/60 dark:from-blue-900/50 dark:via-blue-900/40 dark:to-blue-800/40 text-blue-800 dark:text-blue-200 shadow-glow-blue ring-2 ring-blue-500/40 scale-[1.02] font-medium'
                  : 'text-gray-800 dark:text-gray-100 hover:bg-gradient-to-r hover:from-white hover:to-slate-50/50 dark:hover:from-slate-800/80 dark:hover:to-slate-750 btn-hover-elevate'
                }
              "
            >
              <div class="font-semibold truncate flex items-center gap-3">
                <!-- Favicon/Logo -->
                {#if hasFavicon(password.title)}
                  <img
                    src={getFaviconUrl(password.title)}
                    alt={password.title}
                    class="h-6 w-6 rounded-md flex-shrink-0 object-contain bg-white dark:bg-gray-700 p-0.5"
                    on:error={(e) => {
                      // Fallback to default icon on error
                      const img = e.currentTarget as HTMLImageElement;
                      img.style.display = 'none';
                      img.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <!-- Fallback default icon (hidden by default) -->
                  <div class="hidden h-6 w-6 rounded-md flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                {:else}
                  <!-- Default icon for unmapped passwords -->
                  <div class="h-6 w-6 rounded-md flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                {/if}
                <span class="flex-1 truncate">{password.title}</span>
                {#if selectedPasswordId === password.id}
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-500 dark:text-blue-400 ml-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                {/if}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 truncate mt-1 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {password.username}
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}
