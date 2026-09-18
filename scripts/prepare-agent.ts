/**
 * Turns the supplied Kora Agent artwork into the portrait the panel draws.
 *
 *   npm run prepare:agent
 *
 * The agent had a glyph rather than a face: a lucide sparkle in a black
 * rounded square, which is the same object every other product in the category
 * uses for the same purpose and therefore says nothing. The supplied artwork
 * is a portrait, and the app already has a slot for portraits, and every
 * counterparty in the transaction list is drawn as one. Putting the agent in
 * that slot is the cheapest way to say it is a participant rather than a
 * feature.
 *
 * Two things about the source file are worth writing down, because both would
 * waste somebody's afternoon.
 *
 * It is named `.png` and is not one. `sharp` reports `format: 'webp'`, three
 * channels, no alpha. Nothing downstream cares, since this re-encodes, but a
 * tool that trusts the extension will disagree with a tool that reads the
 * header.
 *
 * Its background is not white. The ring around the canvas measures
 * rgb(226, 206, 188), a warm beige, which is left alone rather than keyed out.
 * Keying it would cut a hard silhouette through the floral crown, where the
 * artwork's own shapes sit on the background at low contrast and there is no
 * edge to find. The crop is tight enough that the beige reads as the tile's
 * own colour rather than as a background that failed to be removed.
 *
 * Re-run this if a new portrait is supplied.
 */

import sharp from 'sharp';
import { stat } from 'node:fs/promises';

const SOURCE = 'assets/kora-agent.png';
const OUTPUT = 'public/kora-agent.png';

/**
 * The crop, picked by rendering candidates at the size they are actually
 * drawn rather than by eye at full resolution.
 *
 * Five squares were rendered at 32 pixels, the size of the panel header
 * avatar, and magnified with nearest neighbour so the pixels could be
 * counted. The full artwork and anything wider than about 580 loses the face
 * entirely at that size: the head becomes one element in a composition and
 * the tile reads as an abstract pattern. Anything tighter than about 460
 * keeps the face and throws away the floral crown, which is the half of the
 * artwork that is memorable.
 *
 * 540 square from (240, 110) is the one that holds both. At 32 pixels the
 * sunglasses, the profile and the crown are all still legible as separate
 * things, and it is the smallest crop for which that is true.
 */
const CROP = { left: 240, top: 110, width: 540, height: 540 };

/**
 * Emitted at 512 rather than at the crop's own 540.
 *
 * 512 is more than twice the largest size the portrait is drawn at anywhere,
 * so `next/image` always has a source to downsample from rather than one to
 * stretch, and the small even number keeps the optimiser's 1x and 2x pair on
 * whole pixels. The extra 28 pixels of the native crop buy nothing at any
 * size the app asks for.
 */
const SIZE = 512;

/**
 * Written as a palette PNG, which is a quarter of the size for no visible
 * difference.
 *
 * A truecolour PNG of this artwork is 491 KB, which is a poor thing to keep in
 * a repository for an image the app draws at 32 pixels. Quantising to a
 * palette takes it to 123 KB. The two were rendered side by side at 180 and at
 * 56 pixels and there is nothing to choose between them: the artwork is flat
 * vector shapes with one soft gradient across the skin, which is close to the
 * best case for quantisation, and the only place the difference could show is
 * that gradient, at a size nothing draws it at.
 *
 * The wire cost was never the reason. `next/image` re-encodes to AVIF or WebP
 * at the requested size either way, so this is about what the repository
 * carries, not about what the browser downloads.
 */
const PNG_OPTIONS = { compressionLevel: 9, palette: true } as const;

async function main() {
  const meta = await sharp(SOURCE).metadata();
  console.log(
    `Source: ${meta.width}x${meta.height}, format ${meta.format}, ` +
      `${meta.channels} channels, alpha: ${meta.hasAlpha}`,
  );

  if (!meta.width || !meta.height) throw new Error('Source has no dimensions.');

  const right = CROP.left + CROP.width;
  const bottom = CROP.top + CROP.height;

  if (right > meta.width || bottom > meta.height) {
    throw new Error(
      `Crop runs off the canvas: needs ${right}x${bottom}, ` +
        `source is ${meta.width}x${meta.height}.`,
    );
  }

  const out = await sharp(SOURCE)
    .extract(CROP)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .png(PNG_OPTIONS)
    .toFile(OUTPUT);

  const before = (await stat(SOURCE)).size;
  const after = (await stat(OUTPUT)).size;

  console.log(
    `Crop:   ${CROP.width}x${CROP.height} from (${CROP.left}, ${CROP.top}), ` +
      `resized to ${out.width}x${out.height}`,
  );
  console.log(
    `Size:   ${(before / 1024).toFixed(0)} KB to ${(after / 1024).toFixed(0)} KB`,
  );
  console.log(`Written to ${OUTPUT}`);
}

main().catch((err) => {
  console.error('\nAgent portrait preparation failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
