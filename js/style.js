/* Builds a MapLibre GL style for the antique look from a palette + layer toggles.
 * Data: OpenFreeMap vector tiles (OpenMapTiles schema, keyless).
 * No text/symbol layers are added here — place names are drawn by labels.js on
 * a canvas overlay so we can use a period serif font and control the look. */
window.OSMMap = window.OSMMap || {};

(function () {
  const TILES = "https://tiles.openfreemap.org/planet";
  const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

  // --- small colour helper: shade a #rrggbb hex by amt (-100..100) ---
  function shade(hex, amt) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = amt / 100;
    const mix = (c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
    r = mix(r); g = mix(g); b = mix(b);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * @param {object} opts
   *   palette: palette object
   *   show: { regions, water, boundaries, roads }   (land-use fills / water / admin lines / roads)
   *   regionsGeoJSON: FeatureCollection|null   (coloured admin polygons overlay)
   *   regionOpacity: number
   */
  OSMMap.buildStyle = function (opts) {
    const p = opts.palette;
    const show = opts.show || {};
    const layers = [];

    // 1. Parchment background
    layers.push({
      id: "bg",
      type: "background",
      paint: { "background-color": p.paper }
    });

    if (show.regions) {
      // 2. Landcover (woods, grass, scrub)
      layers.push({
        id: "landcover",
        type: "fill",
        source: "ofm",
        "source-layer": "landcover",
        paint: {
          "fill-color": ["match", ["get", "class"],
            "wood", shade(p.landcover, -12),
            "grass", p.landcover,
            "scrub", shade(p.landcover, 6),
            "wetland", shade(p.water, 8),
            shade(p.landcover, 3)],
          "fill-opacity": 0.38
        }
      });
      // 3. Land use (residential / commercial / industrial / …)
      layers.push({
        id: "landuse",
        type: "fill",
        source: "ofm",
        "source-layer": "landuse",
        paint: {
          "fill-color": ["match", ["get", "class"],
            "residential", p.landuseResidential,
            ["commercial", "retail"], p.landuseCommercial,
            ["industrial", "garages"], p.landuseIndustrial,
            ["cemetery", "grave_yard"], shade(p.park, -8),
            ["stadium", "pitch", "playground"], shade(p.park, 4),
            p.landuseResidential],
          "fill-opacity": 0.4
        }
      });
      // 4. Parks / protected areas
      layers.push({
        id: "park",
        type: "fill",
        source: "ofm",
        "source-layer": "park",
        paint: { "fill-color": p.park, "fill-opacity": 0.45 }
      });
    }

    // 5. Coloured admin regions (overlay) — fill sits under water so lakes show through
    if (opts.regionsGeoJSON) {
      layers.push({
        id: "regions-fill",
        type: "fill",
        source: "regions",
        paint: {
          "fill-color": ["coalesce", ["get", "_fill"], "#d8cdb2"],
          "fill-opacity": opts.regionOpacity == null ? 0.55 : opts.regionOpacity
        }
      });
    }

    // 6. Water bodies
    if (show.water) {
      layers.push({
        id: "water",
        type: "fill",
        source: "ofm",
        "source-layer": "water",
        filter: ["!=", ["get", "intermittent"], 1],
        paint: { "fill-color": p.water, "fill-opacity": 0.82 }
      });
      // 7. Rivers / streams / canals
      layers.push({
        id: "waterway",
        type: "line",
        source: "ofm",
        "source-layer": "waterway",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": p.waterLine,
          "line-opacity": 0.7,
          "line-width": ["interpolate", ["linear"], ["zoom"],
            9, ["match", ["get", "class"], "river", 0.8, 0.3],
            14, ["match", ["get", "class"], "river", 2.4, 1.0]]
        }
      });
    }

    // 8. Region outlines (dotted, coloured) — above water so they stay crisp
    if (opts.regionsGeoJSON) {
      layers.push({
        id: "regions-line",
        type: "line",
        source: "regions",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["coalesce", ["get", "_line"], "#9c8a66"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.2, 12, 2.2],
          "line-opacity": 0.9,
          "line-dasharray": [1, 1.6]
        }
      });
    }

    // 9. Administrative boundaries (from tiles)
    if (show.boundaries) {
      layers.push({
        id: "boundary-minor",
        type: "line",
        source: "ofm",
        "source-layer": "boundary",
        filter: [">=", ["get", "admin_level"], 5],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": shade(p.boundary, 12),
          "line-opacity": 0.45,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 1.1],
          "line-dasharray": [2, 2]
        }
      });
      layers.push({
        id: "boundary-major",
        type: "line",
        source: "ofm",
        "source-layer": "boundary",
        filter: ["<=", ["get", "admin_level"], 4],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": p.boundary,
          "line-opacity": 0.65,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 12, 1.8],
          "line-dasharray": [3, 1.6]
        }
      });
    }

    // 10. Roads — deliberately faint
    if (show.roads) {
      layers.push({
        id: "roads-minor",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal",
          ["secondary", "tertiary", "minor", "service"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": p.road,
          "line-opacity": 0.28,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.3, 16, 1.4]
        }
      });
      layers.push({
        id: "roads-major",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal",
          ["motorway", "trunk", "primary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": p.roadMajor,
          "line-opacity": 0.42,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 2.6]
        }
      });
    }

    const sources = {
      ofm: { type: "vector", url: TILES }
    };
    if (opts.regionsGeoJSON) {
      sources.regions = { type: "geojson", data: opts.regionsGeoJSON };
    }

    return {
      version: 8,
      glyphs: GLYPHS,
      sources,
      layers
    };
  };

  OSMMap.shade = shade;
})();
