import { browser } from "$app/environment";

// Mapping of password titles to their domains
const TITLE_TO_DOMAIN: Record<string, string> = {
  "ADP": "adp.com",
  "Aetna": "aetna.com",
  "Amazon": "amazon.com",
  "Amex": "americanexpress.com",
  "Bank of America": "bankofamerica.com",
  "Chase": "chase.com",
  "Discord": "discord.com",
  "EPFO": "epfindia.gov.in",
  "Fidelity": "fidelity.com",
  "Google": "google.com",
  "Google Fiber": "fiber.google.com",
  "IdentityQ": "identityiq.com",
  "Neural DSP iLock": "neuraldsp.com",
  "Nintendo": "nintendo.com",
  "Paypal": "paypal.com",
  "PG&E": "pge.com",
  "ProtonMail": "proton.me",
  "Robinhood": "robinhood.com",
  "Shareworks": "shareworks.com",
  "Skiplagged": "skiplagged.com",
  "Sony PS": "playstation.com",
  "Steam": "steampowered.com",
  "Synchrony Amazon": "synchrony.com",
  "TransAmerica": "transamerica.com",
  "Trinet 401k": "trinet.com",
  "Wealthfront": "wealthfront.com",
  "Wealthscape": "wealthscape.com",
  "Wells Fargo": "wellsfargo.com",
  "Zerodha": "zerodha.com",
  "Zipcar": "zipcar.com",
};

/**
 * Get the favicon URL for a password entry based on its title
 * Uses Google's favicon service for reliable logo fetching
 */
export function getFaviconUrl(title: string): string {
  if (!browser) return "";

  const domain = TITLE_TO_DOMAIN[title];

  if (domain) {
    // Use Google's favicon service (reliable and free)
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  }

  // Return empty string for default icon (will be handled by component)
  return "";
}

/**
 * Check if a title has a mapped favicon
 */
export function hasFavicon(title: string): boolean {
  return title in TITLE_TO_DOMAIN;
}
