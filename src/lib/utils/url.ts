const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Returns an absolute http(s) URL that is safe to use as a link target, or
 * null. Blocks javascript:, data: and other schemes that would run code in
 * the vault's origin. Bare domains like "example.com" get https://.
 */
export function toSafeExternalUrl(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim();
  if (!value) return null;

  const candidate = HAS_SCHEME.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!ALLOWED_PROTOCOLS.has(url.protocol) || !url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}
