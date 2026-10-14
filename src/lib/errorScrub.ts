// Pure helpers for the error log (no server imports, so they are easy to test).
import { createHash } from "node:crypto";

/** Remove anything that could identify a person or act as a secret before an error is stored. */
export function scrub(text: string, max: number): string {
  return text
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "[token]")        // JWTs (sign-in tokens)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[secret]")
    .replace(/([?&](?:token|code|key|ref|access_token|refresh_token)=)[^&\s]+/gi, "$1[x]")
    .slice(0, max);
}

/** Same crash, same fingerprint: built from the first line of the message and the first stack frame. */
export function fingerprint(source: string, message: string, stack?: string | null): string {
  const firstFrame = (stack ?? "").split("\n").find((l) => /at |@/.test(l)) ?? "";
  const key = `${source}|${message.split("\n")[0].replace(/\d+/g, "#")}|${firstFrame.replace(/\d+/g, "#").trim()}`;
  return createHash("sha1").update(key).digest("hex");
}

/** A short, non-identifying description of the browser/phone. */
export function shortAgent(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "other";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "other";
  const mobile = /Mobile/.test(ua) ? " mobile" : "";
  return `${br} on ${os}${mobile}`;
}

export function cleanPath(p: string | null | undefined): string | null {
  if (!p) return null;
  try { return scrub(new URL(p, "https://x.invalid").pathname, 120); } catch { return scrub(p.split("?")[0], 120); }
}
