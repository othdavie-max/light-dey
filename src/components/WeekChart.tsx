import { weekdayLabel, formatHours } from "@/lib/format";

/**
 * Hours of light per day for the last 7 days, as simple bars. A dashed line shows what the area's tariff
 * band promises, so the gap is obvious at a glance. Today's bar is partial (the day is not over).
 */
export default function WeekChart({ days, promised, promiseLabel, todayKey }: {
  days: { day: string; lightHours: number }[];
  promised: number | null;
  promiseLabel: string;
  todayKey: string;
}) {
  const H = 132;
  const SCALE = H - 18;               // pixels for 24 hours; the bars and the promise line share it
  const label = (h: number) => `${Math.round(h * 10) / 10}h`;
  return (
    <div>
      <div className="relative" style={{ height: H }}>
        {promised !== null && (
          <div className="absolute inset-x-0 z-10 border-t border-dashed" style={{ bottom: `${(Math.min(24, promised) / 24) * SCALE}px`, borderColor: "var(--text)", opacity: 0.55 }}>
            <span className="absolute -top-5 right-0 rounded px-1 text-[11px] text-muted" style={{ background: "var(--bg)" }}>{promiseLabel}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-2">
          {days.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${formatHours(d.lightHours)}`}>
              <span className="mb-1 text-center text-[11px] text-muted">{d.lightHours > 0 ? label(d.lightHours) : "–"}</span>
              <div
                className="w-full rounded-t-lg"
                style={{
                  height: `${Math.max(d.lightHours > 0 ? 3 : 1, (d.lightHours / 24) * SCALE)}px`,
                  background: d.lightHours > 0 ? "linear-gradient(180deg,#ffd75e,#ffbf24)" : "var(--panel-strong)",
                  opacity: d.day === todayKey ? 0.8 : 1,
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-2" aria-hidden="true">
        {days.map((d) => (
          <span key={d.day} className="flex-1 text-center text-[11px]" style={{ color: d.day === todayKey ? "var(--text)" : "var(--muted)", fontWeight: d.day === todayKey ? 600 : 400 }}>
            {weekdayLabel(d.day)}
          </span>
        ))}
      </div>
    </div>
  );
}
