export type Status = "on" | "off" | "weak" | "unknown";

// The bulb is a plain picture (public/bulb-on.webp, bulb-weak.webp, bulb-off.webp), not a live layered drawing.
// Some Android phones (for example Infinix with Mali graphics) corrupted the screen when the bulb was drawn as a
// layered SVG with masks and gradients; a picture is just one flat texture and avoids that completely.
// The pictures are made from the original drawing (design/BulbSvg.tsx.txt) with: npm run make-bulbs
const UNIT = 0.9;                       // screen pixels per drawing unit (the bulb box is 180 x 270)
const IMG = { w: 300 * UNIT, h: 380 * UNIT, left: -50 * UNIT, top: -40 * UNIT };

export default function Bulb({ status }: { status: Status }) {
  const on = status === "on";
  const weak = status === "weak";
  const lit = on || weak;
  const src = on ? "/bulb-on.webp?v=1" : weak ? "/bulb-weak.webp?v=1" : "/bulb-off.webp?v=1";

  return (
    <div className="relative mx-auto h-[270px] w-[180px]" aria-hidden="true">
      {/* Floor glow: warm when lit, faint cool haze when off (one plain gradient, no filters) */}
      <div
        className="pointer-events-none absolute -bottom-4 left-1/2 h-10 w-72 -translate-x-1/2 rounded-full"
        style={{
          background: lit
            ? "radial-gradient(closest-side, rgba(255,186,90,.6), transparent)"
            : "radial-gradient(closest-side, rgba(70,110,175,.35), transparent)",
          opacity: on ? 1 : weak ? 0.6 : 0.8,
        }}
      />
      {/* Soft glow around the dome */}
      <div
        className="pointer-events-none absolute inset-x-[-40px] top-[-30px] h-[300px]"
        style={{
          background: weak
            ? "radial-gradient(closest-side at 50% 42%, rgba(255,160,70,.40) 0%, rgba(230,110,40,.14) 55%, transparent 100%)"
            : "radial-gradient(closest-side at 50% 42%, rgba(255,222,150,.55) 0%, rgba(255,182,70,.24) 45%, rgba(255,150,40,.07) 72%, transparent 100%)",
          opacity: lit ? 1 : 0,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt=""
        width={Math.round(IMG.w)}
        height={Math.round(IMG.h)}
        decoding="async"
        className={`absolute max-w-none select-none ${on ? "lit-on" : ""}`}
        style={{ left: IMG.left, top: IMG.top, width: IMG.w, height: IMG.h }}
        draggable={false}
      />
    </div>
  );
}
