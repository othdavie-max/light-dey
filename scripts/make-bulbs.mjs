// Turns the bulb drawing (design/bulb/*.raw.svg, produced from src/components/Bulb.tsx) into small transparent pictures.
// Pictures are far easier on phone graphics chips than a live, layered SVG. Run: npm run make-bulbs
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const here = (p) => new URL(`../${p}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
for (const s of ["on", "weak", "off"]) {
  let svg = readFileSync(here(`design/bulb/${s}.raw.svg`), "utf8");
  svg = svg
    .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace('viewBox="0 0 200 300"', 'viewBox="-50 -40 300 380" width="600" height="760"')
    .replace(/var\(--muted\)/g, "#8a93a8");
  const png = await sharp(Buffer.from(svg)).webp({ quality: 88, alphaQuality: 90 }).toBuffer();
  writeFileSync(here(`public/bulb-${s}.webp`), png);
  console.log(`bulb-${s}.webp`, Math.round(png.length / 1024) + " KB");
}
