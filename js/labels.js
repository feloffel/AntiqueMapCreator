/* Place-name renderer.
 * Pulls point features from the OSM `place` layer (and optional region
 * centroids), lays them out with greedy collision avoidance, and paints them
 * in a period serif face. Used for both the live overlay and the export, so the
 * exact same names/positions appear in the PNG. */
window.OSMMap = window.OSMMap || {};

(function () {
  const FACE_SC = '"IM Fell English SC"';
  const FACE_EN = '"IM Fell English"';

  // class -> rendering rules. order: lower = higher priority (placed first).
  const CLASSES = {
    region:        { order: -1, min: 0,  max: 22, size: 15,   caps: true,  italic: false, spacing: 2,   face: FACE_SC },
    continent:     { order: 0,  min: 0,  max: 4,  size: 22,   caps: true,  italic: false, spacing: 4,   face: FACE_SC },
    country:       { order: 0,  min: 0,  max: 7,  size: 21,   caps: true,  italic: false, spacing: 3,   face: FACE_SC },
    state:         { order: 1,  min: 4,  max: 9,  size: 16,   caps: true,  italic: false, spacing: 2,   face: FACE_SC },
    province:      { order: 1,  min: 4,  max: 9,  size: 16,   caps: true,  italic: false, spacing: 2,   face: FACE_SC },
    city:          { order: 2,  min: 6,  max: 22, size: 18,   caps: false, italic: false, spacing: 0,   face: FACE_EN },
    town:          { order: 3,  min: 9,  max: 22, size: 13,   caps: false, italic: false, spacing: 0,   face: FACE_EN },
    island:        { order: 4,  min: 7,  max: 22, size: 12,   caps: false, italic: true,  spacing: 0,   face: FACE_EN },
    suburb:        { order: 5,  min: 10, max: 22, size: 12,   caps: false, italic: true,  spacing: 0.4, face: FACE_EN },
    village:       { order: 6,  min: 11, max: 22, size: 11,   caps: false, italic: true,  spacing: 0,   face: FACE_EN },
    quarter:       { order: 6,  min: 12, max: 22, size: 11,   caps: false, italic: true,  spacing: 0.3, face: FACE_EN },
    neighbourhood: { order: 7,  min: 12, max: 22, size: 10.5, caps: false, italic: true,  spacing: 0.3, face: FACE_EN },
    hamlet:        { order: 8,  min: 13, max: 22, size: 9.5,  caps: false, italic: true,  spacing: 0,   face: FACE_EN },
    locality:      { order: 9,  min: 12, max: 22, size: 10,   caps: false, italic: true,  spacing: 0,   face: FACE_EN }
  };

  function pickName(props) {
    return props.name || props["name:latin"] || props.name_en || props["name:en"] || "";
  }

  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, " ").trim(); }

  function fontString(rule, size) {
    return (rule.italic ? "italic " : "") + size + "px " + rule.face;
  }

  // Emphasis applied to the single most important city (or town) in view so the
  // map's main place name reads big and central, well above suburbs/municipalities.
  const EMPHASIS = {
    off:   null,
    large: { size: 30, spacing: 3, face: FACE_SC },
    huge:  { size: 42, spacing: 4, face: FACE_SC }
  };

  /**
   * Compute label placements in CSS pixel coordinates.
   * @param {maplibregl.Map} map
   * @param {object} opts { margin, extraLabels:[{lng,lat,text}], maxLabels,
   *                        placeFeatures, cityEmphasis: 'off'|'large'|'huge' }
   * @returns {Array} placed labels [{text,x,y,size,italic,face,spacing,caps,primary}]
   */
  OSMMap.layoutLabels = function (map, opts) {
    opts = opts || {};
    const margin = opts.margin == null ? 22 : opts.margin;
    const maxLabels = opts.maxLabels || 160;
    const emphasis = EMPHASIS[opts.cityEmphasis] !== undefined
      ? EMPHASIS[opts.cityEmphasis] : EMPHASIS.large;
    const z = map.getZoom();
    const canvas = map.getCanvas();
    const W = canvas.clientWidth || canvas.width;
    const H = canvas.clientHeight || canvas.height;

    // ---- gather place-layer candidates ----
    let feats = [];
    if (opts.placeFeatures !== false) {
      try { feats = map.querySourceFeatures("ofm", { sourceLayer: "place" }); }
      catch (e) { feats = []; }
    }
    const seen = new Set();
    const placeCands = [];
    for (const f of feats) {
      const props = f.properties || {};
      const cls = props.class;
      const rule = CLASSES[cls];
      if (!rule) continue;
      if (z < rule.min - 0.001 || z > rule.max + 0.001) continue;
      const text = pickName(props);
      if (!text) continue;
      if (!f.geometry || f.geometry.type !== "Point") continue;
      const key = cls + "|" + text;
      if (seen.has(key)) continue;
      seen.add(key);
      const coords = f.geometry.coordinates;
      placeCands.push({
        lng: coords[0], lat: coords[1], text, cls, rule,
        ord: rule.order, rank: props.rank == null ? 50 : +props.rank
      });
    }

    // ---- pick the primary settlement: biggest city, else biggest town ----
    let primary = null;
    if (emphasis) {
      const byRank = (a, b) => a.rank - b.rank;
      const cities = placeCands.filter((c) => c.cls === "city").sort(byRank);
      const towns = placeCands.filter((c) => c.cls === "town").sort(byRank);
      primary = cities[0] || towns[0] || null;
    }
    const primaryName = primary ? norm(primary.text) : null;

    // ---- assemble the final candidate list ----
    const candidates = [];

    // region centroid labels; skip the one equal to the primary city so the big
    // city label wins over a small region label of the same name.
    const regionNames = new Set();
    (opts.extraLabels || []).forEach((e) => {
      if (primaryName && norm(e.text) === primaryName) return;
      regionNames.add(norm(e.text));
      candidates.push({ lng: e.lng, lat: e.lat, text: e.text, rule: CLASSES.region, ord: -1, rank: 0 });
    });

    placeCands.forEach((c) => {
      const isPrimary = primary && c === primary;
      if (!isPrimary && regionNames.has(norm(c.text))) return; // duplicate of a region label
      if (isPrimary) {
        candidates.push({
          lng: c.lng, lat: c.lat, text: c.text, primary: true, ord: -2, rank: -1,
          rule: { size: emphasis.size, caps: true, italic: false, spacing: emphasis.spacing, face: emphasis.face }
        });
      } else {
        candidates.push({ lng: c.lng, lat: c.lat, text: c.text, rule: c.rule, ord: c.ord, rank: c.rank });
      }
    });

    // Priority: primary city, then regions, then class order, then OSM rank.
    candidates.sort((a, b) => (a.ord - b.ord) || (a.rank - b.rank));

    // ---- greedy placement with AABB collision ----
    const ctx = OSMMap._measureCtx || (OSMMap._measureCtx = document.createElement("canvas").getContext("2d"));
    const placed = [];
    const boxes = [];

    for (const c of candidates) {
      if (placed.length >= maxLabels) break;
      const pt = map.project([c.lng, c.lat]);
      const rule = c.rule;
      const text = rule.caps ? c.text.toUpperCase() : c.text;
      ctx.font = fontString(rule, rule.size);
      if ("letterSpacing" in ctx) ctx.letterSpacing = rule.spacing + "px";
      let w = ctx.measureText(text).width;
      if (!("letterSpacing" in ctx) && rule.spacing) w += rule.spacing * (text.length - 1);
      const h = rule.size;
      const x0 = pt.x - w / 2, y0 = pt.y - h / 2;
      const box = { x0: x0 - 2, y0: y0 - 2, x1: x0 + w + 2, y1: y0 + h + 2 };

      if (c.primary) {
        // the main city is always drawn as long as its anchor is in view
        if (pt.x < -60 || pt.x > W + 60 || pt.y < -60 || pt.y > H + 60) continue;
      } else {
        if (pt.x < margin || pt.x > W - margin || pt.y < margin || pt.y > H - margin) continue;
        const edge = 6;
        if (box.x0 < edge || box.x1 > W - edge || box.y0 < edge || box.y1 > H - edge) continue;
        let hit = false;
        for (const b of boxes) {
          if (box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) { hit = true; break; }
        }
        if (hit) continue;
      }

      boxes.push(box);
      placed.push({
        text, x: pt.x, y: pt.y, size: rule.size,
        italic: rule.italic, face: rule.face, spacing: rule.spacing, caps: rule.caps,
        primary: !!c.primary
      });
    }
    return placed;
  };

  /**
   * Paint laid-out labels onto a 2D context.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} labels  output of layoutLabels (CSS px coords)
   * @param {number} scale  multiply coords + sizes (dpr for preview, dpi for export)
   * @param {object} palette
   */
  OSMMap.paintLabels = function (ctx, labels, scale, palette) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const haloColor = hexToRgba(palette.paper, 0.72);
    const ink = palette.ink;

    for (const l of labels) {
      const size = l.size * scale;
      ctx.font = (l.italic ? "italic " : "") + size + "px " + l.face;
      if ("letterSpacing" in ctx) ctx.letterSpacing = (l.spacing * scale) + "px";
      const x = l.x * scale, y = l.y * scale;
      // soft parchment halo for legibility over roads/fills
      ctx.strokeStyle = haloColor;
      ctx.lineWidth = Math.max(1, size * 0.16);
      ctx.strokeText(l.text, x, y);
      ctx.fillStyle = ink;
      ctx.fillText(l.text, x, y);
    }
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.restore();
  };

  function hexToRgba(hex, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return "rgba(245,238,220," + a + ")";
    const n = parseInt(m[1], 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  OSMMap.hexToRgba = hexToRgba;
})();
