"use client";

const KEY = "ld_ref";

/** If the page was opened from a friend's invite link (?ref=CODE), remember the code on this phone. */
export function captureInvite() {
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code && /^[0-9a-f]{8}$/i.test(code) && !localStorage.getItem("ld_ref_done")) localStorage.setItem(KEY, code.toLowerCase());
  } catch { /* storage blocked: the invite just will not be counted */ }
}

/** Tell the server, once, that this person joined through a friend. Safe to call every time. */
export async function claimInvite(token: string | null) {
  try {
    const code = localStorage.getItem(KEY);
    if (!code || !token) return;
    const res = await fetch("/api/referral", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ code }) });
    if (!res.ok && res.status >= 500) return;                  // try again next time
    localStorage.removeItem(KEY);
    localStorage.setItem("ld_ref_done", "1");                  // one invite per phone
  } catch { /* offline: try again next time */ }
}
