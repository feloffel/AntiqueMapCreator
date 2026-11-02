/* Procedural "aged paper" texture.
 * Produces a transparent canvas with sepia speckles, soft stains and fibres,
 * meant to be composited over the map with a multiply blend so the whole
 * image reads as old parchment. Used both for the live preview (as a CSS
 * background image) and for the exported PNG (drawn onto the export canvas). */
window.OSMMap = window.OSMMap || {};

(function () {
  // Small deterministic PRNG so a given seed always yields the same grain.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Build a texture canvas.
   * @param {number} w pixel width
   * @param {number} h pixel height
   * @param {object} opts { seed, intensity (0..1), stain color }
   * @returns {HTMLCanvasElement}
   */
  OSMMap.buildTexture = function (w, h, opts) {
    opts = opts || {};
    const seed = opts.seed == null ? 1337 : opts.seed;
    const intensity = opts.intensity == null ? 1 : opts.intensity;
    const rnd = mulberry32(seed);

    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext("2d");

    const area = c.width * c.height;
    const diag = Math.hypot(c.width, c.height);

    // 1) Large soft stains (coffee-ring blotches)
    const stainCount = Math.round((area / 480000) * 6 * intensity) + 4;
    for (let i = 0; i < stainCount; i++) {
      const x = rnd() * c.width;
      const y = rnd() * c.height;
      const r = (0.04 + rnd() * 0.16) * diag;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = (0.03 + rnd() * 0.05) * intensity;
      const warm = rnd() > 0.4;
      const col = warm ? "120,86,46" : "80,64,40";
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(0.7, `rgba(${col},${a * 0.5})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
    }

    // 2) Edge darkening (soft inner border, like handled paper)
    const edge = ctx.createRadialGradient(
      c.width / 2, c.height / 2, diag * 0.33,
      c.width / 2, c.height / 2, diag * 0.52
    );
    edge.addColorStop(0, "rgba(90,66,36,0)");
    edge.addColorStop(1, `rgba(90,66,36,${0.14 * intensity})`);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, c.width, c.height);

    // 3) Fine speckle grain, drawn into an ImageData for speed
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const density = 0.10 * intensity; // fraction of pixels that get a speck
    const specks = Math.round(area * density);
    for (let i = 0; i < specks; i++) {
      const px = (Math.floor(rnd() * c.width) + Math.floor(rnd() * c.height) * c.width) * 4;
      const dark = rnd() > 0.5;
      const amt = Math.floor(rnd() * 22) + 4;
      // alpha-composite a tiny dark/light fleck onto whatever is there
      const ca = amt / 255;
      const r = dark ? 70 : 240, g2 = dark ? 55 : 236, b = dark ? 35 : 214;
      const inv = 1 - ca;
      d[px]     = d[px]     * inv + r * ca;
      d[px + 1] = d[px + 1] * inv + g2 * ca;
      d[px + 2] = d[px + 2] * inv + b * ca;
      d[px + 3] = Math.min(255, d[px + 3] + amt);
    }
    ctx.putImageData(img, 0, 0);

    return c;
  };

  /** Convenience: a texture sized for the preview, returned as a data URL. */
  OSMMap.textureDataURL = function (w, h, opts) {
    return OSMMap.buildTexture(w, h, opts).toDataURL("image/png");
  };
})();
