import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Sign in used to live at /signin and is now the root route.
   *
   * Anything already pointing at the old path, a bookmark or a line in a demo
   * script, would otherwise hit a 404 in front of an audience. Temporary
   * rather than permanent on purpose: a 308 is cached by the browser forever
   * and this is a week old project whose routes may still move.
   */
  redirects() {
    return Promise.resolve([{ source: '/signin', destination: '/', permanent: false }]);
  },

  images: {
    /*
     * AVIF first, WebP behind it.
     *
     * The portraits are the only bitmaps of any size the app serves, and they
     * are photographs, which is exactly what these two formats are good at.
     * AVIF is the smaller of the pair by a wide margin on faces; WebP is the
     * fallback for anything that cannot take it. A browser that can take
     * neither gets the original, which still works, just heavily.
     */
    formats: ["image/avif", "image/webp"],

    /*
     * The sizes a portrait is ever actually drawn at.
     *
     * 36 in the rail, 38 and 40 in the beneficiary book and the header, 44 in
     * a transaction row, so the widths that matter are those and their retina
     * pairs. Next's default list starts at 16 and runs to 384, and every entry
     * in it is a size the optimiser may be asked to produce and cache. Cutting
     * it to the four that exist means a cold deploy transforms each portrait a
     * handful of times rather than sixteen.
     */
    imageSizes: [40, 48, 80, 96],

    /*
     * The quality the portraits are asked for, declared because it has to be.
     *
     * Next only serves quality values named here, and the default list is just
     * [75]. Asking for anything else answers 400, and for this component a 400
     * is invisible: the image errors, `Avatar` does exactly what it was built
     * to do and falls back to the monogram, and the interface looks correct
     * while serving none of the artwork. Found by measuring the transfer
     * rather than by reading the build, which was clean throughout.
     *
     * 80 rather than the default, because these are faces at 44px and the
     * extra few kilobytes buy skin tones that do not band.
     */
    qualities: [80],

    /*
     * Thirty days.
     *
     * These files never change without a deploy, and the default of sixty
     * seconds means the optimiser re-reads a six megabyte source far more
     * often than anything about this app warrants.
     */
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
