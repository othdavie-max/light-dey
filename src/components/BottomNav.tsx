"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import en from "@/i18n/en/common.json";
import pcm from "@/i18n/pcm/common.json";
import { useLang } from "@/lib/prefs";

const ICONS = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  explore: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  board: <path d="M5 20V11M12 20V4M19 20v-6" />,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" /></>,
};
const TABS = [
  { key: "home", href: "/" },
  { key: "explore", href: "/explore" },
  { key: "board", href: "/board" },
  { key: "profile", href: "/profile" },
] as const;

/** The four-tab bar at the bottom of the main screens. */
export default function BottomNav() {
  const path = usePathname();
  const [lang] = useLang();
  const t = (lang === "en" ? en : pcm).nav;
  return (
    <nav aria-label="Main" className="panel fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-[28px]" style={{ background: "color-mix(in srgb, var(--bg) 96%, var(--panel-strong))" }}>
      <ul className="flex justify-around px-2 py-1.5">
        {TABS.map(({ key, href }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={key}>
              <Link href={href} aria-current={active ? "page" : undefined} className="press flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium" style={{ color: active ? "var(--text)" : "var(--muted)" }}>
                <svg width="23" height="23" viewBox="0 0 24 24" fill={active && key === "home" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[key]}</svg>
                {t[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
