export type Status = "on" | "off" | "weak" | "unknown";

const fill: Record<Status, string> = {
  on: "var(--on)", weak: "var(--weak)", off: "var(--off)", unknown: "var(--unknown)",
};

export default function Bulb({ status }: { status: Status }) {
  const lit = status === "on" || status === "weak";
  const glowClass = status === "on" ? "glow-on" : status === "weak" ? "glow-weak" : "glow-off";
  return (
    <div className="relative mx-auto h-56 w-56" aria-hidden="true">
      <div
        className={`absolute inset-[-30%] rounded-full blur-3xl transition-opacity duration-700 ${glowClass}`}
        style={{ background: fill[status], opacity: lit ? 0.5 : 0.12 }}
      />
      <svg viewBox="0 0 120 160" className="relative h-full w-full drop-shadow-lg">
        <path
          d="M60 8c-27 0-47 20-47 46 0 17 8 28 17 38 6 7 9 13 9 22v4h42v-4c0-9 3-15 9-22 9-10 17-21 17-38C107 28 87 8 60 8z"
          fill={fill[status]}
          fillOpacity={lit ? 1 : 0.35}
          stroke={fill[status]}
          strokeWidth="3"
          style={{ transition: "fill .6s, stroke .6s, fill-opacity .6s" }}
        />
        {lit && <path d="M48 70l12 20 12-20" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="3" strokeLinecap="round" />}
        <rect x="42" y="122" width="36" height="9" rx="3" fill="#8e97b8" />
        <rect x="45" y="134" width="30" height="9" rx="3" fill="#7a83a6" />
        <rect x="50" y="146" width="20" height="9" rx="4" fill="#6a7396" />
      </svg>
    </div>
  );
}
