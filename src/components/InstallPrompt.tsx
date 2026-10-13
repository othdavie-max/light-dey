"use client";
import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface Props {
  /** Only offer once the person has seen the app work (for example after their first report). */
  ready: boolean;
  text: { title: string; body: string; button: string; ios: string; dismiss: string };
}

const DISMISSED = "ld_install_dismissed";

/**
 * "Add to Home Screen". Android and desktop Chrome give us a one-tap install; iPhones have no such button,
 * so we show the two-step instructions instead. Hidden when already installed or after "Not now".
 */
export default function InstallPrompt({ ready, text }: Props) {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      let dismissed = false;
      try { dismissed = localStorage.getItem(DISMISSED) === "1"; } catch { /* storage blocked */ }
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
      setHidden(dismissed || standalone);
    });
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); };
    const onInstalled = () => { setHidden(true); setEvent(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { alive = false; window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!ready || hidden || (!event && !ios)) return null;

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* storage blocked: it may show again next visit */ }
  };
  const install = async () => {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") setHidden(true);
    setEvent(null);
  };

  return (
    <section className="panel mt-4 rounded-[28px] p-5" aria-label={text.title}>
      <p className="text-[16px] font-medium">{text.title}</p>
      <p className="mt-1 text-sm text-muted">{text.body}</p>
      {event ? (
        <div className="mt-4 flex gap-3">
          <button onClick={install} className="press min-h-12 flex-1 rounded-2xl text-[16px] font-semibold" style={{ background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)" }}>{text.button}</button>
          <button onClick={dismiss} className="press min-h-12 px-4 text-[15px] text-muted">{text.dismiss}</button>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm">{text.ios}</p>
          <button onClick={dismiss} className="press mt-2 min-h-12 text-[15px] text-muted">{text.dismiss}</button>
        </>
      )}
    </section>
  );
}
