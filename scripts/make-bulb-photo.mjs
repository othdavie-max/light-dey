// Builds the realistic glass bulb pictures (off / on / weak) from the design reference (design/reference-home.webp).
// 1. Cut the bulb out of its dark background (works out how much light each pixel adds over the background).
// 2. Find the glass area, then paint warm light inside it for "on" and a dimmer amber light for "weak".
// Run: npm run make-bulb-photo   (writes public/bulb-glass-{off,on,weak}.webp)
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const here = (p) => new URL(`../${p}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CROP = { left: 380, top: 225, width: 340, height: 510 };
const PAD = 90;                              // room around the bulb for the glow
const W = CROP.width + PAD * 2, H = CROP.height + PAD * 2;
const BASE_TOP = 360;                        // crop y where the metal screw base starts (glass above)

const { data: src, info } = await sharp(here("design/reference-home.webp")).extract(CROP).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const cw = info.width, ch = info.height;
const at = (x, y) => (y * cw + x) * 3;

// Background colour per row, from the left and right edges of the crop, blended across the row
const bgRow = [];
for (let y = 0; y < ch; y++) {
  const avg = (x0) => { const s = [0, 0, 0]; for (let x = x0; x < x0 + 6; x++) for (let c = 0; c < 3; c++) s[c] += src[at(x, y) + c] / 6; return s; };
  bgRow.push([avg(0), avg(cw - 6)]);
}
const bgAt = (x, y) => { const [l, r] = bgRow[y]; const t = x / (cw - 1); return [0, 1, 2].map((c) => l[c] * (1 - t) + r[c] * t); };

// 1. Unblend: colour C and opacity a such that bg*(1-a) + C*a = pixel
const rgba = new Float32Array(cw * ch * 4);
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
  const p = [src[at(x, y)], src[at(x, y) + 1], src[at(x, y) + 2]];
  const bg = bgAt(x, y);
  let a = 0;
  for (let c = 0; c < 3; c++) { const d = p[c] - bg[c]; const range = d >= 0 ? 255 - bg[c] : bg[c]; if (range > 0) a = Math.max(a, Math.abs(d) / range); }
  a = Math.min(1, a);
  const o = (y * cw + x) * 4;
  for (let c = 0; c < 3; c++) rgba[o + c] = a > 0.004 ? Math.max(0, Math.min(255, bg[c] + (p[c] - bg[c]) / a)) : 0;
  rgba[o + 3] = a;
}

// 2. The glass area: per row, between the outermost clearly-visible rim pixels; then smoothed across rows
const spans = [];
for (let y = 0; y < ch; y++) {
  let l = -1, r = -1;
  for (let x = 0; x < cw; x++) if (rgba[(y * cw + x) * 4 + 3] > 0.32) { l = x; break; }
  for (let x = cw - 1; x >= 0; x--) if (rgba[(y * cw + x) * 4 + 3] > 0.32) { r = x; break; }
  spans.push(l >= 0 && r - l > 20 ? [l, r] : null);
}
const glass = new Float32Array(cw * ch);
const outside = new Uint8Array(cw * ch).fill(1);
let minX = cw, maxX = 0, minY = ch, maxY = 0;
for (let y = 0; y < Math.min(ch, BASE_TOP + 6); y++) {
  const near = [];
  for (let k = -8; k <= 8; k++) { const sp = spans[y + k]; if (sp) near.push(sp); }
  if (near.length < 9) continue;
  const med = (i) => near.map((s) => s[i]).sort((p, q) => p - q)[Math.floor(near.length / 2)];
  const l = med(0) + 2, r = med(1) - 2;
  for (let x = l; x <= r; x++) { glass[y * cw + x] = 1; outside[y * cw + x] = 0; }
  minX = Math.min(minX, l); maxX = Math.max(maxX, r); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
}
const midX = (minX + maxX) / 2;
for (let y = BASE_TOP; y < ch; y++) { const sp = spans[y]; if (sp) for (let x = Math.max(sp[0], Math.round(midX - 64)); x <= Math.min(sp[1], Math.round(midX + 64)); x++) outside[y * cw + x] = 0; }
console.log("glass box", { minX, maxX, minY, maxY });

// Metal base: make it solid where something is there (it is not see-through)
for (let y = BASE_TOP; y < ch; y++) for (let x = 0; x < cw; x++) {
  const o = (y * cw + x) * 4;
  if (!outside[y * cw + x]) {
    const p = [src[at(x, y)], src[at(x, y) + 1], src[at(x, y) + 2]];
    { rgba[o] = p[0]; rgba[o + 1] = p[1]; rgba[o + 2] = p[2]; rgba[o + 3] = Math.max(rgba[o + 3], Math.min(1, rgba[o + 3] * 2.2)); }
  }
}

// Below the glass, the blue haze from the reference photo is dropped (the page draws its own light pool):
// metal is neutral grey, so anything clearly blue there goes.
for (let y = BASE_TOP; y < ch; y++) for (let x = 0; x < cw; x++) {
  const o = (y * cw + x) * 4; const p = [src[at(x, y)], src[at(x, y) + 1], src[at(x, y) + 2]];
  const dim = Math.max(p[0], p[1], p[2]) < 110, side = Math.abs(x - midX) > 52 || y >= ch - 34;
  if (dim && side && p[2] > p[0] + 22 && p[2] > p[1] + 8) rgba[o + 3] = 0;
}

// Outside the bulb, keep only the faint glow, never specks
for (let i = 0; i < cw * ch; i++) if (outside[i] && rgba[i * 4 + 3] < 0.5) rgba[i * 4 + 3] *= 0.35;

// Soft edge so the cut-out never shows a hard border at the crop edges
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
  const e = Math.min(x, y, cw - 1 - x, ch - 1 - y);
  if (e < 14) rgba[(y * cw + x) * 4 + 3] *= e / 14;
}
// Drop the faint blue floor haze at the very bottom (the page draws its own)
for (let y = ch - 60; y < ch; y++) for (let x = 0; x < cw; x++) {
  const i = y * cw + x, o = i * 4;
  if (outside[i] && rgba[o + 3] < 0.3) rgba[o + 3] *= Math.max(0, (ch - y) / 60) * 0.4;
}

const cx = (minX + maxX) / 2, cy = minY + (maxY - minY) * 0.42, R = (maxX - minX) / 2;

function render(mode) {
  const out = Buffer.alloc(W * H * 4);
  const warm = mode === "on" ? { core: [255, 254, 248], mid: [255, 232, 170], rim: [255, 180, 72], power: 0.98 } : { core: [255, 232, 180], mid: [255, 190, 112], rim: [240, 140, 62], power: 0.6 };
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const x = X - PAD, y = Y - PAD;
    let r = 0, g = 0, b = 0, a = 0;
    if (x >= 0 && y >= 0 && x < cw && y < ch) {
      const o = (y * cw + x) * 4;
      r = rgba[o]; g = rgba[o + 1]; b = rgba[o + 2]; a = rgba[o + 3];
      if (mode !== "off" && outside[y * cw + x]) a = 0;     // lit: the halo replaces faint background bits around the bulb
      if (mode !== "off") {
        const gl = glass[y * cw + x];
        if (gl) {
          // light inside the glass: white-hot middle fading to warm amber at the rim
          const d = Math.min(1, Math.hypot((x - cx) / R, (y - cy) / (R * 1.15)));
          const k = d < 0.5 ? d / 0.5 : 1;
          const t = [0, 1, 2].map((c) => (d < 0.5 ? warm.core[c] * (1 - k) + warm.mid[c] * k : warm.mid[c] * (1 - (d - 0.5) / 0.5) + warm.rim[c] * ((d - 0.5) / 0.5)));
          const la = warm.power * (0.97 - 0.25 * d);
          // light first, then the glass reflections on top (screen-style)
          const lr = t[0], lg = t[1], lb = t[2];
          const A = la + a * (1 - la);
          const mix = (L, C) => (L * la + C * a * (1 - la)) / Math.max(A, 1e-3);
          r = mix(lr, r); g = mix(lg, g); b = mix(lb, b); a = A;
          // keep the bright highlights crisp
          const hi = rgba[o + 3] > 0.45 ? 0.6 : 0;
          r = r * (1 - hi) + 255 * hi; g = g * (1 - hi) + 252 * hi; b = b * (1 - hi) + 245 * hi;
        } else if (y >= BASE_TOP - 4 && a > 0.2) {
          // warm reflections on the metal base
          const s = mode === "on" ? 0.32 : 0.2;
          r = r * (1 - s) + 255 * s; g = g * (1 - s) + 200 * s; b = b * (1 - s) + 120 * s;
        }
      }
    }
    // halo around the glass when lit
    if (mode !== "off") {
      const d = Math.hypot((x - cx) / (R * 1.55), (y - cy) / (R * 1.7));
      const halo = Math.max(0, 1 - d) ** 2 * (mode === "on" ? 0.55 : 0.32);
      if (halo > 0 && a < 1) {
        const hc = mode === "on" ? [255, 205, 120] : [255, 150, 70];
        const A = a + halo * (1 - a);
        r = (r * a + hc[0] * halo * (1 - a)) / Math.max(A, 1e-3); g = (g * a + hc[1] * halo * (1 - a)) / Math.max(A, 1e-3); b = (b * a + hc[2] * halo * (1 - a)) / Math.max(A, 1e-3);
        a = A;
      }
    }
    const O = (Y * W + X) * 4;
    out[O] = Math.round(r); out[O + 1] = Math.round(g); out[O + 2] = Math.round(b); out[O + 3] = Math.round(Math.min(1, a) * 255);
  }
  return out;
}

for (const mode of ["off"]) {          // light on / weak now come from design/bulb-lit-*.webp (npm run make-bulb-lit)
  const raw = render(mode);
  const img = sharp(raw, { raw: { width: W, height: H, channels: 4 } });
  const webp = await img.clone().webp({ quality: 90, alphaQuality: 95 }).toBuffer();
  writeFileSync(here(`public/bulb-glass-${mode}.webp`), webp);
  await img.clone().flatten({ background: "#050a14" }).png().toFile(here(`design/preview-${mode}.png`));
  console.log(mode, Math.round(webp.length / 1024) + " KB", `${W}x${H}`);
}
