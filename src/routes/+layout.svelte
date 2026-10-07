<script lang="ts">
  import "../app.css";
  import { browser } from "$app/environment";

  // Clickjacking defense for hosts that can't send frame-ancestors headers:
  // never render the vault inside another page's frame.
  const framed = browser && window.self !== window.top;
</script>

<div class="min-h-screen bg-gray-100 dark:bg-gray-900">
  <main>
    {#if framed}
      <p class="p-8 text-center text-gray-700 dark:text-gray-300">
        For your security, this password manager can't be displayed inside
        another page. Open it directly in a browser tab.
      </p>
    {:else}
      <slot />
    {/if}
  </main>
</div>
