import { browser } from "$app/environment";
import { getGitHubConfig } from "$lib/stores/github-auth";

interface SecurityEvent {
  timestamp: string;
  eventType: "FAILED_LOGIN_THRESHOLD_EXCEEDED";
  attemptsCount: number;
  device: DeviceInfo;
  browser: BrowserInfo;
  network: NetworkInfo;
  session: SessionInfo;
  location: LocationInfo;
  security: SecurityInfo;
}

interface DeviceInfo {
  userAgent: string;
  platform: string;
  vendor: string;
  language: string;
  languages: string[];
  cookieEnabled: boolean;
  doNotTrack: string | null;
  hardwareConcurrency: number;
  maxTouchPoints: number;
  onLine: boolean;
}

interface BrowserInfo {
  name: string;
  version: string;
  engine: string;
  isWebAuthnSupported: boolean;
  viewportWidth: number;
  viewportHeight: number;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  pixelDepth: number;
  timezone: string;
  timezoneOffset: number;
}

interface NetworkInfo {
  ipAddress: string;
  userAgentClientHints?: any;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

interface SessionInfo {
  referrer: string;
  origin: string;
  sessionDuration: number;
  previousAttempts: Array<{
    timestamp: string;
    method: "password" | "webauthn";
    result: string;
  }>;
}

interface LocationInfo {
  url: string;
  hostname: string;
  pathname: string;
  protocol: string;
  port: string;
}

interface SecurityInfo {
  storageWiped: boolean;
  webAuthnCredentialsCleared: boolean;
  sessionTerminated: boolean;
}

// Get external IP address
async function getExternalIP(): Promise<string> {
  try {
    // Try multiple IP services for reliability
    const services = [
      "https://api.ipify.org?format=json",
      "https://ipapi.co/json/",
      "https://httpbin.org/ip",
    ];

    for (const service of services) {
      try {
        const response = await fetch(service);
        const data = await response.json();

        // Different services return IP in different formats
        if (data.ip) return data.ip;
        if (data.origin) return data.origin;
        if (data.query) return data.query;
      } catch (e) {
        continue; // Try next service
      }
    }

    return "Unknown";
  } catch (error) {
    console.warn("Failed to get external IP:", error);
    return "Unknown";
  }
}

// Detect browser name and version
function getBrowserInfo(): { name: string; version: string; engine: string } {
  const ua = navigator.userAgent;

  let browserName = "Unknown";
  let browserVersion = "Unknown";
  let browserEngine = "Unknown";

  if (ua.includes("Chrome") && !ua.includes("Edg")) {
    browserName = "Chrome";
    browserEngine = "Blink";
    const match = ua.match(/Chrome\/([0-9.]+)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes("Firefox")) {
    browserName = "Firefox";
    browserEngine = "Gecko";
    const match = ua.match(/Firefox\/([0-9.]+)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes("Safari") && !ua.includes("Chrome")) {
    browserName = "Safari";
    browserEngine = "WebKit";
    const match = ua.match(/Version\/([0-9.]+)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes("Edg")) {
    browserName = "Edge";
    browserEngine = "Blink";
    const match = ua.match(/Edg\/([0-9.]+)/);
    if (match) browserVersion = match[1];
  }

  return { name: browserName, version: browserVersion, engine: browserEngine };
}

// Get network connection info
function getNetworkInfo(): Partial<NetworkInfo> {
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  return {
    effectiveType: connection?.effectiveType || "Unknown",
    downlink: connection?.downlink || 0,
    rtt: connection?.rtt || 0,
  };
}

// Get user agent client hints (if available)
async function getUserAgentClientHints(): Promise<any> {
  try {
    if ("userAgentData" in navigator) {
      const uaData = (navigator as any).userAgentData;
      const highEntropyValues = await uaData.getHighEntropyValues([
        "architecture",
        "bitness",
        "brands",
        "mobile",
        "platform",
        "platformVersion",
      ]);
      return highEntropyValues;
    }
  } catch (error) {
    console.warn("Failed to get user agent client hints:", error);
  }
  return null;
}

// Collect comprehensive device and browser information
async function collectDeviceInfo(): Promise<{
  device: DeviceInfo;
  browser: BrowserInfo;
  network: NetworkInfo;
  location: LocationInfo;
}> {
  if (!browser) {
    throw new Error("Security monitoring can only be performed in the browser");
  }

  const browserInfo = getBrowserInfo();
  const networkInfo = getNetworkInfo();
  const clientHints = await getUserAgentClientHints();
  const externalIP = await getExternalIP();

  const device: DeviceInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    vendor: navigator.vendor,
    language: navigator.language,
    languages: Array.from(navigator.languages),
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack,
    hardwareConcurrency: navigator.hardwareConcurrency,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    onLine: navigator.onLine,
  };

  const browserData: BrowserInfo = {
    name: browserInfo.name,
    version: browserInfo.version,
    engine: browserInfo.engine,
    isWebAuthnSupported: !!(
      navigator.credentials && navigator.credentials.create
    ),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: screen.width,
    screenHeight: screen.height,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
  };

  const network: NetworkInfo = {
    ipAddress: externalIP,
    userAgentClientHints: clientHints,
    ...networkInfo,
  };

  const location: LocationInfo = {
    url: window.location.href,
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    protocol: window.location.protocol,
    port:
      window.location.port ||
      (window.location.protocol === "https:" ? "443" : "80"),
  };

  return { device, browser: browserData, network, location };
}

// Get session information
function getSessionInfo(
  previousAttempts: Array<{
    timestamp: string;
    method: "password" | "webauthn";
    result: string;
  }>,
): SessionInfo {
  const sessionStart =
    localStorage.getItem("session_start") || Date.now().toString();
  const sessionDuration = Date.now() - parseInt(sessionStart, 10);

  return {
    referrer: document.referrer,
    origin: window.location.origin,
    sessionDuration,
    previousAttempts,
  };
}

// Upload security event to GitHub
async function uploadSecurityEvent(event: SecurityEvent): Promise<boolean> {
  try {
    const config = getGitHubConfig();
    if (!config) {
      console.warn("No GitHub config available for security logging");
      return false;
    }

    // Get current security log
    let currentLog: any = {
      securityEvents: [],
      metadata: { version: "1.0", totalEvents: 0 },
    };

    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/security-log.json`,
        {
          headers: {
            Authorization: `token ${config.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        const content = atob(data.content);
        currentLog = JSON.parse(content);
      }
    } catch (e) {
      console.log("Creating new security log file");
    }

    // Add new event
    currentLog.securityEvents.push(event);
    currentLog.metadata.lastUpdated = event.timestamp;
    currentLog.metadata.totalEvents = currentLog.securityEvents.length;

    // Keep only last 100 events to prevent file from growing too large
    if (currentLog.securityEvents.length > 100) {
      currentLog.securityEvents = currentLog.securityEvents.slice(-100);
      currentLog.metadata.totalEvents = 100;
    }

    const updatedContent = JSON.stringify(currentLog, null, 2);
    const encodedContent = btoa(updatedContent);

    // Get current file SHA if it exists
    let sha = "";
    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/security-log.json`,
        {
          headers: {
            Authorization: `token ${config.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        sha = data.sha;
      }
    } catch (e) {
      // File doesn't exist, will create new
    }

    // Upload/update the file
    const uploadResponse = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/security-log.json`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${config.token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Security Alert: Failed login threshold exceeded - ${new Date().toISOString()}`,
          content: encodedContent,
          ...(sha && { sha }),
        }),
      },
    );

    if (uploadResponse.ok) {
      console.log("Security event logged to GitHub successfully");
      return true;
    } else {
      const error = await uploadResponse.text();
      console.error("Failed to upload security event:", error);
      return false;
    }
  } catch (error) {
    console.error("Error uploading security event:", error);
    return false;
  }
}

// Main function to log security event
export async function logSecurityEvent(
  attemptsCount: number,
  previousAttempts: Array<{
    timestamp: string;
    method: "password" | "webauthn";
    result: string;
  }>,
): Promise<void> {
  if (!browser) {
    console.warn("Security monitoring can only be performed in the browser");
    return;
  }

  try {
    console.log("Collecting security information...");

    const {
      device,
      browser: browserData,
      network,
      location,
    } = await collectDeviceInfo();
    const session = getSessionInfo(previousAttempts);

    const securityEvent: SecurityEvent = {
      timestamp: new Date().toISOString(),
      eventType: "FAILED_LOGIN_THRESHOLD_EXCEEDED",
      attemptsCount,
      device,
      browser: browserData,
      network,
      session,
      location,
      security: {
        storageWiped: true,
        webAuthnCredentialsCleared: true,
        sessionTerminated: true,
      },
    };

    console.log("Uploading security event to GitHub...");
    await uploadSecurityEvent(securityEvent);
  } catch (error) {
    console.error("Failed to log security event:", error);
  }
}

// Track login attempts in session storage
export function trackLoginAttempt(
  method: "password" | "webauthn",
  result: string,
): void {
  if (!browser) return;

  try {
    const attempts = JSON.parse(
      sessionStorage.getItem("login_attempts") || "[]",
    );
    attempts.push({
      timestamp: new Date().toISOString(),
      method,
      result,
    });

    // Keep only last 10 attempts
    if (attempts.length > 10) {
      attempts.splice(0, attempts.length - 10);
    }

    sessionStorage.setItem("login_attempts", JSON.stringify(attempts));

    // Set session start time if not already set
    if (!localStorage.getItem("session_start")) {
      localStorage.setItem("session_start", Date.now().toString());
    }
  } catch (error) {
    console.error("Failed to track login attempt:", error);
  }
}

// Get tracked login attempts
export function getTrackedAttempts(): Array<{
  timestamp: string;
  method: "password" | "webauthn";
  result: string;
}> {
  if (!browser) return [];

  try {
    return JSON.parse(sessionStorage.getItem("login_attempts") || "[]");
  } catch (error) {
    console.error("Failed to get tracked attempts:", error);
    return [];
  }
}
