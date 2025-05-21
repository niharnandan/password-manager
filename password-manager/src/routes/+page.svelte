<script lang="ts">
  import { isAuthenticated } from '$lib/stores/vault';
  import Login from '$lib/components/Login.svelte';
  import PasswordManager from '$lib/components/PasswordManager.svelte';
</script>


{#if $isAuthenticated}
  <PasswordManager />
{:else}
  <Login />
{/if}