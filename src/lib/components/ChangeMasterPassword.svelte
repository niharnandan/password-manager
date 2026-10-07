<script lang="ts">
  import { onMount } from "svelte";
  import {
    changeMasterPassword,
    MIN_MASTER_PASSWORD_LENGTH,
  } from "$lib/stores/vault";

  export let onClose: () => void;

  let currentPassword = "";
  let newPassword = "";
  let confirmPassword = "";
  let errorMessage = "";
  let warningMessage = "";
  let isSaving = false;
  let succeeded = false;
  let currentInput: HTMLInputElement;

  onMount(() => currentInput?.focus());

  function close() {
    if (!isSaving) onClose();
  }

  async function handleSubmit() {
    errorMessage = "";
    warningMessage = "";
    if (newPassword !== confirmPassword) {
      errorMessage = "The new passwords don't match.";
      return;
    }

    isSaving = true;
    try {
      const result = await changeMasterPassword(currentPassword, newPassword);
      if (!result.success) {
        errorMessage = result.error ?? "Could not change the master password.";
        return;
      }
      succeeded = true;
      warningMessage = result.warning ?? "";
      currentPassword = "";
      newPassword = "";
      confirmPassword = "";
    } catch (error) {
      console.error("Master password change failed:", error);
      errorMessage = "Could not change the master password.";
    } finally {
      isSaving = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") close();
  }

  const inputClass =
    "w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelClass =
    "block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5";
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="absolute inset-0 bg-black/50" on:click={close}></div>

  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="change-master-password-title"
    class="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl ring-1 ring-gray-900/5 p-6 animate-scale-in"
  >
    <h2
      id="change-master-password-title"
      class="text-lg font-semibold text-gray-900 dark:text-gray-100"
    >
      Change master password
    </h2>

    {#if succeeded}
      <div class="mt-4 space-y-4">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          Your vault is now encrypted with the new master password. Other
          devices will need the new password together with your GitHub token
          the next time they unlock. Biometric unlock was turned off; turn it
          on again at your next login.
        </p>
        {#if warningMessage}
          <p
            class="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3"
          >
            {warningMessage}
          </p>
        {/if}
        <div class="flex justify-end">
          <button
            type="button"
            on:click={onClose}
            class="px-5 py-2.5 rounded-lg text-sm font-semibold text-white gradient-blue btn-gradient-shift btn-hover-elevate focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Done
          </button>
        </div>
      </div>
    {:else}
      <form on:submit|preventDefault={handleSubmit} class="mt-4 space-y-4">
        <div>
          <label for="current-master-password" class={labelClass}
            >Current master password</label
          >
          <input
            id="current-master-password"
            type="password"
            bind:this={currentInput}
            bind:value={currentPassword}
            autocomplete="current-password"
            required
            class={inputClass}
          />
        </div>
        <div>
          <label for="new-master-password" class={labelClass}
            >New master password</label
          >
          <input
            id="new-master-password"
            type="password"
            bind:value={newPassword}
            autocomplete="new-password"
            minlength={MIN_MASTER_PASSWORD_LENGTH}
            required
            class={inputClass}
          />
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            At least {MIN_MASTER_PASSWORD_LENGTH} characters. A long passphrase
            is best.
          </p>
        </div>
        <div>
          <label for="confirm-master-password" class={labelClass}
            >Confirm new master password</label
          >
          <input
            id="confirm-master-password"
            type="password"
            bind:value={confirmPassword}
            autocomplete="new-password"
            minlength={MIN_MASTER_PASSWORD_LENGTH}
            required
            class={inputClass}
          />
        </div>

        {#if errorMessage}
          <p
            class="text-sm text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
            role="alert"
          >
            {errorMessage}
          </p>
        {/if}

        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            on:click={close}
            disabled={isSaving}
            class="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-slate-50 dark:hover:bg-gray-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            class="px-5 py-2.5 rounded-lg text-sm font-semibold text-white gradient-blue btn-gradient-shift btn-hover-elevate disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isSaving ? "Re-encrypting..." : "Change password"}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>
