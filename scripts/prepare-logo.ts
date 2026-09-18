/**
 * Turns the supplied KORA logo into a usable web asset.
 *
 *   npm run prepare:logo
 *
 * The logo arrived as an opaque PNG: colour type 2, no alpha channel, the mark
 * painted onto a near black square at rgb(12,12,12) with a wide margin. That
 * asset can only ever sit on a surface of exactly that colour. On white it is
 * a black box, and on pure black it is a visibly lighter box, which is what
 * `mix-blend-screen` could not hide.
 *
 * This derives a real alpha channel from luminance, so the near black
 * background resolves to fully transparent and the anti aliased edges of the
 * mark keep their partial coverage instead of turning into a hard jagged
 * outline. The colour channels are then flattened to the mark's own cream, so
 * semi transparent edge pixels tint towards the mark rather than towards the
 * background they came from. Finally the transparent margin is trimmed.
 *
 * Re-run this if a new source logo is supplied.
 */

import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';

const SOURCE = 'assets/kora-logo-original.png';
const OUTPUT = 'public/kora-mark.png';

/** Luminance of the background, measured from the supplied file. */
const BACKGROUND_LUM = 12;
/** Luminance at which a pixel counts as fully part of the mark. */
const MARK_LUM = 235;
/** The mark's own colour, sampled from the centre of the supplied file. */
const MARK_RGB: [number, number, number] = [245, 234, 220];

async function main() {
  const source = sharp(SOURCE);
  const meta = await source.metadata();
  console.log(`Source: ${meta.width}x${meta.height}, ${meta.channels} channels, alpha: ${meta.hasAlpha}`);

  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const out = Buffer.alloc(pixels * 4);

  let opaque = 0;

  for (let i = 0; i < pixels; i++) {
    const s = i * info.channels;
    const r = data[s];
    const g = data[s + 1];
    const b = data[s + 2];

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const t = (lum - BACKGROUND_LUM) / (MARK_LUM - BACKGROUND_LUM);
    const alpha = Math.round(Math.min(1, Math.max(0, t)) * 255);

    const d = i * 4;
    out[d] = MARK_RGB[0];
    out[d + 1] = MARK_RGB[1];
    out[d + 2] = MARK_RGB[2];
    out[d + 3] = alpha;

    if (alpha > 0) opaque++;
  }

  console.log(`Visible pixels: ${((opaque / pixels) * 100).toFixed(1)}% of the canvas`);

  await mkdir('public', { recursive: true });

  const info2 = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    // Drop the fully transparent margin so the mark fills its own box and can
    // be sized directly, rather than every caller guessing at a scale factor.
    .trim({ threshold: 1 })
    .png({ compressionLevel: 9, palette: false })
    .toFile(OUTPUT);

  const before = (await stat(SOURCE)).size;
  const after = (await stat(OUTPUT)).size;

  console.log(`Output: ${info2.width}x${info2.height}, alpha: true`);
  console.log(
    `Size:   ${(before / 1024).toFixed(0)} KB to ${(after / 1024).toFixed(0)} KB ` +
      `(${(100 - (after / before) * 100).toFixed(0)}% smaller)`,
  );
  console.log(`Written to ${OUTPUT}`);
}

main().catch((err) => {
  console.error('\nLogo preparation failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
