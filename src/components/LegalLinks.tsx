"use client";
import Link from "next/link";
import en from "@/i18n/en/common.json";
import pcm from "@/i18n/pcm/common.json";
import { useLang } from "@/lib/prefs";

const dict = { en, pcm } as const;

/** A quiet row of links to the About, Privacy, Terms and My data pages. */
export default function LegalLinks() {
  const [lang] = useLang();
  const t = dict[lang].legal;
  return (
    <nav aria-label="About and legal" className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px] text-muted">
      <Link href="/about" className="inline-flex min-h-11 items-center underline underline-offset-2">{t.about}</Link>
      <Link href="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-2">{t.privacy}</Link>
      <Link href="/terms" className="inline-flex min-h-11 items-center underline underline-offset-2">{t.terms}</Link>
      <Link href="/my-data" className="inline-flex min-h-11 items-center underline underline-offset-2">{t.myData}</Link>
    </nav>
  );
}
