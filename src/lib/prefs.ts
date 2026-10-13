"use client";
import { useCallback, useSyncExternalStore } from "react";

export type Lang = "en" | "pcm";
export type Theme = "dark" | "light";

// Small localStorage-backed preferences shared by every screen. `useSyncExternalStore` keeps all
// components in step and avoids reading storage during render on the server.
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
};
const read = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: preference lasts for this visit only */ }
  emit();
};

export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore(subscribe, () => read("ld_lang", "pcm") as Lang, () => "pcm" as Lang);
  return [lang, useCallback((l: Lang) => write("ld_lang", l), [])];
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, () => read("ld_theme", "dark") as Theme, () => "dark" as Theme);
  return [theme, useCallback((t: Theme) => write("ld_theme", t), [])];
}

/** The spot the home screen is showing. */
export function getActiveSpot(): string | null {
  try { return localStorage.getItem("ld_spot"); } catch { return null; }
}
export function setActiveSpot(id: string) {
  write("ld_spot", id);
}
