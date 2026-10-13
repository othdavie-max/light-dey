"use client";
import { useOnline } from "@/lib/useOnline";

/**
 * A slim notice at the top of the screen while there is no network, and a line about reports still waiting to be sent.
 * `offlineText` and `waitingText` come from the translation files.
 */
export default function ConnectionStatus({ offlineText, waitingText }: { offlineText: string; waitingText: string | null }) {
  const online = useOnline();
  if (online && !waitingText) return null;
  return (
    <div role="status" className="mt-3 rounded-2xl px-4 py-2.5 text-center text-sm"
      style={{ background: "color-mix(in srgb, var(--weak) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--weak) 40%, transparent)" }}>
      {!online && <p>{offlineText}</p>}
      {waitingText && <p className={online ? "" : "mt-1 text-muted"}>{waitingText}</p>}
    </div>
  );
}
