"use client";

let sent = 0;
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /Load failed|Failed to fetch|NetworkError|network request failed/i, /chrome-extension|moz-extension|safari-extension/i, /AbortError/i];

/** Tell our own error log that something crashed on this phone. At most 3 per page visit; never throws. */
export function reportError(message: string, stack?: string) {
  try {
    if (sent >= 3 || !message || IGNORE.some((r) => r.test(message) || (stack && r.test(stack)))) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    sent++;
    fetch("/api/log-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 1000), stack: stack?.slice(0, 3000), path: window.location.pathname }),
      keepalive: true,
    }).catch(() => { /* nothing more to do */ });
  } catch { /* never let error reporting cause an error */ }
}
