"use client";
import { useTheme } from "@/lib/prefs";

export type Status = "on" | "off" | "weak" | "unknown";

// The bulb is a plain picture, never a live layered drawing (layered SVG corrupted the screen on some Android
// phones, e.g. Infinix with Mali graphics).
// - Dark theme: realistic glass bulb (public/bulb-glass-*.webp), cut from the design reference and lit in code:
//   npm run make-bulb-photo
// - Light theme: the LED-style bulb (public/bulb-*.webp), from design/BulbSvg.tsx.txt: npm run make-bulbs
// Each picture has empty room around the bulb for its glow; the numbers below place the bulb itself in the box.
const ART = {
  glass: { box: [340, 510], img: [520, 690], pad: [90, 90] },
  led: { box: [200, 300], img: [300, 380], pad: [50, 40] },
} as const;

export default function Bulb({ status, height = 270 }: { status: Status; height?: number }) {
  const [theme] = useTheme();
  const on = status === "on";
  const weak = status === "weak";
  const lit = on || weak;
  const kind = theme === "light" ? "led" : "glass";
  const art = ART[kind];
  const k = height / art.box[1];
  const width = Math.round(art.box[0] * k);
  const state = on ? "on" : weak ? "weak" : "off";
  const src = kind === "glass" ? `/bulb-glass-${state}.webp?v=1` : `/bulb-${state}.webp?v=1`;

  return (
    <div className="relative mx-auto" style={{ width, height }} aria-hidden="true">
      {/* A soft pool of light under the bulb: cool blue when off, warm when lit (one plain gradient) */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          bottom: -height * 0.05,
          width: width * 1.9,
          height: height * 0.12,
          background: lit
            ? "radial-gradient(closest-side, rgba(255,186,90,.55), rgba(255,186,90,.12) 60%, transparent)"
            : "radial-gradient(closest-side, rgba(56,110,215,.55), rgba(40,80,170,.14) 60%, transparent)",
          opacity: on ? 1 : weak ? 0.7 : 0.9,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt=""
        width={Math.round(art.img[0] * k)}
        height={Math.round(art.img[1] * k)}
        decoding="async"
        draggable={false}
        className={`bulb-fade absolute max-w-none select-none ${on ? "lit-on" : ""}`}
        style={{ left: -art.pad[0] * k, top: -art.pad[1] * k, width: art.img[0] * k, height: art.img[1] * k }}
      />
    </div>
  );
}
