export type Status = "on" | "off" | "weak" | "unknown";

// Modern LED bulb, modelled on a product render: glowing glass dome on top, opaque white body
// below a soft seam, chrome screw base. Built from stacked SVG layers, no images.
const GLASS =
  "M100 6C151 6 188 44 188 94C188 128 171 150 155 170C145 183 138 197 138 222L62 222C62 197 55 183 45 170C29 150 12 128 12 94C12 44 49 6 100 6Z";
const SEAM_Y = 128;

export default function Bulb({ status }: { status: Status }) {
  const on = status === "on";
  const weak = status === "weak";
  const lit = on || weak;

  return (
    <div className="relative mx-auto h-[270px] w-[180px]" aria-hidden="true">
      {/* Floor glow: warm when lit, faint cool haze when off */}
      <div
        className="pointer-events-none absolute -bottom-4 left-1/2 h-10 w-72 -translate-x-1/2 rounded-full transition-all duration-700"
        style={{
          background: lit
            ? "radial-gradient(closest-side, rgba(255,186,90,.6), transparent)"
            : "radial-gradient(closest-side, rgba(70,110,175,.35), transparent)",
          opacity: on ? 1 : weak ? 0.6 : 0.8,
        }}
      />
      {/* Bloom around the dome */}
      <div
        className={`pointer-events-none absolute -inset-x-28 -top-20 h-[330px] transition-opacity duration-700 ${on ? "bloom-breathe" : ""}`}
        style={{
          background: "radial-gradient(closest-side at 50% 42%, rgba(255,222,150,.6) 0%, rgba(255,182,70,.28) 42%, rgba(255,150,40,.08) 70%, transparent 100%)",
          opacity: on ? 1 : 0,
        }}
      />
      <div
        className={`pointer-events-none absolute -inset-x-24 -top-16 h-[300px] transition-opacity duration-700 ${weak ? "weak-flicker" : ""}`}
        style={{
          background: "radial-gradient(closest-side at 50% 42%, rgba(255,160,70,.45) 0%, rgba(230,110,40,.16) 52%, transparent 100%)",
          opacity: weak ? 1 : 0,
        }}
      />

      <svg viewBox="0 0 200 300" className="relative h-full w-full overflow-visible">
        <defs>
          {/* Off: smoky clear glass */}
          <radialGradient id="smoke" cx="44%" cy="32%" r="80%">
            <stop offset="0" stopColor="#66748d" stopOpacity=".6" />
            <stop offset=".5" stopColor="#323b4f" stopOpacity=".62" />
            <stop offset="1" stopColor="#0f141e" stopOpacity=".92" />
          </radialGradient>
          {/* On: dome glows white-hot at the centre, warm amber at the rim */}
          {/* LEDs sit at the seam, so the dome is hottest just above it */}
          <radialGradient id="domeOn" cx="100" cy="112" r="112" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".25" stopColor="#fffbea" />
            <stop offset=".55" stopColor="#fff0c4" />
            <stop offset=".85" stopColor="#ffd98a" />
            <stop offset="1" stopColor="#f6c16e" />
          </radialGradient>
          <linearGradient id="seamFade" x1="0" y1={SEAM_Y - 12} x2="0" y2={SEAM_Y + 10} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="bodyMask"><rect x="0" y={SEAM_Y - 12} width="200" height={234 - SEAM_Y} fill="url(#seamFade)" /></mask>
          <linearGradient id="bodyOn" x1="0" y1={SEAM_Y} x2="0" y2="222" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fffaf0" />
            <stop offset=".55" stopColor="#f3ece2" />
            <stop offset="1" stopColor="#d5cbbd" />
          </linearGradient>
          {/* Weak: amber dome, peach body */}
          <radialGradient id="domeWeak" cx="100" cy="112" r="112" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff4dc" />
            <stop offset=".22" stopColor="#ffdca0" />
            <stop offset=".55" stopColor="#ffbf6e" />
            <stop offset=".85" stopColor="#eda04f" />
            <stop offset="1" stopColor="#d98a3c" />
          </radialGradient>
          <linearGradient id="bodyWeak" x1="0" y1={SEAM_Y} x2="0" y2="222" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fdebd6" />
            <stop offset=".55" stopColor="#efd9c4" />
            <stop offset="1" stopColor="#b89a80" />
          </linearGradient>
          {/* Cylindrical shading so the body reads as round */}
          <linearGradient id="edge" x1="0" x2="1">
            <stop offset="0" stopColor="#3a2a16" stopOpacity=".42" />
            <stop offset=".24" stopColor="#3a2a16" stopOpacity="0" />
            <stop offset=".7" stopColor="#3a2a16" stopOpacity="0" />
            <stop offset="1" stopColor="#3a2a16" stopOpacity=".42" />
          </linearGradient>
          <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".7" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".1" />
            <stop offset="1" stopColor="#fff" stopOpacity=".35" />
          </linearGradient>
          <linearGradient id="crescent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".95" />
            <stop offset=".6" stopColor="#fff" stopOpacity=".4" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="streak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".4" stopColor="#fff" stopOpacity=".8" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          {/* Dark chrome screw base */}
          <linearGradient id="chrome" x1="0" x2="1">
            <stop offset="0" stopColor="#16181d" />
            <stop offset=".12" stopColor="#4d525b" />
            <stop offset=".28" stopColor="#d2d6dd" />
            <stop offset=".42" stopColor="#7c828d" />
            <stop offset=".6" stopColor="#353941" />
            <stop offset=".8" stopColor="#868b95" />
            <stop offset="1" stopColor="#1e2025" />
          </linearGradient>
          <linearGradient id="baseWarm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffcf7a" stopOpacity=".7" />
            <stop offset="1" stopColor="#ffb550" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="haloOn"><stop offset="0.55" stopColor="#ffd98e" stopOpacity="0.9" /><stop offset="1" stopColor="#ffd98e" stopOpacity="0" /></radialGradient>
          <radialGradient id="haloWeak"><stop offset="0.55" stopColor="#ffa254" stopOpacity="0.9" /><stop offset="1" stopColor="#ffa254" stopOpacity="0" /></radialGradient>
          <filter id="soft"><feGaussianBlur stdDeviation="1.4" /></filter>
          <filter id="softer"><feGaussianBlur stdDeviation="3" /></filter>
          <clipPath id="glassClip"><path d={GLASS} /></clipPath>
        </defs>

        {/* 0. Halo: light bleeding just past the edge of the dome */}
        <ellipse cx="100" cy="88" rx="118" ry="110" fill={on ? "url(#haloOn)" : "url(#haloWeak)"}
          style={{ opacity: on ? 0.75 : weak ? 0.45 : 0, transition: "opacity .7s" }} />

        {/* 1. Smoky glass (off) */}
        <path d={GLASS} fill="url(#smoke)" />

        {/* 2. Lit: glowing dome above the seam, opaque body below */}
        <g clipPath="url(#glassClip)">
          <g className={on ? "lit-on" : ""} style={{ opacity: on ? 1 : 0, transition: "opacity .6s ease" }}>
            <rect x="0" y="0" width="200" height="222" fill="url(#domeOn)" />
            <rect x="0" y={SEAM_Y - 12} width="200" height={234 - SEAM_Y} fill="url(#bodyOn)" mask="url(#bodyMask)" />
          </g>
          <g className={weak ? "weak-shimmer" : ""} style={{ opacity: weak ? 1 : 0, transition: "opacity .6s ease" }}>
            <rect x="0" y="0" width="200" height="222" fill="url(#domeWeak)" />
            <rect x="0" y={SEAM_Y - 12} width="200" height={234 - SEAM_Y} fill="url(#bodyWeak)" mask="url(#bodyMask)" />
          </g>
          <g style={{ opacity: lit ? 1 : 0, transition: "opacity .6s" }}>
            <rect x="0" y={SEAM_Y - 12} width="200" height={234 - SEAM_Y} fill="url(#edge)" mask="url(#bodyMask)" />
            {/* faint seam between diffuser dome and body */}
            <rect x="0" y={SEAM_Y + 2} width="200" height="2" fill="#b9a383" opacity=".16" filter="url(#soft)" />
          </g>
        </g>

        {/* 3. Reflections: bold on smoky glass, a soft gloss when lit */}
        <g clipPath="url(#glassClip)" style={{ opacity: lit ? 0.45 : 1, transition: "opacity .6s" }}>
          <path d="M30 70C34 42 56 22 84 16C62 30 46 50 42 80C40 96 42 110 47 122C36 110 28 92 30 70Z" fill="url(#crescent)" opacity=".75" filter="url(#soft)" />
          <ellipse cx="66" cy="36" rx="9" ry="5" transform="rotate(-38 66 36)" fill="#fff" opacity=".9" filter="url(#soft)" />
          <path d="M172 66C180 86 178 110 166 132" stroke="url(#streak)" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".45" filter="url(#soft)" />
          <path d="M57 166C63 176 66 186 67 204" stroke="url(#streak)" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".35" filter="url(#soft)" />
          <rect x="88" y="214" width="24" height="2" rx="1" fill="#fff" opacity=".25" />
        </g>
        <path d={GLASS} fill="none" stroke="url(#rim)" strokeWidth="1.4" />
        <path d={GLASS} fill="none" stroke="var(--muted)" strokeOpacity=".18" strokeWidth=".6" />

        {/* 4. Chrome screw base */}
        <rect x="61" y="220" width="78" height="11" rx="3" fill="url(#chrome)" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x={63 + i * 1.4} y={229 + i * 9.6} width={74 - i * 2.8} height="12" rx="6" fill="url(#chrome)" />
            <path d={`M${65 + i * 1.4} ${239 + i * 9.6}Q100 ${243.5 + i * 9.6} ${135 - i * 1.4} ${239 + i * 9.6}`} stroke="#07080a" strokeOpacity=".7" strokeWidth="1.6" fill="none" />
            <path d={`M${67 + i * 1.4} ${231.5 + i * 9.6}Q100 ${234 + i * 9.6} ${133 - i * 1.4} ${231.5 + i * 9.6}`} stroke="#fff" strokeOpacity=".55" strokeWidth=".9" fill="none" />
          </g>
        ))}
        <rect x="78" y="277" width="44" height="7" rx="2.5" fill="#0b0c0f" />
        <path d="M86 284H114Q114 296 100 296T86 284Z" fill="url(#chrome)" />
        {/* warm reflections on the metal when lit */}
        <g style={{ opacity: on ? 0.75 : weak ? 0.4 : 0, transition: "opacity .7s" }}>
          <rect x="61" y="220" width="78" height="44" rx="5" fill="url(#baseWarm)" />
        </g>
      </svg>
    </div>
  );
}
