// Turns the two lit-bulb artworks (design/bulb-lit-on.webp, design/bulb-lit-weak.webp) into transparent pictures
// for the app: the bulb and its glow stay, the background fades out softly. Run: npm run make-bulb-lit
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const here = (p) => new URL(`../${p}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Where the bulb sits in the 1024 x 1536 artwork (glass top to base tip), and the crop kept around it for the glow
export const BULB = { x: 235, y: 280, w: 540, h: 925 };
const CROP = { left: 105, top: 150, width: 800, height: 1185 };
const SCALE = 0.65;                                   // final picture: 520 x 770
const cx = 505 - CROP.left, cy = 690 - CROP.top;      // middle of the glass, inside the crop

for (const state of ["on", "weak"]) {
  const { data, info } = await sharp(here(`design/bulb-lit-${state}.webp`)).extract(CROP).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    // Soft oval: fully kept near the bulb, fading to nothing before the edge of the artwork's background
    const inner = Math.hypot((x - cx) / 300, (y - cy) / 545);
    const outer = Math.hypot((x - cx) / 385, (y - cy) / 640);
    let a = inner <= 1 ? 1 : outer >= 1 ? 0 : 1 - (inner - 1) / ((inner - 1) + (1 - outer));
    a = a * a * (3 - 2 * a);                           // smooth the fade
    const i = (y * info.width + x) * 3, o = (y * info.width + x) * 4;
    out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2]; out[o + 3] = Math.round(a * 255);
  }
  const img = sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).resize({ width: Math.round(CROP.width * SCALE) });
  const webp = await img.clone().webp({ quality: 88, alphaQuality: 90 }).toBuffer();
  writeFileSync(here(`public/bulb-lit-${state}.webp`), webp);
  await img.clone().flatten({ background: "#050a14" }).png().toFile(here(`design/preview-lit-${state}.png`));
  console.log(state, Math.round(webp.length / 1024) + " KB");
}
