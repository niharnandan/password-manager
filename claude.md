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

| Technology | Version | Purpose |
|------------|---------|---------|
| SvelteKit | 2.16 | Framework |
| Svelte | 5.0 | UI Components |
| TypeScript | 5.0 (strict) | Type Safety |
| TweetNaCl.js | 1.0.3 | Cryptography |
| Tailwind CSS | 4.0 | Styling |
| Vite | 6.2 | Build Tool |

## Architecture Overview

### Directory Structure

```
src/
├── lib/
│   ├── components/       # Svelte UI components
│   │   ├── Login.svelte
│   │   ├── PasswordManager.svelte
│   │   ├── PasswordList.svelte
│   │   ├── PasswordForm.svelte
│   │   ├── CategoryTree.svelte
│   │   └── CategoryItem.svelte
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
└── app.d.ts              # Global type definitions
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/stores/vault.ts` | Core state management, vault CRUD operations, GitHub sync |
| `src/lib/utils/crypto.ts` | XSalsa20-Poly1305 encryption via TweetNaCl |
| `src/lib/utils/webauthn.ts` | WebAuthn credential registration & authentication |
| `src/lib/utils/security-monitor.ts` | Failed login tracking, security event logging |
| `src/lib/types/password.ts` | TypeScript interfaces for vault data |
| `src/lib/components/Login.svelte` | Login flow with WebAuthn & password |
| `src/lib/components/PasswordManager.svelte` | Main password management UI |

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

| Type | Convention | Example |
|------|------------|---------|
| Functions/Variables | camelCase | `unlockVault`, `masterKey` |
| Types/Interfaces | PascalCase | `PasswordEntry`, `EncryptedVault` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `SALT_BYTES` |
| Files | kebab-case | `security-monitor.ts`, `github-sync.ts` |

### Import Ordering

Always order imports in this sequence:

```typescript
// 1. Svelte imports
import { onMount } from 'svelte';
import { writable, derived, get } from 'svelte/store';

// 2. SvelteKit/App imports
import { browser } from '$app/environment';

// 3. Store imports
import { vault, masterKey, isAuthenticated } from '$lib/stores/vault';
import { isGitHubAuthenticated } from '$lib/stores/github-auth';

// 4. Utility imports
import { encrypt, decrypt, deriveKey } from '$lib/utils/crypto';
import { logSecurityEvent } from '$lib/utils/security-monitor';

// 5. Type imports (use `import type`)
import type { PasswordEntry, PasswordVault, EncryptedVault } from '$lib/types/password';
```

### TypeScript Patterns

```typescript
// Use Omit<> for function parameters that exclude certain fields
async function addPassword(
  entry: Omit<PasswordEntry, 'id' | 'created' | 'modified'>
): Promise<void>

// Use `import type` for type-only imports
import type { PasswordEntry } from '$lib/types/password';

// Always specify return types for exported functions
export function encrypt(data: string, key: Uint8Array): { ciphertext: string; nonce: string }
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
    entry.category === selectedCategory
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
import { get } from 'svelte/store';
const currentMasterKey = get(masterKey);

// Updating stores
masterKey.set(newKey);
syncStatus.update(s => ({ ...s, syncing: true }));
```

## Security Requirements

### Critical Rules - NEVER DO

| Rule | Reason |
|------|--------|
| Never persist the master key | Must only exist in memory |
| Never store unencrypted passwords | All data must be encrypted at rest |
| Never skip browser checks | Crypto operations require browser APIs |
| Never log sensitive data | Passwords, keys must never appear in logs |
| Never use public GitHub repos | Encrypted vault must be in private repo |

### Security Architecture

| Component | Implementation |
|-----------|----------------|
| Encryption | XSalsa20-Poly1305 (TweetNaCl secretbox) |
| Key Derivation | SHA-512 hash (password + salt) |
| Salt | 24 bytes, random, stored with vault |
| Nonce | 24 bytes, random per encryption |
| Master Key | 32 bytes, in memory only |

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
let webAuthnRetryCount = parseInt(localStorage.getItem('webauthn_retry_count') || '0', 10);
let passwordRetryCount = parseInt(localStorage.getItem('password_retry_count') || '0', 10);
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
import { browser } from '$app/environment';

export function someOperation(): void {
  if (!browser) return;  // Early return if not in browser

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

| Event | Action |
|-------|--------|
| Login success | Download vault from GitHub |
| Any vault change | Auto-upload to GitHub |
| GitHub unavailable | Fall back to localStorage cache |
| Manual sync click | Fetch latest from GitHub |

### Conflict Resolution

- **Last write wins**: Local changes overwrite GitHub on sync
- **Offline support**: Changes cached locally, synced when online

### GitHub Repository Structure

```
your-private-repo/
├── vault.json        # Encrypted vault data
└── security-log.json # Security event logs (optional)
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
import { browser } from '$app/environment';

export function myUtilFunction(input: string): string {
  if (!browser) {
    throw new Error('This function requires browser environment');
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
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

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

| Browser | WebAuthn Support | Notes |
|---------|------------------|-------|
| Chrome 67+ | Full | Recommended |
| Safari 14+ | Full | Touch ID / Face ID |
| Firefox 60+ | Full | |
| Edge 79+ | Full | |

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Crypto operations can only be performed in the browser" | SSR attempting crypto | Add `if (!browser) return;` check |
| WebAuthn fails silently | Document not focused | Click on page before authenticating |
| GitHub sync error | Invalid PAT or repo not private | Check `VITE_GITHUB_PAT` and repo settings |
| Vault won't decrypt | Wrong password or corrupted data | Try password again or restore from backup |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
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
  category: string;
  notes: string;
  created: string;   // ISO date string
  modified: string;  // ISO date string
}

interface PasswordVault {
  version: string;
  vault: PasswordEntry[];
  globalNotes: string;
  verification: {
    marker: string;   // "VALID_VAULT"
    version: string;
  };
}

interface EncryptedVault {
  salt: string;       // Base64 encoded
  nonce: string;      // Base64 encoded
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
