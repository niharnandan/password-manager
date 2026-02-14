# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Vite)
npm run build        # Production build (static site via adapter-static)
npm run check        # TypeScript type checking (svelte-kit sync + svelte-check)
npm run lint         # Prettier + ESLint check
npm run format       # Auto-format with Prettier
```

No test framework is configured. There are no unit or integration tests.

## Architecture

Client-side SPA password manager with zero backend. All crypto runs in the browser. Built with SvelteKit (static adapter, output to `build/`), Svelte 5, TypeScript (strict), Tailwind CSS 4, and TweetNaCl.js for encryption.

### Directory Structure

```
src/
├── lib/
│   ├── components/       # Svelte UI components
│   │   ├── Login.svelte           # Login flow: password + WebAuthn
│   │   ├── PasswordManager.svelte # Main UI: navbar, 2-column layout, detail view, modals
│   │   ├── PasswordList.svelte    # Alphabetically grouped list with favicons
│   │   └── PasswordForm.svelte    # Add/edit form with generate, copy, show/hide
│   ├── stores/
│   │   ├── vault.ts        # Core state: masterKey, vault, CRUD ops, migrations, sync
│   │   ├── auth.ts         # Authentication state
│   │   └── github-auth.ts  # GitHub PAT + repo config (stored in localStorage)
│   ├── types/
│   │   └── password.ts     # PasswordEntry, PasswordVault, EncryptedVault, LegacyPasswordEntry
│   └── utils/
│       ├── crypto.ts           # TweetNaCl secretbox: encrypt, decrypt, deriveKey, generateSalt
│       ├── webauthn.ts         # WebAuthn registration + authentication
│       ├── security-monitor.ts # Failed login tracking, device fingerprinting, GitHub logging
│       ├── github-sync.ts      # GitHub API: upload/download vault.json + security-log.json
│       ├── local-storage.ts    # Local vault caching (cacheVault, getCachedVault, clearCachedVault)
│       └── favicon.ts          # Title-to-domain mapping for password entry logos
├── routes/
│   ├── +layout.svelte    # Root layout
│   └── +page.svelte      # Main page (switches between Login and PasswordManager)
├── app.css               # Global styles: font, animations, scrollbar, shadows, button effects
└── app.d.ts              # Global type definitions
```

### Data Flow

```
User Input (Password/WebAuthn)
     ↓
Key Derivation: SHA-512 hash (password + salt) → truncated to 32 bytes
     ↓
Master Key (in memory only, never persisted)
     ↓
Decrypt Vault: XSalsa20-Poly1305 (TweetNaCl secretbox)
     ↓
Svelte Stores (reactive state) → vault is a derived store that decrypts on read
     ↓
UI Components
     ↓
On Change: Re-encrypt → auto-sync to GitHub API + localStorage
```

WebAuthn stores an **encrypted copy** of the master key in localStorage. The encryption key is derived from the WebAuthn credential's public key + a random salt. On biometric auth, the master key is decrypted from this stored copy.

### Type Definitions

```typescript
interface PasswordEntry {
  id: string; // UUID
  title: string; // Display name (e.g. "Amazon", "Chase")
  username: string; // Login username/email
  password: string; // The actual password
  url: string; // Website URL
  notes: string; // Free-form notes
  created: string; // ISO date string
  modified: string; // ISO date string
}

interface PasswordVault {
  version: string;
  vaultVersion?: number; // Data schema version (current: 2)
  vault: PasswordEntry[];
  globalNotes: string; // Global notes section
  verification: {
    marker: string; // "VALID_VAULT" - used to verify successful decryption
    version: string;
  };
}

interface EncryptedVault {
  salt: string; // Base64 encoded, 24 bytes
  nonce: string; // Base64 encoded, 24 bytes
  ciphertext: string; // Base64 encoded
}
```

### Store Exports (vault.ts)

```typescript
export const masterKey = writable<Uint8Array | null>(null);
export const isAuthenticated = writable<boolean>(false);
export const encryptedVault = writable<EncryptedVault | null>(null);
export const vault = derived(...);  // Decrypts encryptedVault using masterKey
export const syncStatus = writable<{ syncing: boolean; lastSync: Date | null; error: string | null }>();

// CRUD - all auto-sync to GitHub/localStorage after mutation
export async function addPassword(entry: Omit<PasswordEntry, 'id' | 'created' | 'modified'>): Promise<void>;
export async function updatePassword(id: string, updates: Partial<PasswordEntry>): Promise<void>;
export async function deletePassword(id: string): Promise<void>;
export async function updateGlobalNotes(notes: string): Promise<void>;

// Auth
export async function unlockVault(password: string): Promise<boolean>;
export function lockVault(): void;
export function clearAllData(): void;

// Sync
export async function loadVaultFromGitHub(): Promise<void>;
export function exportVault(): string | null;
export function importVault(jsonString: string): boolean;
```

### Crypto Specifics (crypto.ts)

- Encryption: `nacl.secretbox` (XSalsa20-Poly1305)
- Key derivation: `nacl.hash` (SHA-512) of `password + salt`, truncated to 32 bytes
- Salt: 24 bytes random (`nacl.randomBytes`)
- Nonce: 24 bytes random per encryption
- All values stored as Base64 via `tweetnacl-util`
- Every exported function checks `if (!browser)` and throws if not in browser

### Vault Migrations

Schema version tracked in `vaultVersion` field (current: `2`). `migrateVault()` in `vault.ts:35` runs on every `unlockVault()` call. Migrations are idempotent and backward-compatible.

**History**: v1 → v2: Removed `category` field from PasswordEntry

**To add a new migration**:

1. Increment `CURRENT_VAULT_VERSION` in vault.ts
2. Add `if (vaultVersion === N)` case in `migrateVault()`
3. Update types in `password.ts`
4. Keep all old migration cases

### Security Monitor (security-monitor.ts)

- Tracks failed login attempts (both password and WebAuthn)
- After **5 failed attempts** (`MAX_RETRIES` in Login.svelte):
  - Logs detailed security event to GitHub (device fingerprint, browser info, network info)
  - Wipes all localStorage
  - Clears WebAuthn credentials
  - Reloads the page
- Retry counts persist in localStorage: `webauthn_retry_count`, `password_retry_count`

### WebAuthn Flow

**Registration** (after successful password login):

1. Generate random challenge → `navigator.credentials.create()`
2. Derive encryption key from public key + random salt
3. Encrypt master key with derived key
4. Store encrypted master key + credential ID + public key + salt in localStorage

**Authentication**:

1. Retrieve stored credential ID → `navigator.credentials.get()`
2. Reconstruct encryption key from stored public key + salt
3. Decrypt master key
4. Load cached vault from localStorage

localStorage keys: `webauthn_credential_id`, `webauthn_encrypted_key`

### GitHub Sync

- Requires: private repo + PAT with `repo` scope
- Env var: `VITE_GITHUB_PAT`
- Config stored in localStorage via `github-auth.ts`
- On login: downloads `vault.json` from GitHub
- On any vault change: auto-uploads to GitHub
- If GitHub unavailable: falls back to localStorage cache
- Conflict resolution: last write wins
- Repo structure: `vault.json` (encrypted vault) + `security-log.json` (security events)

### Favicon System (favicon.ts)

Hardcoded `TITLE_TO_DOMAIN` mapping for ~30 password entries. Title matching is **case-sensitive** and **exact match only**.

- `getFaviconUrl(title)` → returns Google Favicon API URL: `https://www.google.com/s2/favicons?domain={domain}&sz=128`
- `hasFavicon(title)` → checks if title exists in mapping
- Unmapped titles show a default lock icon
- To add new entries: edit the `TITLE_TO_DOMAIN` object in `favicon.ts`
- Used in both `PasswordList.svelte` (24x24 icon) and `PasswordManager.svelte` detail view (32x32 icon)
- Error handler: if image fails to load, hides img and shows fallback lock icon

## UI Details

### Layout

- **Desktop**: 2-column. Left panel (40%, `md:w-2/5`) = password list. Right panel (60%) = detail/form view.
- **Mobile**: Full-width stacked. Hamburger button opens slide-out drawer (`animate-slide-in-left`).
- Password list grouped alphabetically (A-Z, `#` for special chars) with sticky letter headers.

### Design System

- **Font**: DM Sans (imported from Google Fonts in app.css). Must come before `@import "tailwindcss"` or CSS will error.
- **Colors**: Slate-based palette (`slate-50`, `slate-100/200`). Ring borders: `ring-1 ring-gray-900/5`.
- **Shadows**: Custom classes `shadow-premium`, `shadow-premium-lg`, `shadow-glow-blue`.
- **Scrollbar**: Custom styled (global `thin` + enhanced `.custom-scrollbar` class for main panels).
- **Buttons**: `gradient-blue` + `btn-gradient-shift` + `btn-hover-shine` + `btn-hover-elevate` utility classes.
- **Transitions**: All interactive elements get 250ms transitions via global CSS rule.

### Animation Classes (app.css)

| Class                    | Animation                           | Duration |
| ------------------------ | ----------------------------------- | -------- |
| `animate-slide-in`       | Slide from right                    | 0.4s     |
| `animate-fade-in`        | Fade in                             | 0.3s     |
| `animate-slide-in-left`  | Slide from left (mobile drawer)     | 0.3s     |
| `animate-scale-in`       | Scale up from 0.95                  | 0.3s     |
| `animate-slide-up`       | Slide up from 10px                  | 0.3s     |
| `animate-checkmark-draw` | SVG stroke draw (copy feedback)     | 0.5s     |
| `animate-checkmark-pop`  | Scale bounce (copy feedback circle) | 0.4s     |
| `animate-float`          | Vertical float (login card)         | 6s loop  |
| `animate-shimmer`        | Gradient text shimmer               | 3s loop  |

### Copy Button Pattern

Copy buttons (username + password) in detail view use entry-scoped state to avoid cross-password contamination:

```typescript
let copiedUsernameId: string | null = null; // tracks which entry was copied
let copiedPasswordId: string | null = null;

async function copyUsername(username: string, entryId: string) {
  await navigator.clipboard.writeText(username);
  copiedUsernameId = entryId;
  setTimeout(() => {
    if (copiedUsernameId === entryId) copiedUsernameId = null;
  }, 2000);
}
```

Visual feedback: clipboard icon → animated checkmark (stroke draw + circle pop) → reverts after 2s. Icon uses `overflow: visible` on both button and SVG to prevent clipping during animation.

## Conventions

- **Naming**: camelCase functions/vars, PascalCase types, SCREAMING_SNAKE_CASE constants, kebab-case files
- **Import order**: Svelte → SvelteKit (`$app/`) → stores (`$lib/stores/`) → utils (`$lib/utils/`) → type imports (`import type`)
- **Store access**: `$store` in `.svelte` files, `get(store)` in `.ts` files
- **Browser guard**: All crypto/storage/WebAuthn code must check `if (!browser) return` — SvelteKit does SSR
- **Event handling**: `createEventDispatcher` for child→parent events, `on:submit|preventDefault`
- **Props**: `export let prop` with TypeScript types
- **CSS `@import` order in app.css**: Google Fonts `@import url(...)` MUST come before `@import "tailwindcss"` or PostCSS will error

## Security Rules

- Never persist the master key to disk/localStorage (memory only)
- Never store or log unencrypted passwords
- Never skip `if (!browser)` checks in crypto/storage code
- Never change the encryption algorithm without a vault migration plan
- GitHub sync repo must be private
- `VITE_GITHUB_PAT` env var required for GitHub sync (PAT with `repo` scope)

## Common Issues

| Issue                                                    | Cause                           | Fix                                                                         |
| -------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `@import must precede all other statements`              | CSS import order wrong          | Font `@import url(...)` must come before `@import "tailwindcss"` in app.css |
| `Crypto operations can only be performed in the browser` | SSR attempting crypto           | Add `if (!browser) return` check                                            |
| WebAuthn fails silently                                  | Document not focused            | Click on page before authenticating                                         |
| `Property 'style' does not exist on type 'EventTarget'`  | SVG/img error handlers          | Cast with `e.currentTarget as HTMLImageElement`                             |
| Favicons showing lock icon instead of logo               | Title not in mapping            | Add entry to `TITLE_TO_DOMAIN` in favicon.ts (case-sensitive exact match)   |
| GitHub sync error                                        | Invalid PAT or repo not private | Check `VITE_GITHUB_PAT` and repo settings                                   |
