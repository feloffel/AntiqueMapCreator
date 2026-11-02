/* High-resolution PNG export.
 * Renders an off-screen MapLibre map at an elevated device-pixel-ratio (so the
 * basemap is crisp at print size), then composites the aged-paper texture,
 * serif labels, vignette, frame, title and attribution onto one canvas and
 * hands back a PNG download. */
window.OSMMap = window.OSMMap || {};

(function () {
  const MAX_DIM = 15000; // stay under WebGL / canvas limits

  async function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return;
    const specs = [
      '32px "IM Fell English SC"',
      '32px "IM Fell English"',
      'italic 32px "IM Fell English"',
      '16px "EB Garamond"'
    ];
    try { await Promise.all(specs.map((s) => document.fonts.load(s))); } catch (e) {}
    try { await document.fonts.ready; } catch (e) {}
  }

  function waitForIdle(map, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      map.once("idle", finish);
      setTimeout(finish, timeoutMs);
    });
  }

  function drawVignette(ctx, W, H) {
    const r = Math.max(W, H) * 0.72;
    const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.55, W / 2, H / 2, r);
    g.addColorStop(0, "rgba(60,42,22,0)");
    g.addColorStop(1, "rgba(60,42,22,0.28)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawFrame(ctx, W, H, s) {
    const m = 10 * s;
    ctx.save();
    ctx.strokeStyle = "rgba(74,54,32,0.85)";
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(m + s, m + s, W - 2 * (m + s), H - 2 * (m + s));
    ctx.strokeStyle = "rgba(74,54,32,0.55)";
    ctx.lineWidth = 2 * s;
    const g = m + 8 * s;
    ctx.strokeRect(g + s, g + s, W - 2 * (g + s), H - 2 * (g + s));
    ctx.restore();
  }

  function drawTitle(ctx, text, pos, W, H, s, palette) {
    if (!text) return;
    ctx.save();
    ctx.textAlign = "center";
    if ("letterSpacing" in ctx) ctx.letterSpacing = 2 * s + "px";
    ctx.font = 34 * s + 'px "IM Fell English SC"';
    const x = W / 2;
    // faint light emboss
    ctx.textBaseline = pos === "bottom" ? "alphabetic" : "top";
    const y = pos === "bottom" ? H - 30 * s : 26 * s;
    ctx.fillStyle = "rgba(255,248,230,0.55)";
    ctx.fillText(text, x + s, y + s);
    ctx.fillStyle = palette.ink;
    ctx.fillText(text, x, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.restore();
  }

  function drawAttribution(ctx, W, H, s, palette) {
    ctx.save();
    ctx.font = 11 * s + 'px "EB Garamond", Georgia, serif';
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = OSMMap.hexToRgba(palette.inkLight || "#7c6447", 0.8);
    ctx.fillText("© OpenStreetMap contributors · OpenFreeMap", W - 24 * s, H - 22 * s);
    ctx.restore();
  }

  /**
   * @param {object} opts
   *   previewMap, style, palette, labels (CSS-space layout from previewMap),
   *   show: { texture, vignette, frame }, title:{text,pos}, longEdge, filename,
   *   onProgress(msg)
   */
  OSMMap.exportPNG = async function (opts) {
    const prog = opts.onProgress || function () {};
    const pm = opts.previewMap;
    const container = pm.getContainer();
    const cssW = container.clientWidth;
    const cssH = container.clientHeight;

    let dpi = opts.longEdge / Math.max(cssW, cssH);
    dpi = Math.max(1, dpi);
    if (cssW * dpi > MAX_DIM || cssH * dpi > MAX_DIM) {
      dpi = MAX_DIM / Math.max(cssW, cssH);
    }

    await ensureFonts();
    prog("Rendering map…");

    // offscreen host at the SAME css size as preview (keeps identical framing)
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:-99999px;top:0;width:" + cssW + "px;height:" + cssH + "px;";
    document.body.appendChild(host);

    // elevate devicePixelRatio so the backing store is high-res
    const realDPR = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => dpi });

    let hiddenMap;
    try {
      hiddenMap = new maplibregl.Map({
        container: host,
        style: opts.style,
        center: pm.getCenter(),
        zoom: pm.getZoom(),
        bearing: pm.getBearing(),
        pitch: pm.getPitch(),
        interactive: false,
        attributionControl: false,
        preserveDrawingBuffer: true,
        fadeDuration: 0
      });

      await new Promise((res) => hiddenMap.once("load", res));
      await waitForIdle(hiddenMap, 20000);
      // a couple of frames to be safe
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const src = hiddenMap.getCanvas();
      const W = src.width, H = src.height;
      const s = W / cssW; // px scale from CSS coords -> export px

      prog("Compositing…");
      const out = document.createElement("canvas");
      out.width = W; out.height = H;
      const ctx = out.getContext("2d");

      // base parchment (in case basemap has transparency at edges)
      ctx.fillStyle = opts.palette.paper;
      ctx.fillRect(0, 0, W, H);

      // 1) basemap
      ctx.drawImage(src, 0, 0);

      // 2) aged-paper texture
      if (opts.show.texture) {
        const tex = OSMMap.buildTexture(W, H, { seed: 7, intensity: 1 });
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.globalAlpha = 0.5;
        ctx.drawImage(tex, 0, 0);
        ctx.restore();
      }

      // 3) vignette (under the labels, matching the preview's layer order)
      if (opts.show.vignette) drawVignette(ctx, W, H);

      // 4) place names
      if (opts.labels && opts.labels.length) {
        OSMMap.paintLabels(ctx, opts.labels, s, opts.palette);
      }

      // 5) frame
      if (opts.show.frame) drawFrame(ctx, W, H, s);

      // 6) title
      if (opts.title && opts.title.text) {
        drawTitle(ctx, opts.title.text, opts.title.pos, W, H, s, opts.palette);
      }

      // 7) attribution (required)
      drawAttribution(ctx, W, H, s, opts.palette);

      prog("Encoding PNG…");
      const blob = await new Promise((res) => out.toBlob(res, "image/png"));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = opts.filename || "antique-map.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      return { width: W, height: H };
    } finally {
      if (hiddenMap) hiddenMap.remove();
      host.remove();
      if (realDPR) Object.defineProperty(window, "devicePixelRatio", realDPR);
      else { try { delete window.devicePixelRatio; } catch (e) {} }
    }
  };
})();
