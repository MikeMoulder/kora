/**
 * Turns the KORA mark into the icons a browser and a home screen ask for.
 *
 *   npm run prepare:icons
 *
 * The mark alone is the wrong asset for a tab. It is a cream shape on
 * transparency, so it lands on whatever the browser chrome happens to be:
 * invisible on a light theme, nearly invisible on a dark one. What the app
 * already does everywhere else is the answer — the rail draws the white mark
 * inside a black rounded square, and that lockup is legible on any background
 * because it brings its own.
 *
 * Three outputs, because the App Router picks up each by filename:
 *
 *   src/app/icon.png        512, the general purpose icon
 *   src/app/apple-icon.png  180, iOS home screen, never transparent
 *   src/app/favicon.ico     32 and 16, for anything asking for /favicon.ico
 *
 * Re-run this if the mark changes. Nothing here is hand-edited.
 */

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const SOURCE = 'public/kora-mark-white.png';

/** The brand ink, matching `--color-ink` in globals.css. */
const INK = { r: 0x0f, g: 0x11, b: 0x10, alpha: 1 };

/**
 * How much of the tile the mark takes, and how round the tile is.
 *
 * Both were picked by rendering the candidates at 16 and 32, magnifying them
 * and looking, rather than by taste. At 62% the mark goes muddy in a 16px tab;
 * at 74% it crowds the corners and the tile stops reading as a tile. 68% is
 * the one that holds at both.
 *
 * The 24% radius is the same kind of compromise. The rail uses a third, which
 * is visibly round at 36px and turns to mush at 16, and a square tile loses
 * the brand entirely.
 */
const MARK_SCALE = 0.68;
const RADIUS_RATIO = 0.24;

/** A rounded square of brand ink, as a PNG buffer. */
async function tile(size: number): Promise<Buffer> {
  const radius = Math.round(size * RADIUS_RATIO);

  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
       <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/>
     </svg>`,
  );

  return sharp({
    create: { width: size, height: size, channels: 4, background: INK },
  })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** The mark, trimmed of its transparent margin and centred on the tile. */
async function icon(size: number, { flatten = false } = {}): Promise<Buffer> {
  const inner = Math.round(size * MARK_SCALE);

  const mark = await sharp(SOURCE)
    .trim()
    .resize(inner, inner, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const { width = inner, height = inner } = await sharp(mark).metadata();

  const composed = sharp(await tile(size)).composite([
    {
      input: mark,
      // Rounded to whole pixels. A half pixel offset on a 16px tile is three
      // percent of the width and shows as a mark that is not quite centred.
      left: Math.round((size - width) / 2),
      top: Math.round((size - height) / 2),
    },
  ]);

  // Apple refuses transparency and composites its own background if it finds
  // any, which would put the rounded corners on whatever iOS felt like.
  return (flatten ? composed.flatten({ background: INK }) : composed).png().toBuffer();
}

/**
 * Pack PNGs into an ICO.
 *
 * Written out rather than pulled from a package, because the format is a
 * six byte header, a sixteen byte entry per image and then the images, and
 * every icon editor since Vista has accepted PNG data inside that wrapper. A
 * dependency for thirty lines of `writeUInt` is not a trade worth making.
 */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 is an icon, 2 would be a cursor
  header.writeUInt16LE(images.length, 4);

  const ENTRY = 16;
  let offset = header.length + images.length * ENTRY;

  const entries: Buffer[] = [];

  for (const { size, png } of images) {
    const entry = Buffer.alloc(ENTRY);
    // 256 is stored as 0, the one place the format is quietly clever.
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size, 0 for truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);

    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main() {
  console.log(`\nSource: ${SOURCE}`);

  const general = await icon(512);
  await writeFile('src/app/icon.png', general);
  console.log(`  src/app/icon.png        512  ${(general.length / 1024).toFixed(1)}KB`);

  const apple = await icon(180, { flatten: true });
  await writeFile('src/app/apple-icon.png', apple);
  console.log(`  src/app/apple-icon.png  180  ${(apple.length / 1024).toFixed(1)}KB`);

  const favicon = ico([
    { size: 32, png: await icon(32) },
    { size: 16, png: await icon(16) },
  ]);
  await writeFile('src/app/favicon.ico', favicon);
  console.log(`  src/app/favicon.ico   32,16  ${(favicon.length / 1024).toFixed(1)}KB`);

  console.log('\nDone. The App Router picks all three up by filename.\n');
}

main().catch((err) => {
  console.error(`\nCould not build the icons: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
