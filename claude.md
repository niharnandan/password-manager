# Password Manager - AI Assistant Guide

A secure, client-side password manager with end-to-end encryption, WebAuthn biometric authentication, and GitHub cloud sync.

## Quick Start

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run check    # TypeScript type checking
npm run lint     # Check code formatting
npm run format   # Auto-format code
```

## Tech Stack

| Technology   | Version      | Purpose       |
| ------------ | ------------ | ------------- |
| SvelteKit    | 2.16         | Framework     |
| Svelte       | 5.0          | UI Components |
| TypeScript   | 5.0 (strict) | Type Safety   |
| TweetNaCl.js | 1.0.3        | Cryptography  |
| Tailwind CSS | 4.0          | Styling       |
| Vite         | 6.2          | Build Tool    |

## Architecture Overview

### Directory Structure

```
src/
├── lib/
│   ├── components/       # Svelte UI components
│   │   ├── Login.svelte
│   │   ├── PasswordManager.svelte
│   │   ├── PasswordList.svelte
│   │   └── PasswordForm.svelte
│   ├── stores/           # Svelte stores (state management)
│   │   ├── vault.ts      # Core vault state & operations
│   │   ├── auth.ts       # Authentication state
│   │   └── github-auth.ts # GitHub sync authentication
│   ├── types/            # TypeScript interfaces
│   │   └── password.ts   # PasswordEntry, PasswordVault, EncryptedVault
│   └── utils/            # Utility functions
│       ├── crypto.ts     # Encryption/decryption operations
│       ├── webauthn.ts   # Face ID/Touch ID authentication
│       ├── security-monitor.ts # Failed login tracking & security logs
│       ├── github-sync.ts # GitHub API operations
│       └── local-storage.ts # Local vault caching
├── routes/
│   ├── +layout.svelte    # Root layout
│   └── +page.svelte      # Main page
├── app.css               # Global styles and animations
└── app.d.ts              # Global type definitions
```

### Key Files

| File                                        | Purpose                                                   |
| ------------------------------------------- | --------------------------------------------------------- |
| `src/lib/stores/vault.ts`                   | Core state management, vault CRUD operations, GitHub sync |
| `src/lib/utils/crypto.ts`                   | XSalsa20-Poly1305 encryption via TweetNaCl                |
| `src/lib/utils/webauthn.ts`                 | WebAuthn credential registration & authentication         |
| `src/lib/utils/security-monitor.ts`         | Failed login tracking, security event logging             |
| `src/lib/types/password.ts`                 | TypeScript interfaces for vault data                      |
| `src/lib/components/Login.svelte`           | Login flow with WebAuthn & password                       |
| `src/lib/components/PasswordManager.svelte` | Main password management UI (2-column layout)             |
| `src/lib/components/PasswordList.svelte`    | Alphabetically grouped password list with animations      |
| `src/lib/components/PasswordForm.svelte`    | Password add/edit form with copy functionality            |
| `src/app.css`                               | Global animations and enhanced color styles               |

### UI Architecture

**Layout**: 2-column design (simplified from previous 3-column)

- **Left Panel (40% on desktop)**: Alphabetically grouped password list with sticky letter headers
- **Right Panel (60% on desktop)**: Password details/form view
- **Mobile**: Full-width stacked layout

**Design System**:

- **Colors**: Slate-based palette (warmer than gray) with enhanced contrast
- **Shadows**: Multi-layered (`shadow-sm`, `shadow-md`, `shadow-lg`) with ring borders
- **Animations**: Smooth transitions (200-300ms) with stagger effects on list items
- **Interactions**: Hover shadows, active scale effects, focus rings with offsets

**Password List Features**:

- Alphabetical grouping (A-Z, with # for special characters)
- Sticky letter headers for easy navigation
- Staggered entrance animations (50ms delay per group)
- Search-based filtering (no categories)

### Data Flow

```
User Input (Password/WebAuthn)
         ↓
    Key Derivation (SHA-512)
         ↓
    Master Key (in memory only)
         ↓
    Decrypt Vault (XSalsa20-Poly1305)
         ↓
    Svelte Stores (reactive state)
         ↓
    UI Components
         ↓
    On Change: Re-encrypt → Sync to GitHub/localStorage
```

## Coding Conventions

### Naming Conventions

| Type                | Convention           | Example                                 |
| ------------------- | -------------------- | --------------------------------------- |
| Functions/Variables | camelCase            | `unlockVault`, `masterKey`              |
| Types/Interfaces    | PascalCase           | `PasswordEntry`, `EncryptedVault`       |
| Constants           | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `SALT_BYTES`             |
| Files               | kebab-case           | `security-monitor.ts`, `github-sync.ts` |

### Import Ordering

Always order imports in this sequence:

```typescript
// 1. Svelte imports
import { onMount } from "svelte";
import { writable, derived, get } from "svelte/store";

// 2. SvelteKit/App imports
import { browser } from "$app/environment";

// 3. Store imports
import { vault, masterKey, isAuthenticated } from "$lib/stores/vault";
import { isGitHubAuthenticated } from "$lib/stores/github-auth";

// 4. Utility imports
import { encrypt, decrypt, deriveKey } from "$lib/utils/crypto";
import { logSecurityEvent } from "$lib/utils/security-monitor";

// 5. Type imports (use `import type`)
import type {
  PasswordEntry,
  PasswordVault,
  EncryptedVault,
} from "$lib/types/password";
```

### TypeScript Patterns

```typescript
// Use Omit<> for function parameters that exclude certain fields
async function addPassword(
  entry: Omit<PasswordEntry, "id" | "created" | "modified">,
): Promise<void>;

// Use `import type` for type-only imports
import type { PasswordEntry } from "$lib/types/password";

// Always specify return types for exported functions
export function encrypt(
  data: string,
  key: Uint8Array,
): { ciphertext: string; nonce: string };
```

### Svelte Patterns

```svelte
<script lang="ts">
  // 1. Imports (following import ordering above)
  import { onMount } from 'svelte';
  import { vault } from '$lib/stores/vault';
  import type { PasswordEntry } from '$lib/types/password';

  // 2. Props
  export let password: PasswordEntry | undefined = undefined;

  // 3. Local state
  let isLoading = false;
  let errorMessage = '';

  // 4. Reactive statements
  $: filteredPasswords = $vault?.vault?.filter(entry =>
    entry.title.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // 5. Lifecycle hooks
  onMount(() => {
    // Component initialization
  });

  // 6. Functions
  async function handleSubmit() {
    // Early return for validation
    if (!password) return;

    isLoading = true;
    try {
      // Logic here
    } finally {
      isLoading = false;
    }
  }
</script>
```

### Store Access Patterns

```typescript
// Reading store values in components - use $ prefix
$: currentVault = $vault;

// Reading store values in .ts files - use get()
import { get } from "svelte/store";
const currentMasterKey = get(masterKey);

// Updating stores
masterKey.set(newKey);
syncStatus.update((s) => ({ ...s, syncing: true }));
```

## Security Requirements

### Critical Rules - NEVER DO

| Rule                              | Reason                                    |
| --------------------------------- | ----------------------------------------- |
| Never persist the master key      | Must only exist in memory                 |
| Never store unencrypted passwords | All data must be encrypted at rest        |
| Never skip browser checks         | Crypto operations require browser APIs    |
| Never log sensitive data          | Passwords, keys must never appear in logs |
| Never use public GitHub repos     | Encrypted vault must be in private repo   |

### Security Architecture

| Component      | Implementation                          |
| -------------- | --------------------------------------- |
| Encryption     | XSalsa20-Poly1305 (TweetNaCl secretbox) |
| Key Derivation | SHA-512 hash (password + salt)          |
| Salt           | 24 bytes, random, stored with vault     |
| Nonce          | 24 bytes, random per encryption         |
| Master Key     | 32 bytes, in memory only                |

### Security Monitor Behavior

The security monitor in `src/lib/utils/security-monitor.ts`:

1. Tracks failed login attempts (password & WebAuthn)
2. After **5 failed attempts**:
   - Logs security event to GitHub (if configured)
   - Wipes all localStorage
   - Clears WebAuthn credentials
   - Reloads the page
3. Collects device fingerprint info for security logs

```typescript
// Constants in Login.svelte
const MAX_RETRIES = 5;

// Retry counts persist in localStorage across page reloads
let webAuthnRetryCount = parseInt(
  localStorage.getItem("webauthn_retry_count") || "0",
  10,
);
let passwordRetryCount = parseInt(
  localStorage.getItem("password_retry_count") || "0",
  10,
);
```

### WebAuthn Flow

1. **Registration** (after successful password login):

   - Generate random challenge
   - Create credential with `navigator.credentials.create()`
   - Derive encryption key from public key + random salt
   - Encrypt master key with derived key
   - Store encrypted master key in localStorage

2. **Authentication**:
   - Retrieve stored credential ID
   - Authenticate with `navigator.credentials.get()`
   - Reconstruct encryption key from stored public key + salt
   - Decrypt master key
   - Load cached vault from localStorage

### Browser Environment Checks

All crypto and storage operations must check for browser environment:

```typescript
import { browser } from "$app/environment";

export function someOperation(): void {
  if (!browser) return; // Early return if not in browser

  // Safe to use browser APIs
}
```

## GitHub Sync

### Configuration

GitHub sync requires:

- A **private** GitHub repository
- A Personal Access Token (PAT) with `repo` scope
- Configuration in `src/lib/stores/github-auth.ts`

Environment variable:

```
VITE_GITHUB_PAT=your_personal_access_token
```

### Sync Behavior

| Event              | Action                          |
| ------------------ | ------------------------------- |
| Login success      | Download vault from GitHub      |
| Any vault change   | Auto-upload to GitHub           |
| GitHub unavailable | Fall back to localStorage cache |
| Manual sync click  | Fetch latest from GitHub        |

### Conflict Resolution

- **Last write wins**: Local changes overwrite GitHub on sync
- **Offline support**: Changes cached locally, synced when online

### GitHub Repository Structure

```
your-private-repo/
├── vault.json        # Encrypted vault data
└── security-log.json # Security event logs (optional)
```

## Animations & Enhanced UI

The app features smooth, professional animations and an enhanced color palette defined in `src/app.css`.

### Custom Animations

```css
/* Keyframe animations */
@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Utility classes */
.animate-slide-in {
  animation: slideInRight 0.3s ease-out;
}

.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}
```

### Animation Usage

**Component Entrance**:

```svelte
<!-- Login form slides in -->
<form class="space-y-6 animate-slide-in">

<!-- Password list fades in -->
<div class="animate-fade-in">

<!-- Staggered list animation -->
{#each letters as letter, i}
  <div class="animate-slide-in" style="animation-delay: {i * 50}ms;">
{/each}
```

**Interactive Elements**:

```svelte
<!-- Buttons with hover/active effects -->
<button class="transition-all duration-200 ease-in-out
               hover:shadow-md active:scale-[0.98]
               focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">

<!-- Cards with hover shadow -->
<div class="shadow-sm hover:shadow-md transition-shadow duration-300">
```

### Enhanced Color Palette

**Backgrounds**:

- `slate-50` instead of `gray-100` (warmer tone)
- `slate-100/200` for secondary backgrounds
- Ring borders: `ring-1 ring-gray-900/5` for subtle depth

**Shadows & Depth**:

```css
shadow-sm       /* Subtle */
shadow-md       /* Default cards */
shadow-lg       /* Elevated elements */
shadow-2xl      /* Modals */
```

**Focus States**:

```svelte
focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
```

**Transitions**:

- All interactive elements: `transition-all duration-200 ease-in-out`
- Shadows: `transition-shadow duration-300`
- Colors: `transition-colors duration-200`

### Global Styles (src/app.css)

```css
/* Smooth scrolling */
* {
  scroll-behavior: smooth;
}

/* Enhanced focus states */
*:focus-visible {
  outline: 2px solid rgb(59 130 246 / 0.5);
  outline-offset: 2px;
}

/* Auto-transitions on interactive elements */
button,
a,
input,
textarea,
select {
  transition-property:
    color, background-color, border-color, text-decoration-color, fill, stroke,
    opacity, box-shadow, transform;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 200ms;
}
```

### Copy Button Pattern (PasswordForm)

Shows how to implement copy-to-clipboard with visual feedback:

```typescript
let passwordCopied = false;

async function copyPassword() {
  if (formData.password) {
    await navigator.clipboard.writeText(formData.password);
    passwordCopied = true;
    setTimeout(() => {
      passwordCopied = false;
    }, 2000);
  }
}
```

```svelte
<button
  on:click={copyPassword}
  disabled={!formData.password}
  title={passwordCopied ? "Copied!" : "Copy password"}
>
  {#if passwordCopied}
    <!-- Green checkmark -->
  {:else}
    <!-- Clipboard icon -->
  {/if}
</button>
```

## Component Patterns

### Svelte 5 Component Template

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PasswordEntry } from '$lib/types/password';

  // Props
  export let password: PasswordEntry | undefined = undefined;
  export let onCancel: () => void = () => {};

  // Event dispatcher for custom events
  const dispatch = createEventDispatcher<{
    submit: { title: string; password: string };
  }>();

  // Local state
  let title = password?.title || '';
  let passwordValue = password?.password || '';

  // Form submission
  function handleSubmit() {
    dispatch('submit', { title, password: passwordValue });
  }
</script>

<form on:submit|preventDefault={handleSubmit}>
  <!-- Form content -->
</form>
```

### Event Handling

```svelte
<!-- Prevent default and stop propagation -->
<form on:submit|preventDefault={handleSubmit}>

<!-- Custom events from child components -->
<PasswordForm on:submit={handlePasswordSubmit} />

<!-- In parent, handle CustomEvent -->
async function handlePasswordSubmit(event: CustomEvent) {
  const passwordData = event.detail;
  await addPassword(passwordData);
}
```

### Conditional Rendering

```svelte
{#if isLoading}
  <LoadingSpinner />
{:else if errorMessage}
  <ErrorDisplay message={errorMessage} />
{:else}
  <MainContent />
{/if}

{#each filteredPasswords as entry (entry.id)}
  <PasswordItem {entry} />
{/each}
```

## Common Tasks

### Adding a New Utility Function

1. Create/edit file in `src/lib/utils/`
2. Add browser check if using browser APIs
3. Export function with TypeScript types
4. Import where needed using `$lib/utils/` alias

```typescript
// src/lib/utils/my-util.ts
import { browser } from "$app/environment";

export function myUtilFunction(input: string): string {
  if (!browser) {
    throw new Error("This function requires browser environment");
  }

  return input.toUpperCase();
}
```

### Adding a New Store

1. Create file in `src/lib/stores/`
2. Use `writable`, `derived`, or `readable` from svelte/store
3. Export store and any helper functions

```typescript
// src/lib/stores/my-store.ts
import { writable, get } from "svelte/store";
import { browser } from "$app/environment";

export const myStore = writable<string | null>(null);

export function updateMyStore(value: string): void {
  if (!browser) return;
  myStore.set(value);
}

export function getMyStoreValue(): string | null {
  return get(myStore);
}
```

### Adding a New Component

1. Create `.svelte` file in `src/lib/components/`
2. Follow the component template structure
3. Import in parent component

```svelte
<!-- src/lib/components/MyComponent.svelte -->
<script lang="ts">
  export let title: string;
  export let onClick: () => void = () => {};
</script>

<button on:click={onClick} class="btn-primary">
  {title}
</button>
```

### Modifying Crypto Operations

When modifying `src/lib/utils/crypto.ts`:

1. **Never change** encryption algorithm without migration plan
2. Always test with existing encrypted data
3. Maintain backward compatibility
4. Update verification markers if vault structure changes

## Testing & Troubleshooting

### Manual Testing Checklist

- [ ] Password login works
- [ ] WebAuthn registration works
- [ ] WebAuthn authentication works
- [ ] Add/edit/delete passwords work
- [ ] GitHub sync uploads changes
- [ ] GitHub sync downloads on login
- [ ] Offline mode falls back to cache
- [ ] 5 failed attempts triggers wipe
- [ ] Logout clears memory but keeps cache
- [ ] "Clear all data" wipes everything

### Browser Support

| Browser     | WebAuthn Support | Notes              |
| ----------- | ---------------- | ------------------ |
| Chrome 67+  | Full             | Recommended        |
| Safari 14+  | Full             | Touch ID / Face ID |
| Firefox 60+ | Full             |                    |
| Edge 79+    | Full             |                    |

### Common Issues

| Issue                                                    | Cause                            | Solution                                  |
| -------------------------------------------------------- | -------------------------------- | ----------------------------------------- |
| "Crypto operations can only be performed in the browser" | SSR attempting crypto            | Add `if (!browser) return;` check         |
| WebAuthn fails silently                                  | Document not focused             | Click on page before authenticating       |
| GitHub sync error                                        | Invalid PAT or repo not private  | Check `VITE_GITHUB_PAT` and repo settings |
| Vault won't decrypt                                      | Wrong password or corrupted data | Try password again or restore from backup |

### Environment Variables

| Variable          | Required       | Description                  |
| ----------------- | -------------- | ---------------------------- |
| `VITE_GITHUB_PAT` | Yes (for sync) | GitHub Personal Access Token |

### Debug Tips

1. Check browser console for errors
2. Verify localStorage contents: `localStorage.getItem('encrypted_vault')`
3. Check sync status in UI navbar
4. Monitor network tab for GitHub API calls
5. Test WebAuthn in HTTPS or localhost only

## Type Definitions

### Core Types (from `src/lib/types/password.ts`)

```typescript
interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  created: string; // ISO date string
  modified: string; // ISO date string
}

// Legacy type for migration purposes
interface LegacyPasswordEntry extends PasswordEntry {
  category?: string;
}

interface PasswordVault {
  version: string;
  vaultVersion?: number; // Data schema version for migrations (current: 2)
  vault: PasswordEntry[];
  globalNotes: string;
  verification: {
    marker: string; // "VALID_VAULT"
    version: string;
  };
}

interface EncryptedVault {
  salt: string; // Base64 encoded
  nonce: string; // Base64 encoded
  ciphertext: string; // Base64 encoded
}
```

### Store Types

```typescript
// From src/lib/stores/vault.ts
export const masterKey = writable<Uint8Array | null>(null);
export const isAuthenticated = writable<boolean>(false);
export const encryptedVault = writable<EncryptedVault | null>(null);
export const vault = derived<..., PasswordVault | null>(...);
export const syncStatus = writable<{
  syncing: boolean;
  lastSync: Date | null;
  error: string | null;
}>();
```

## Vault Migrations

The app uses a versioned data schema to handle breaking changes to the vault structure. When the vault format changes, a migration runs automatically on unlock.

### Current Version: 2

**Migration History**:

- **v1 → v2**: Removed `category` field from `PasswordEntry` (simplified UI to search-only)

### Migration Implementation (src/lib/stores/vault.ts:32-60)

```typescript
const CURRENT_VAULT_VERSION = 2;

function migrateVault(vault: PasswordVault): PasswordVault {
  const vaultVersion = vault.vaultVersion ?? 1;

  if (vaultVersion >= CURRENT_VAULT_VERSION) {
    return vault; // Already migrated
  }

  console.log(
    "Migrating vault from version",
    vaultVersion,
    "to",
    CURRENT_VAULT_VERSION,
  );

  // Migrate from v1 to v2: Remove category field
  if (vaultVersion === 1) {
    const migratedEntries = vault.vault.map((entry: any) => {
      const { category, ...entryWithoutCategory } = entry;
      return entryWithoutCategory as PasswordEntry;
    });

    return {
      ...vault,
      vault: migratedEntries,
      vaultVersion: CURRENT_VAULT_VERSION,
    };
  }

  return vault;
}
```

### Migration Behavior

1. **Automatic**: Runs when `unlockVault()` is called
2. **Idempotent**: Safe to run multiple times (no-op if already migrated)
3. **Persisted**: Migrated vault is re-encrypted and saved to GitHub/localStorage
4. **Backward Compatible**: Old vaults (v1) work seamlessly - they just auto-upgrade
5. **Performance**: Minimal overhead (single version check for already-migrated vaults)

### Adding New Migrations

When making breaking changes to the vault schema:

1. Increment `CURRENT_VAULT_VERSION`
2. Add new migration case in `migrateVault()`
3. Update type definitions
4. Keep old migration logic for backward compatibility
5. Test with vaults from all previous versions

**Example**:

```typescript
// Future migration example
if (vaultVersion === 2) {
  // v2 → v3: Add new field
  const migratedEntries = vault.vault.map((entry) => ({
    ...entry,
    newField: defaultValue,
  }));

  return {
    ...vault,
    vault: migratedEntries,
    vaultVersion: 3,
  };
}
```
