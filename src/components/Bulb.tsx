export type Status = "on" | "off" | "weak" | "unknown";

// Photoreal bulb built from stacked SVG layers (no images, no libraries):
// bloom -> glass body -> lit glass (on / weak) -> stem + filament -> glass reflections -> metal cap.
const GLASS =
  "M100 18C62 18 30 48 30 90C30 118 46 136 60 152C68 162 72 170 72 182L128 182C128 170 132 162 140 152C154 136 170 118 170 90C170 48 138 18 100 18Z";
const COIL =
  "M88 103c1.3-5 2.7-5 4 0s2.7 5 4 0 2.7-5 4 0 2.7 5 4 0 2.7-5 4 0 2.7 5 4 0";

export default function Bulb({ status }: { status: Status }) {
  const on = status === "on";
  const weak = status === "weak";
  const lit = on || weak;

  return (
    <div className="relative mx-auto h-60 w-[185px]" aria-hidden="true">
      {/* Bloom: light spilling into the room */}
      <div
        className={`pointer-events-none absolute -inset-x-24 -inset-y-14 rounded-full transition-opacity duration-700 ${on ? "bloom-breathe" : ""}`}
        style={{
          background: "radial-gradient(closest-side, rgba(255,214,110,.62) 0%, rgba(255,176,56,.30) 38%, rgba(255,150,30,.10) 62%, transparent 100%)",
          opacity: on ? 1 : 0,
        }}
      />
      <div
        className={`pointer-events-none absolute -inset-x-20 -inset-y-10 rounded-full transition-opacity duration-700 ${weak ? "weak-flicker" : ""}`}
        style={{
          background: "radial-gradient(closest-side, rgba(255,140,60,.42) 0%, rgba(230,100,40,.18) 45%, transparent 100%)",
          opacity: weak ? 1 : 0,
        }}
      />

      <svg viewBox="0 0 200 260" className="relative h-full w-full overflow-visible">
        <defs>
          {/* Glass when off: faint, cool, thicker at the rim (Fresnel) */}
          <radialGradient id="glassBody" cx="50%" cy="42%" r="62%">
            <stop offset="0" stopColor="#c9d6ff" stopOpacity=".05" />
            <stop offset=".7" stopColor="#aebdf0" stopOpacity=".12" />
            <stop offset="1" stopColor="#e4ebff" stopOpacity=".34" />
          </radialGradient>
          <linearGradient id="glassRim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".75" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".18" />
            <stop offset="1" stopColor="#fff" stopOpacity=".4" />
          </linearGradient>
          {/* Glass lit white-hot at the filament, amber at the edge */}
          <radialGradient id="litOn" cx="100" cy="102" r="88" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".1" stopColor="#fffbe2" />
            <stop offset=".3" stopColor="#ffe790" />
            <stop offset=".62" stopColor="#ffbf3c" />
            <stop offset="1" stopColor="#ef8a1c" />
          </radialGradient>
          <radialGradient id="litWeak" cx="100" cy="102" r="88" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffe9c9" />
            <stop offset=".15" stopColor="#ffc890" />
            <stop offset=".42" stopColor="#f48f4a" />
            <stop offset=".75" stopColor="#b8521f" />
            <stop offset="1" stopColor="#6e2c10" />
          </radialGradient>
          <linearGradient id="stemGlass" x1="0" x2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".05" />
            <stop offset=".4" stopColor="#fff" stopOpacity=".38" />
            <stop offset="1" stopColor="#fff" stopOpacity=".06" />
          </linearGradient>
          <linearGradient id="streak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".35" stopColor="#fff" stopOpacity=".85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          {/* Brushed aluminium screw cap */}
          <linearGradient id="metal" x1="0" x2="1">
            <stop offset="0" stopColor="#4b4e57" />
            <stop offset=".13" stopColor="#b6bac3" />
            <stop offset=".3" stopColor="#f7f8fb" />
            <stop offset=".52" stopColor="#c5c9d1" />
            <stop offset=".78" stopColor="#868a94" />
            <stop offset="1" stopColor="#40434b" />
          </linearGradient>
          <linearGradient id="capWarm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffcf70" stopOpacity=".75" />
            <stop offset="1" stopColor="#ffb040" stopOpacity="0" />
          </linearGradient>
          <filter id="filGlow" x="-60%" y="-120%" width="220%" height="340%">
            <feGaussianBlur stdDeviation="2.6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="soft"><feGaussianBlur stdDeviation="1.2" /></filter>
          <filter id="softer"><feGaussianBlur stdDeviation="3" /></filter>
          <clipPath id="glassClip"><path d={GLASS} /></clipPath>
        </defs>

        {/* 1. Glass body */}
        <path d={GLASS} fill="url(#glassBody)" />

        {/* 2. Lit glass */}
        <g className={on ? "lit-on" : ""} style={{ opacity: on ? 1 : 0, transition: "opacity .6s ease" }}>
          <path d={GLASS} fill="url(#litOn)" />
        </g>
        <g className={weak ? "weak-flicker" : ""} style={{ opacity: weak ? 1 : 0, transition: "opacity .6s ease" }}>
          <path d={GLASS} fill="url(#litWeak)" />
        </g>

        {/* 3. Glass stem, support wires, filament */}
        <path d="M89 182L93 138Q100 131 107 138L111 182Z" fill="url(#stemGlass)" />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M96 140L88 103M104 140L112 103" stroke="#6b6f7a" strokeWidth="1.3" />
          {/* cold filament */}
          <path d={COIL} stroke="#2e323d" strokeWidth="1.8" style={{ opacity: lit ? 0 : 1, transition: "opacity .5s" }} />
          {/* hot filament */}
          <g className={on ? "lit-on" : weak ? "weak-flicker" : ""} style={{ opacity: lit ? 1 : 0, transition: "opacity .5s" }}>
            <path d={COIL} stroke={on ? "#fffdf0" : "#ffcf9e"} strokeWidth="2" filter="url(#filGlow)" />
          </g>
        </g>

        {/* 4. Reflections on the glass (always visible, stronger when off) */}
        <g clipPath="url(#glassClip)">
          <ellipse cx="68" cy="40" rx="17" ry="7.5" transform="rotate(-32 68 40)" fill="#fff" opacity=".6" filter="url(#soft)" />
          <path d="M44 66C35 84 36 106 48 126" stroke="url(#streak)" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".75" filter="url(#soft)" />
          <path d="M158 66C166 84 164 104 154 122" stroke="url(#streak)" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".4" filter="url(#soft)" />
          <ellipse cx="100" cy="170" rx="26" ry="9" fill="#fff" opacity=".1" filter="url(#softer)" />
        </g>
        <path d={GLASS} fill="none" stroke="url(#glassRim)" strokeWidth="1.6" />
        <path d={GLASS} fill="none" stroke="var(--muted)" strokeOpacity=".22" strokeWidth=".6" />

        {/* 5. Metal screw cap */}
        <rect x="70" y="179" width="60" height="12" rx="3" fill="url(#metal)" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={72 + i * 1.5} y={190 + i * 9.5} width={56 - i * 3} height="11" rx="5.5" fill="url(#metal)" />
            <path d={`M${74 + i * 1.5} ${200 + i * 9.5}Q100 ${204 + i * 9.5} ${126 - i * 1.5} ${200 + i * 9.5}`} stroke="#23252b" strokeOpacity=".55" strokeWidth="1.4" fill="none" />
            <path d={`M${75 + i * 1.5} ${192.5 + i * 9.5}Q100 ${195 + i * 9.5} ${125 - i * 1.5} ${192.5 + i * 9.5}`} stroke="#fff" strokeOpacity=".5" strokeWidth=".9" fill="none" />
          </g>
        ))}
        <rect x="83" y="229" width="34" height="6" rx="2" fill="#17181c" />
        <path d="M88 235H112Q112 247 100 247T88 235Z" fill="url(#metal)" />
        {/* warm light bouncing onto the cap */}
        <g style={{ opacity: lit ? (on ? 0.85 : 0.35) : 0, transition: "opacity .7s" }}>
          <rect x="70" y="179" width="60" height="38" rx="4" fill="url(#capWarm)" />
        </g>
      </svg>
    </div>
  );
}
