"use client";
import { useCallback, useEffect, useRef } from "react";
import { setCaptchaProvider } from "./supabase/browser";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

/**
 * Cloudflare Turnstile, loaded ONLY at the moment a token is really needed (a brand-new account, or a first report),
 * never in the background. Its checks probe the phone's graphics chip, and on some Android phones (Mali graphics)
 * that corrupts the screen, so people who are already known to the server never run it at all.
 * Each token works once; after it is used the widget is removed again. Render `box` somewhere on the page.
 */
export function useTurnstile(siteKey: string | undefined) {
  const box = useRef<HTMLDivElement | null>(null);
  const script = useRef<Promise<void> | null>(null);
  const lock = useRef<Promise<unknown>>(Promise.resolve());

  const loadScript = useCallback((): Promise<void> => {
    if (window.turnstile) return Promise.resolve();
    if (!script.current) {
      script.current = new Promise<void>((resolve) => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { script.current = null; resolve(); };
        document.head.appendChild(s);
      });
    }
    return script.current;
  }, []);

  const run = useCallback(async (): Promise<string | null> => {
    if (!siteKey) return null;
    await loadScript();
    if (!window.turnstile || !box.current) return null;
    const api = window.turnstile;
    return new Promise<string | null>((resolve) => {
      let id: string | null = null;
      let done = false;
      const finish = (token: string | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (id) { try { api.remove(id); } catch { /* already gone */ } }
        resolve(token);
      };
      const timer = setTimeout(() => finish(null), 15_000);
      try {
        id = api.render(box.current!, {
          sitekey: siteKey,
          appearance: "interaction-only",          // invisible unless Cloudflare needs to ask something
          callback: (t: string) => finish(t),
          "error-callback": () => finish(null),
          "expired-callback": () => finish(null),
        });
      } catch { finish(null); }
    });
  }, [siteKey, loadScript]);

  /** A fresh token, or null if the check could not run. One at a time. */
  const getToken = useCallback((): Promise<string | null> => {
    const next = lock.current.then(run, run);
    lock.current = next.catch(() => null);
    return next;
  }, [run]);

  // New sign-ins can need a token too (when CAPTCHA protection is on in Supabase): offer this one for that.
  useEffect(() => {
    if (!siteKey) return;
    setCaptchaProvider(getToken);
    return () => setCaptchaProvider(null);
  }, [siteKey, getToken]);

  return { box, getToken };
}
