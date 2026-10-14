// Makes every app icon from the master logo (design/logo.webp). Run after changing the logo: npm run make-icons
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const SRC = new URL("../design/logo.webp", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const out = (p) => new URL(`../${p}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// The logo with its empty margin trimmed away, so we control the spacing ourselves.
const trimmed = await sharp(SRC).trim({ background: "#ffffff", threshold: 12 }).png().toBuffer();

async function icon(size, fill) {
  // `fill` = how much of the square the logo's height may use (the rest is white margin)
  const logo = await sharp(trimmed).resize({ height: Math.round(size * fill), fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } }).composite([{ input: logo, gravity: "center" }]).png().toBuffer();
}

const files = {
  "public/icon-192.png": await icon(192, 0.8),
  "public/icon-512.png": await icon(512, 0.8),
  "public/icon-maskable-512.png": await icon(512, 0.6),     // extra margin: Android crops icons into circles and squircles
  "src/app/icon.png": await icon(128, 0.88),
  "src/app/apple-icon.png": await icon(180, 0.8),
  "public/logo.png": await sharp(trimmed).resize({ height: 512, fit: "inside" }).png().toBuffer(),
};
for (const [p, buf] of Object.entries(files)) writeFileSync(out(p), buf);

// favicon.ico: an ICO file can hold a PNG directly
const png32 = await icon(48, 0.9);
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 48; head[7] = 48; head[8] = 0; head[9] = 0; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(png32.length, 14); head.writeUInt32LE(22, 18);
writeFileSync(out("src/app/favicon.ico"), Buffer.concat([head, png32]));
console.log("icons written:", Object.keys(files).join(", "), "+ src/app/favicon.ico");
