"use client";
import { useCallback, useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

/**
 * Cloudflare Turnstile in its invisible form. The check runs quietly in the background after the page
 * has loaded, so a token is usually ready by the time someone taps a report button (no delay).
 * Each token works once, so a fresh one is requested after every use.
 */
export function useTurnstile(siteKey: string | undefined) {
  const box = useRef<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiting = useRef<((t: string | null) => void)[]>([]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !box.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        appearance: "interaction-only",       // invisible unless Cloudflare needs to ask something
        callback: (t: string) => {
          token.current = t;
          waiting.current.splice(0).forEach((w) => w(t));
        },
        "expired-callback": () => { token.current = null; if (widget.current) window.turnstile?.reset(widget.current); },
        "error-callback": () => { token.current = null; },
      });
    };
    // Load Cloudflare's script after the first paint so it never slows the home screen down.
    const timer = setTimeout(() => {
      if (window.turnstile) return mount();
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = mount;
      document.head.appendChild(s);
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  /** A fresh token, or null if the check could not run. Waits up to 8 seconds. */
  const getToken = useCallback((): Promise<string | null> => {
    const use = (t: string) => {
      token.current = null;
      if (widget.current) window.turnstile?.reset(widget.current);   // start fetching the next one
      return t;
    };
    if (token.current) return Promise.resolve(use(token.current));
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 8000);
      waiting.current.push((t) => { clearTimeout(timer); resolve(t ? use(t) : null); });
    });
  }, []);

  return { box, getToken };
}
