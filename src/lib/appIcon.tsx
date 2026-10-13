import { ImageResponse } from "next/og";

/**
 * The app icon, drawn in code (no image files to keep in sync): a glowing bulb on deep navy.
 * `maskable` icons are drawn smaller, with extra margin, because Android crops them into circles and squircles.
 */
export function renderIcon(size: number, maskable = false) {
  const scale = maskable ? 0.52 : 0.72;
  const w = Math.round(size * scale * 0.74);
  const h = Math.round(w * 1.35);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          // The glow lives in the background so it can fade out smoothly instead of being cut off by the bulb's drawing area
          background: "radial-gradient(circle at 50% 40%, #7a5a0c 0%, #3a2d0c 22%, #141a30 52%, #060a14 100%)",
        }}
      >
        <svg width={w} height={h} viewBox="0 0 200 270" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="glass" cx="50%" cy="38%" r="70%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#fff3c9" />
              <stop offset="1" stopColor="#ffc233" />
            </radialGradient>
            <linearGradient id="metal" x1="0" x2="1">
              <stop offset="0" stopColor="#3b3f48" />
              <stop offset="0.3" stopColor="#e4e7ee" />
              <stop offset="0.7" stopColor="#7d838f" />
              <stop offset="1" stopColor="#30333a" />
            </linearGradient>
          </defs>
          <path d="M100 6C151 6 188 44 188 94C188 128 171 150 155 170C145 183 138 197 138 222L62 222C62 197 55 183 45 170C29 150 12 128 12 94C12 44 49 6 100 6Z" fill="url(#glass)" />
          <path d="M44 62C50 40 68 24 90 20C72 34 58 52 54 80Z" fill="#ffffff" fillOpacity="0.7" />
          <rect x="61" y="220" width="78" height="14" rx="4" fill="url(#metal)" />
          <rect x="65" y="232" width="70" height="14" rx="6" fill="url(#metal)" />
          <rect x="69" y="244" width="62" height="14" rx="6" fill="url(#metal)" />
          <path d="M84 256H116Q116 270 100 270T84 256Z" fill="url(#metal)" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
