/* Fetches real administrative areas from the OSM Overpass API for the current
 * view, turns the relations into polygons, and tints each one a different
 * palette colour — the "coloured districts / kingdoms" effect.
 *
 * Notes on the tricky bits:
 *  - Admin-level numbering varies by country, so "Auto" fetches several levels
 *    and keeps the FINEST area available at each spot (e.g. a city's level-10
 *    districts plus the surrounding level-8 municipalities).
 *  - The query box is padded so areas whose boundary sits just outside the
 *    view are still returned (Overpass's (bbox) filter is member-based).
 *  - Only full-planet, CORS-enabled mirrors are used. Region-limited mirrors
 *    (e.g. overpass.osm.ch) are deliberately excluded. */
window.OSMMap = window.OSMMap || {};

(function () {
  // Full-planet mirrors that send CORS headers. (overpass.osm.ch is NOT here:
  // it only covers Switzerland and would return empty results elsewhere.)
  const ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  // For "Auto": a PRIMARY level (the main unit at this zoom) plus finer FILL
  // levels used only where the primary doesn't cover — e.g. municipalities
  // everywhere, with a kreisfreie Stadt (level 6, no level 8) filled by its
  // level-10 districts. Finest fill first.
  function autoPlan(zoom) {
    if (zoom < 5.5) return { primary: "4", fill: [] };
    if (zoom < 8.5) return { primary: "6", fill: [] };          // Landkreise + Stadtkreise (both lvl 6)
    if (zoom < 11.5) return { primary: "8", fill: ["9", "10"] }; // municipalities (+ city districts, lvl 9 & 10, in gaps)
    return { primary: "10", fill: ["9", "8"] };                 // city districts (+ coarser in gaps)
  }

  function padBounds(b, frac) {
    const s = b.getSouth(), w = b.getWest(), n = b.getNorth(), e = b.getEast();
    const dy = (n - s) * frac, dx = (e - w) * frac;
    return { s: s - dy, w: w - dx, n: n + dy, e: e + dx };
  }

  function buildQuery(pb, levels) {
    const rex = levels.join("|");
    return (
      "[out:json][timeout:30];" +
      '(relation["boundary"="administrative"]["admin_level"~"^(' + rex + ')$"]' +
      "(" + pb.s + "," + pb.w + "," + pb.n + "," + pb.e + "););" +
      "out geom;"
    );
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runOverpass(query) {
    let busy = false, lastErr;
    for (const url of ENDPOINTS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 45000);
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "data=" + encodeURIComponent(query),
            signal: ctrl.signal
          });
          clearTimeout(timer);
          if ([429, 502, 503, 504].indexOf(res.status) !== -1) {
            busy = true; lastErr = new Error("HTTP " + res.status);
            await sleep(900); continue;
          }
          const txt = await res.text();
          let json = null;
          try { json = JSON.parse(txt); } catch (e) {}
          if (!json) { // XML/HTML error page — almost always overload / rate-limit
            busy = true; lastErr = new Error("non-JSON response (server busy)");
            await sleep(900); continue;
          }
          if (json.remark && /timed out|runtime error|out of memory/i.test(json.remark) &&
              (!json.elements || !json.elements.length)) {
            busy = true; lastErr = new Error(json.remark.trim());
            break; // too heavy here — try the next endpoint
          }
          return json;
        } catch (err) {
          lastErr = err;
          if (/abort/i.test(String(err))) busy = true;
          await sleep(500);
        }
      }
    }
    const e = new Error(lastErr ? lastErr.message : "All Overpass endpoints failed");
    e.busy = busy;
    throw e;
  }

  // ---- geometry helpers ----
  function ringCentroid(ring) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const x0 = ring[j][0], y0 = ring[j][1], x1 = ring[i][0], y1 = ring[i][1];
      const f = x0 * y1 - x1 * y0;
      a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    if (Math.abs(a) < 1e-12) {
      let sx = 0, sy = 0;
      ring.forEach((p) => { sx += p[0]; sy += p[1]; });
      return [sx / ring.length, sy / ring.length, 0];
    }
    a *= 0.5;
    return [cx / (6 * a), cy / (6 * a), Math.abs(a)];
  }

  function featureCentroid(geom) {
    if (!geom) return null;
    if (geom.type === "Polygon") return ringCentroid(geom.coordinates[0]);
    if (geom.type === "MultiPolygon") {
      let best = null;
      for (const poly of geom.coordinates) {
        const c = ringCentroid(poly[0]);
        if (!best || c[2] > best[2]) best = c;
      }
      return best;
    }
    return null;
  }

  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      const denom = (yj - yi) || 1e-12;
      const hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / denom + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  function pointInFeature(x, y, geom) {
    if (!geom) return false;
    if (geom.type === "Polygon") {
      if (!pointInRing(x, y, geom.coordinates[0])) return false;
      for (let k = 1; k < geom.coordinates.length; k++) {
        if (pointInRing(x, y, geom.coordinates[k])) return false; // in a hole
      }
      return true;
    }
    if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        if (pointInRing(x, y, poly[0])) {
          let hole = false;
          for (let k = 1; k < poly.length; k++) {
            if (pointInRing(x, y, poly[k])) { hole = true; break; }
          }
          if (!hole) return true;
        }
      }
      return false;
    }
    return false;
  }

  function toPolys(gj) {
    return (gj.features || []).filter((f) => {
      const t = f.geometry && f.geometry.type;
      const p = f.properties || {};
      return (t === "Polygon" || t === "MultiPolygon") && p.boundary === "administrative";
    });
  }

  // Start from the primary-level areas, then add finer "fill" areas only where
  // the primary leaves a gap (e.g. inside a kreisfreie Stadt that has no level-8
  // municipality). A candidate is skipped if it overlaps anything already kept —
  // tested both ways so neither nesting direction double-colours (e.g. the
  // level-9 "Wettersbach" vs its level-10 parts Grünwettersbach/Palmbach).
  function mergeWithFill(primaryPolys, fillGroups) {
    const kept = primaryPolys.slice();
    for (const group of fillGroups) {
      for (const f of group) {
        const c = f.__c;
        if (!c) continue;
        let overlap = false;
        for (const k of kept) {
          if (pointInFeature(c[0], c[1], k.geometry)) { overlap = true; break; }
          if (k.__c && pointInFeature(k.__c[0], k.__c[1], f.geometry)) { overlap = true; break; }
        }
        if (!overlap) kept.push(f);
      }
    }
    return kept;
  }

  /**
   * @returns {Promise<{geojson, labels, count, levelsUsed}>}
   */
  OSMMap.fetchRegions = async function (map, levelOpt, palette) {
    const isAuto = (!levelOpt || levelOpt === "auto");
    const plan = isAuto ? autoPlan(map.getZoom()) : { primary: String(levelOpt), fill: [] };
    const levels = [plan.primary].concat(plan.fill);
    const pb = padBounds(map.getBounds(), 0.08);
    const raw = await runOverpass(buildQuery(pb, levels));

    if (typeof osmtogeojson !== "function") {
      throw new Error("osmtogeojson failed to load (check your connection).");
    }
    let polys = toPolys(osmtogeojson(raw));

    // de-dup by id/name
    const seen = new Set();
    polys = polys.filter((f) => {
      const p = f.properties || {};
      const key = (p["@id"] || p.id || "") + "|" + (p.name || "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // attach centroid + level, then combine primary + fill levels
    polys.forEach((f) => {
      f.__c = featureCentroid(f.geometry);
      f.__lvl = parseInt(f.properties.admin_level, 10) || 0;
    });
    if (plan.fill.length) {
      const prim = +plan.primary;
      const primaryPolys = polys.filter((f) => f.__lvl === prim);
      const fillGroups = plan.fill.map((lv) => polys.filter((f) => f.__lvl === (+lv)));
      polys = mergeWithFill(primaryPolys, fillGroups);
    } else {
      polys = polys.filter((f) => f.__lvl === (+plan.primary));
    }

    polys.sort((a, b) => String(a.properties.name || "").localeCompare(String(b.properties.name || "")));

    const colours = palette.regions;
    const labels = [];
    polys.forEach((f, i) => {
      const col = colours[i % colours.length];
      f.properties._fill = col.fill;
      f.properties._line = col.line;
      const name = f.properties.name || f.properties["name:en"] || "";
      f.properties._name = name;
      const c = f.__c || featureCentroid(f.geometry);
      if (c && name) labels.push({ lng: c[0], lat: c[1], text: name });
      delete f.__c; delete f.__lvl; // don't ship helper props into the source
    });

    return {
      geojson: { type: "FeatureCollection", features: polys },
      labels,
      count: polys.length,
      levelsUsed: levels
    };
  };
})();
