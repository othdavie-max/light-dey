"use client";
import type { ReportStatus } from "@/lib/status/types";

interface Words { on: string; off: string; weak: string; hint: string }

const bulbOn = <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>;
const bulbOff = <>{bulbOn}<path d="M4 4l16 16" /></>;
const bolt = <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />;

function Ico({ d, size = 24 }: { d: React.ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
}

/**
 * The report control. Light Dey? is crowd-reported: tapping a choice REPORTS what you see, and the choice that
 * matches the current status of the spot is highlighted in gold. (It never "switches" electricity.)
 */
export default function StatusSelector({ current, disabled, onReport, t }: {
  current: "on" | "off" | "weak" | "mixed" | "unknown";
  disabled: boolean;
  onReport: (s: ReportStatus) => void;
  t: Words;
}) {
  const option = (s: ReportStatus, label: string, icon: React.ReactNode) => {
    const active = current === s;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReport(s)}
        aria-current={active ? "true" : undefined}
        className="press flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-[22px] text-[16px] font-medium transition-colors disabled:opacity-60"
        style={active
          ? { background: "color-mix(in srgb, var(--gold) 9%, var(--elevated))", border: "1.5px solid var(--gold)", color: "var(--text)", boxShadow: "0 0 0 1px color-mix(in srgb, var(--gold) 18%, transparent), 0 10px 28px -14px color-mix(in srgb, var(--gold) 60%, transparent)" }
          : { background: "var(--elevated)", border: "1px solid var(--panel-border)", color: "var(--muted)" }}
      >
        <span style={{ color: active ? "var(--gold)" : "var(--muted)" }}><Ico d={icon} /></span>
        <span style={{ color: active ? "var(--text)" : "color-mix(in srgb, var(--text) 72%, var(--muted))" }}>{label}</span>
      </button>
    );
  };
  const weakActive = current === "weak";
  return (
    <section aria-label={t.hint} className="mt-7 rounded-[30px] p-2.5" style={{ background: "var(--surface)", border: "1px solid var(--panel-border)" }}>
      <div className="grid grid-cols-2 gap-2.5">
        {option("on", t.on, bulbOn)}
        {option("off", t.off, bulbOff)}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReport("weak")}
        aria-current={weakActive ? "true" : undefined}
        className="press mt-2.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-medium transition-colors disabled:opacity-60"
        style={weakActive
          ? { border: "1.5px solid var(--weak)", background: "color-mix(in srgb, var(--weak) 10%, var(--elevated))", color: "var(--text)" }
          : { border: "1px solid var(--panel-border)", background: "transparent", color: "var(--muted)" }}
      >
        <span style={{ color: "var(--weak)" }}><Ico d={bolt} size={17} /></span>
        {t.weak}
      </button>
      <p className="mt-2 text-center text-xs text-muted">{t.hint}</p>
    </section>
  );
}
