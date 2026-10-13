import { buildTimeline, lagosDayStart, totalsOf, type TimelineState } from "@/lib/status/hours";
import type { SupplySession } from "@/lib/status/types";
import { formatHours } from "@/lib/format";

const DAY = 24 * 3_600_000;

const paint: Record<TimelineState, React.CSSProperties> = {
  on: { background: "linear-gradient(180deg,#ffd75e,#ffbf24)" },
  weak: { background: "var(--weak)" },
  off: { background: "var(--seg-off)" },
  unknown: { background: "repeating-linear-gradient(135deg, var(--seg-unknown-a) 0 5px, var(--seg-unknown-b) 5px 10px)", opacity: 0.55 },
};

/**
 * Today's 24 hours as one bar (Lagos time): amber where there was light, orange for weak light, dark navy where
 * there was none, and grey hatching where nobody reported. Nothing is drawn for the future.
 */
export default function Timeline({ sessions, now, legend, summary }: {
  sessions: SupplySession[];
  now: Date;
  legend: Record<TimelineState, string>;
  summary: (light: string) => string;
}) {
  const dayStart = lagosDayStart(now);
  const segments = buildTimeline(sessions, dayStart, now);
  const totals = totalsOf(segments);
  const pct = (d: Date) => ((d.getTime() - dayStart.getTime()) / DAY) * 100;
  const nowPct = Math.min(100, pct(now));
  const lightHours = (totals.on + totals.weak) / 60;

  return (
    <div>
      <div
        role="img"
        aria-label={`${summary(formatHours(lightHours))}`}
        className="relative h-9 overflow-hidden rounded-xl"
        style={{ background: "var(--panel)", border: "1px solid var(--panel-border)" }}
      >
        {segments.map((s, i) => (
          <div key={i} className="absolute inset-y-0" style={{ left: `${pct(s.start)}%`, width: `${Math.max(0.2, pct(s.end) - pct(s.start))}%`, ...paint[s.state] }} />
        ))}
        <div className="absolute inset-y-0 w-0.5" style={{ left: `${nowPct}%`, background: "var(--text)", boxShadow: "0 0 6px var(--text)" }} />
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-muted" aria-hidden="true">
        {[["12am", 0], ["6am", 25], ["12pm", 50], ["6pm", 75]].map(([l, p]) => (
          <span key={l as string} className="absolute" style={{ left: `${p}%` }}>{l}</span>
        ))}
        <span className="absolute right-0">12am</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(["on", "weak", "off", "unknown"] as TimelineState[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ ...paint[k], border: "1px solid var(--panel-border)" }} />
            {legend[k]}
          </li>
        ))}
      </ul>
    </div>
  );
}
