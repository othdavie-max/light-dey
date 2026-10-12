export type Status = "on" | "off" | "weak" | "unknown";

// Modern frosted-glass LED bulb with a brass screw base, built from stacked SVG layers:
// floor glow -> bloom -> smoky glass (off) -> lit diffuser (on / weak) -> reflections -> brass base.
const GLASS =
  "M100 14C61 14 30 44 30 86C30 112 44 128 58 148C67 160 72 170 72 184L128 184C128 170 133 160 142 148C156 128 170 112 170 86C170 44 139 14 100 14Z";

export default function Bulb({ status }: { status: Status }) {
  const on = status === "on";
  const weak = status === "weak";
  const lit = on || weak;

  return (
    <div className="relative mx-auto h-[17.5rem] w-[207px]" aria-hidden="true">
      {/* Glow pooling on the surface under the bulb */}
      <div
        className="pointer-events-none absolute -bottom-3 left-1/2 h-9 w-72 -translate-x-1/2 rounded-full blur-xl transition-opacity duration-700"
        style={{ background: "radial-gradient(closest-side, rgba(255,190,90,.55), transparent)", opacity: on ? 1 : weak ? 0.55 : 0 }}
      />
      {/* Bloom: light spilling into the room */}
      <div
        className={`pointer-events-none absolute -inset-x-28 -inset-y-16 transition-opacity duration-700 ${on ? "bloom-breathe" : ""}`}
        style={{
          background: "radial-gradient(closest-side at 50% 38%, rgba(255,226,150,.55) 0%, rgba(255,184,70,.26) 40%, rgba(255,150,40,.08) 68%, transparent 100%)",
          opacity: on ? 1 : 0,
        }}
      />
      <div
        className={`pointer-events-none absolute -inset-x-24 -inset-y-12 transition-opacity duration-700 ${weak ? "weak-flicker" : ""}`}
        style={{
          background: "radial-gradient(closest-side at 50% 38%, rgba(255,150,70,.42) 0%, rgba(230,110,40,.16) 50%, transparent 100%)",
          opacity: weak ? 1 : 0,
        }}
      />

      <svg viewBox="0 0 200 270" className="relative h-full w-full overflow-visible">
        <defs>
          {/* Off: smoky blue-grey glass */}
          <radialGradient id="smoke" cx="42%" cy="34%" r="78%">
            <stop offset="0" stopColor="#7384a3" stopOpacity=".6" />
            <stop offset=".55" stopColor="#3c4862" stopOpacity=".55" />
            <stop offset="1" stopColor="#141a29" stopOpacity=".85" />
          </radialGradient>
          {/* On: creamy white diffuser, warm at the crown */}
          <linearGradient id="diffOn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffefbd" />
            <stop offset=".32" stopColor="#fff8e4" />
            <stop offset=".62" stopColor="#fffcf6" />
            <stop offset="1" stopColor="#e6dac8" />
          </linearGradient>
          {/* Weak: amber crown fading into peach */}
          <linearGradient id="diffWeak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb257" />
            <stop offset=".34" stopColor="#ffd09a" />
            <stop offset=".66" stopColor="#f6d9c2" />
            <stop offset="1" stopColor="#b79883" />
          </linearGradient>
          <radialGradient id="hotOn" cx="100" cy="86" r="68" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset=".45" stopColor="#fffbe8" stopOpacity=".65" />
            <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hotWeak" cx="100" cy="86" r="62" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffe3b8" stopOpacity=".95" />
            <stop offset=".5" stopColor="#ffb870" stopOpacity=".5" />
            <stop offset="1" stopColor="#ff9a4a" stopOpacity="0" />
          </radialGradient>
          {/* Volume: darken the sides so the glass reads as a sphere */}
          <linearGradient id="edge" x1="0" x2="1">
            <stop offset="0" stopColor="#1a1005" stopOpacity=".34" />
            <stop offset=".2" stopColor="#1a1005" stopOpacity="0" />
            <stop offset=".8" stopColor="#1a1005" stopOpacity="0" />
            <stop offset="1" stopColor="#1a1005" stopOpacity=".34" />
          </linearGradient>
          <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".7" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".12" />
            <stop offset="1" stopColor="#fff" stopOpacity=".35" />
          </linearGradient>
          <linearGradient id="streak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".35" stopColor="#fff" stopOpacity=".95" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          {/* Brass screw base */}
          <linearGradient id="brass" x1="0" x2="1">
            <stop offset="0" stopColor="#3a2c14" />
            <stop offset=".14" stopColor="#a67c36" />
            <stop offset=".32" stopColor="#f3d489" />
            <stop offset=".52" stopColor="#b88a3e" />
            <stop offset=".78" stopColor="#7d5a22" />
            <stop offset="1" stopColor="#34270f" />
          </linearGradient>
          <linearGradient id="capWarm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff0c0" stopOpacity=".7" />
            <stop offset="1" stopColor="#ffc060" stopOpacity="0" />
          </linearGradient>
          <filter id="soft"><feGaussianBlur stdDeviation="1.4" /></filter>
          <filter id="softer"><feGaussianBlur stdDeviation="3.2" /></filter>
          <clipPath id="glassClip"><path d={GLASS} /></clipPath>
        </defs>

        {/* 1. Smoky glass (visible when off) */}
        <path d={GLASS} fill="url(#smoke)" />

        {/* 2. Lit diffuser */}
        <g className={on ? "lit-on" : ""} style={{ opacity: on ? 1 : 0, transition: "opacity .6s ease" }}>
          <path d={GLASS} fill="url(#diffOn)" />
          <path d={GLASS} fill="url(#hotOn)" />
          <path d={GLASS} fill="url(#edge)" />
        </g>
        <g className={weak ? "weak-flicker" : ""} style={{ opacity: weak ? 1 : 0, transition: "opacity .6s ease" }}>
          <path d={GLASS} fill="url(#diffWeak)" />
          <path d={GLASS} fill="url(#hotWeak)" />
          <path d={GLASS} fill="url(#edge)" />
        </g>

        {/* 3. Reflections: bold when off, restrained when lit */}
        <g clipPath="url(#glassClip)" style={{ opacity: lit ? 0.5 : 1, transition: "opacity .6s" }}>
          <ellipse cx="70" cy="36" rx="19" ry="9" transform="rotate(-32 70 36)" fill="#fff" opacity=".7" filter="url(#soft)" />
          <path d="M41 60C32 82 34 108 50 134" stroke="url(#streak)" strokeWidth="9" strokeLinecap="round" fill="none" opacity=".85" filter="url(#soft)" />
          <path d="M160 62C168 82 166 106 156 126" stroke="url(#streak)" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".4" filter="url(#soft)" />
          <path d="M62 152C66 160 68 166 69 174" stroke="url(#streak)" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".35" filter="url(#soft)" />
          <ellipse cx="100" cy="172" rx="28" ry="9" fill="#fff" opacity=".1" filter="url(#softer)" />
        </g>
        <path d={GLASS} fill="none" stroke="url(#rim)" strokeWidth="1.5" />
        <path d={GLASS} fill="none" stroke="var(--muted)" strokeOpacity=".2" strokeWidth=".6" />

        {/* 4. Brass screw base */}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x={71 + i * 1.2} y={181 + i * 10} width={58 - i * 2.4} height="12.5" rx="6.2" fill="url(#brass)" />
            <path d={`M${73 + i * 1.2} ${191.5 + i * 10}Q100 ${196 + i * 10} ${127 - i * 1.2} ${191.5 + i * 10}`} stroke="#150f05" strokeOpacity=".65" strokeWidth="1.5" fill="none" />
            <path d={`M${75 + i * 1.2} ${183.5 + i * 10}Q100 ${186 + i * 10} ${125 - i * 1.2} ${183.5 + i * 10}`} stroke="#fff3c8" strokeOpacity=".55" strokeWidth=".9" fill="none" />
          </g>
        ))}
        <rect x="83" y="232" width="34" height="6" rx="2" fill="#0f0f12" />
        <path d="M88 238H112Q112 250 100 250T88 238Z" fill="url(#brass)" />
        {/* warm light bouncing onto the base */}
        <g style={{ opacity: lit ? (on ? 0.8 : 0.3) : 0, transition: "opacity .7s" }}>
          <rect x="71" y="181" width="58" height="36" rx="5" fill="url(#capWarm)" />
        </g>
      </svg>
    </div>
  );
}
