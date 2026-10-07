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
│   │   ├── Login.svelte           # Login flow: password (+ GitHub token on new devices) + WebAuthn
│   │   ├── PasswordManager.svelte # Main UI: navbar, 2-column layout, detail view, notices, auto-lock
│   │   ├── ChangeMasterPassword.svelte # Modal: re-encrypt the vault under a new master password
│   │   ├── PasswordList.svelte    # Alphabetically grouped list with favicons
│   │   └── PasswordForm.svelte    # Add/edit form with generate, copy, show/hide
│   ├── stores/
│   │   ├── vault.ts        # Core state: masterKey, vault, unlock, KDF upgrade, CRUD, sync, password change
│   │   └── github-auth.ts  # Vault repo constants + in-memory token session; token wrap/unwrap
│   ├── types/
│   │   └── password.ts     # PasswordEntry, PasswordVault, EncryptedVault, KdfParams
│   └── utils/
│       ├── crypto.ts           # secretbox, PBKDF2/HKDF (WebCrypto), legacy KDF, envelope validation
│       ├── webauthn.ts         # WebAuthn registration + authentication (PRF extension)
│       ├── security-monitor.ts # Failed login tracking, device fingerprinting, queued GitHub logging
│       ├── github-sync.ts      # GitHub API: vault.json + security-log.json, private-repo check
│       ├── local-storage.ts    # Vault cache, pending-sync flag, encrypted GitHub token
│       ├── url.ts              # toSafeExternalUrl: only http(s) links are rendered
│       └── favicon.ts          # Title-to-domain mapping for password entry logos
├── routes/
│   ├── +layout.svelte    # Root layout (refuses to render inside a frame)
│   └── +page.svelte      # Main page (switches between Login and PasswordManager)
├── app.css               # Global styles: font, animations, scrollbar, shadows, button effects
└── app.d.ts              # Global type definitions
```

### Data Flow

```
User Input (Password/WebAuthn)
     ↓
Key Derivation: PBKDF2-HMAC-SHA256, 600,000 iterations (WebCrypto) → 32 bytes
     ↓
Master Key (in memory only, never persisted; zeroed on lock)
     ↓
Decrypt Vault: XSalsa20-Poly1305 (TweetNaCl secretbox)
     ↓
Svelte Stores (reactive state) → vault is a derived store that decrypts on read
     ↓
UI Components
     ↓
On Change: Re-encrypt → auto-sync to GitHub API + localStorage
```

WebAuthn stores an **encrypted copy** of the master key in localStorage. The wrapping key is derived (HKDF) from the authenticator's **PRF extension** output, which the authenticator only releases after user verification. Nothing in localStorage is enough to recover the master key without the authenticator.

The GitHub token is **never bundled** (no `VITE_*` secrets: Vite inlines them into public JS). It is entered on the login screen once per device and stored in localStorage only encrypted under the vault key (`github_token_encrypted`, same salt + KDF as the vault, so unlocking costs one PBKDF2 run).

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
  kdf?: { algorithm: "PBKDF2-SHA256"; iterations: number }; // absent = legacy SHA-512 vault
}
```

### Store Exports (vault.ts)

```typescript
export const masterKey = writable<Uint8Array | null>(null);
export const isAuthenticated = writable<boolean>(false);
export const encryptedVault = writable<EncryptedVault | null>(null);
export const vault = derived(...);  // Decrypts encryptedVault using masterKey
export const syncStatus = writable<{ syncing: boolean; lastSync: Date | null; error: string | null }>();

export const notices = writable<string[]>([]); // banners shown after unlock (sync problems, lockouts)

// CRUD - all auto-sync to GitHub/localStorage after mutation
export async function addPassword(entry: Omit<PasswordEntry, 'id' | 'created' | 'modified'>): Promise<void>;
export async function updatePassword(id: string, updates: Partial<PasswordEntry>): Promise<void>;
export async function deletePassword(id: string): Promise<void>;

// Auth. Only reason "wrong-password" may count toward the wipe threshold.
export async function unlockVault(password: string, options?: { token?: string }): Promise<UnlockResult>;
export async function unlockWithBiometrics(): Promise<UnlockResult>;
export async function enableBiometricUnlock(): Promise<{ success: boolean; error?: string }>;
export async function changeMasterPassword(current: string, next: string): Promise<{ success: boolean; error?: string; warning?: string }>;
export function lockVault(): void;

// Sync
export async function refreshFromGitHub(): Promise<void>; // manual sync button
export function syncVaultToGitHub(): Promise<boolean>; // serialized; concurrent calls coalesce
```

### Crypto Specifics (crypto.ts)

- Encryption: `nacl.secretbox` (XSalsa20-Poly1305)
- Key derivation: PBKDF2-HMAC-SHA256, 600,000 iterations (`CURRENT_KDF`), password NFC-normalized. Parameters are stored in `EncryptedVault.kdf` and validated (100k–10M iterations) before use.
- Legacy key derivation (`deriveLegacyKey`): one SHA-512 pass over `password + salt`. Only used to open old vaults, which are re-encrypted with PBKDF2 and a fresh salt on the next password unlock.
- Salt: 24 bytes random (`nacl.randomBytes`)
- Nonce: 24 bytes random per encryption
- All values stored as Base64 via `tweetnacl-util`
- Every exported function checks `if (!browser)` and throws if not in browser

### Vault Migrations

Schema version tracked in `vaultVersion` field (current: `2`). `migrateVault()` in `vault.ts:55` runs on every unlock. Migrations are idempotent and backward-compatible.

Key-derivation upgrades are separate from schema migrations: they live in the `EncryptedVault.kdf` envelope field, and `unlockVault()` re-encrypts any vault whose KDF is weaker than `CURRENT_KDF`. Old ciphertexts remain in the vault repo's git history, so only a master password change makes them useless.

**History**: v1 → v2: Removed `category` field from PasswordEntry

**To add a new migration**:

1. Increment `CURRENT_VAULT_VERSION` in vault.ts
2. Add `if (vaultVersion === N)` case in `migrateVault()`
3. Update types in `password.ts`
4. Keep all old migration cases

### Security Monitor (security-monitor.ts)

- Tracks failed login attempts (both password and WebAuthn). Missing token, missing vault, and network errors do not count; only a password that opens no copy of the vault does.
- After **5 failed attempts** (`MAX_RETRIES` in Login.svelte):
  - Builds a security event (device fingerprint, browser info, network info)
  - Wipes all localStorage (cached vault, encrypted token, biometric record)
  - Queues the event in `pending_security_events`; it is uploaded to `security-log.json` after the next successful unlock (no credential exists before login, by design)
  - Reloads the page
- Retry counts persist in localStorage: `webauthn_retry_count`, `password_retry_count`. They are advisory: anyone with the device can reset them, and the real defense against guessing is the KDF.

### WebAuthn Flow

**Registration** (after successful password login, if the checkbox was ticked):

1. `navigator.credentials.create()` with `extensions.prf.eval.first = prfSalt` (random 32 bytes)
2. If the authenticator only reports `prf.enabled`, run one `get()` to evaluate the PRF
3. Wrapping key = HKDF-SHA256(PRF output); encrypt the master key with it
4. Store `{ version: 2, credentialId, prfSalt, vaultSalt, nonce, ciphertext }` in localStorage
5. Authenticators without PRF are refused (the checkbox is hidden when the browser reports no PRF support)

**Authentication**:

1. `navigator.credentials.get()` with the same `prfSalt`, `userVerification: "required"`
2. HKDF(PRF output) → decrypt master key
3. Open the GitHub copy (if the token is stored) or the cached vault with it. If GitHub's copy was re-encrypted elsewhere, fall back to the password.

The record is cleared whenever the vault key changes (password change, KDF upgrade). Records from older versions (public-key wrapped) are discarded on the login screen. The automatic biometric prompt only happens on the first login screen of a page load.

localStorage keys: `webauthn_credential_id`, `webauthn_encrypted_key`

### GitHub Sync

- Requires: private repo (`GITHUB_REPO` in `github-auth.ts`) + a fine-grained PAT limited to that repo with Contents read/write
- Token entered on the login screen ("GitHub access token") once per device; stored encrypted; a token GitHub rejects (401) is forgotten
- Uploads verify the repo is private first and refuse otherwise
- All GitHub requests use `cache: "no-store"` (the Contents API is cached for 60s; stale shas caused conflicts)
- On login: downloads `vault.json`, tries it and the local cache with the password
- On any vault change: marks `vault_sync_pending`, then uploads; uploads are serialized and coalesced
- If GitHub unavailable: falls back to localStorage cache; pending local changes win on the next unlock
- Only edits set `vault_sync_pending`. Unlocking never marks or uploads a cached copy unless GitHub's copy is known to be older (just adopted, or missing), so a stale cache can't overwrite newer changes
- If GitHub's copy can't be opened with the current key (password changed elsewhere): the local copy opens, sync pauses, nothing is uploaded over it
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
- **Auto-lock**: `PasswordManager.svelte` locks the vault after 15 minutes without pointer, keyboard, or scroll activity (`AUTO_LOCK_MS`), also when returning to a tab that sat idle.
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
- Never put secrets in `VITE_*` env vars or anywhere in client code: they ship in the public JS bundle
- Render user-supplied URLs only through `toSafeExternalUrl()` (blocks `javascript:` and other schemes)
- New external hosts (images, fonts, APIs) must be added to `kit.csp` in `svelte.config.js`; the CSP is emitted as a meta tag

## Common Issues

| Issue                                                            | Cause                             | Fix                                                                         |
| ---------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `@import must precede all other statements`                      | CSS import order wrong            | Font `@import url(...)` must come before `@import "tailwindcss"` in app.css |
| `Crypto operations can only be performed in the browser`         | SSR attempting crypto             | Add `if (!browser) return` check                                            |
| WebAuthn fails silently                                          | Document not focused              | Click on page before authenticating                                         |
| `Property 'style' does not exist on type 'EventTarget'`          | SVG/img error handlers            | Cast with `e.currentTarget as HTMLImageElement`                             |
| Favicons showing lock icon instead of logo                       | Title not in mapping              | Add entry to `TITLE_TO_DOMAIN` in favicon.ts (case-sensitive exact match)   |
| GitHub sync error                                                | Invalid token or repo not private | Log out, use "Use a different GitHub token", check repo settings            |
| `Refused to ... because it violates ... Content Security Policy` | Host not in CSP                   | Add it to `kit.csp.directives` in `svelte.config.js`                        |
