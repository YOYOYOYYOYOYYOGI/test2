import sharp from "sharp";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const store = join(root, "store");
const res = join(root, "android/app/src/main/res");
const icon = await readFile(join(store, "icon.svg"));
const foreground = await readFile(join(store, "icon-foreground.svg"));
await sharp(icon).png().toFile(join(store, "app-icon.png"));
await sharp(foreground).png().toFile(join(store, "icon-foreground.png"));
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(sizes)) {
  const dir = join(res, `mipmap-${density}`);
  for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
    await sharp(icon).resize(size, size).png().toFile(join(dir, name));
  }
  await sharp(foreground)
    .resize(size, size)
    .png()
    .toFile(join(dir, "ic_launcher_foreground.png"));
}
// Original branded splash replaces the default Capacitor splash at each density/orientation.
for (const folder of await readdir(res)) {
  if (!folder.startsWith("drawable")) continue;
  const dest = join(res, folder, "splash.png");
  try {
    const { width, height } = await sharp(dest).metadata();
    if (!width || !height) continue;
    const logo = Math.round(Math.min(width, height) * 0.32);
    const badge = await sharp(icon).resize(logo, logo).png().toBuffer();
    await sharp({
      create: { width, height, channels: 4, background: "#153d3d" },
    })
      .composite([{ input: badge, gravity: "centre" }])
      .png()
      .toFile(`${dest}.new`);
    const { rename } = await import("node:fs/promises");
    await rename(`${dest}.new`, dest);
  } catch {
    /* no existing splash in this density */
  }
}
const background = join(store, "world-art.png");
try {
  const world = await sharp(background)
    .resize(1024, 500, { fit: "cover", position: "centre" })
    .toBuffer();
  const overlay =
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
    <defs><linearGradient id="shade"><stop stop-color="#103334" stop-opacity=".98"/><stop offset=".46" stop-color="#103334" stop-opacity=".86"/><stop offset=".77" stop-color="#103334" stop-opacity=".17"/><stop offset="1" stop-color="#103334" stop-opacity="0"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#shade)"/>
    <text x="59" y="155" font-family="serif" font-size="25" letter-spacing="7" fill="#e2d6b0">✦  A CREATURE ADVENTURE</text>
    <text x="54" y="260" font-family="serif" font-size="92" font-weight="bold" letter-spacing="-5" fill="#fff0cb">VESPERGLEN</text>
    <text x="59" y="316" font-family="serif" font-size="33" letter-spacing="10" fill="#f4d9a0">THE FIRST LIGHT</text>
    <path d="M60 353H390" stroke="#e9d9a2" stroke-width="2"/>
    <text x="60" y="409" font-family="serif" font-size="27" fill="#e0ebd7">A little world. A new friendship.</text>
  </svg>`);
  await sharp(world)
    .composite([{ input: overlay }])
    .removeAlpha()
    .png()
    .toFile(join(store, "feature-graphic.png"));
} catch (error) {
  console.warn(
    "No world-art.png: feature graphic not yet generated.",
    error.message,
  );
}
await writeFile(
  join(store, "ASSET-SOURCES.txt"),
  `All 3D models, terrain, vector art, graphics and synthesized music were authored for Vesperglen.\nFeature graphic: composited from store/world-art.png (an actual headless Chromium capture of the playable game) plus original vector lettering.\nBrowser screenshots: real headless Chromium captures, not captures of an Android device. Re-capture on supported hardware before Play submission.\nFonts: Inter and Cormorant Garamond via @fontsource, SIL Open Font License 1.1; see dependencies' LICENSE files.\nThree.js, Vite and Capacitor under their respective open-source licenses; see package-lock.json.\n`,
);
console.log(
  "Original icon, Android launcher art, splash screens and feature graphic generated.",
);
