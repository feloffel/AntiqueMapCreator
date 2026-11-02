/* Main application: wires the UI to the map, custom label overlay, Overpass
 * region colouring, decorative overlays and the PNG exporter. */
(function () {
  const P = OSMMap.PALETTES;

  const state = {
    paletteKey: OSMMap.DEFAULT_PALETTE,
    show: { regions: true, water: true, boundaries: true, roads: true },
    labels: true,
    cityEmphasis: "large",
    texture: true,
    vignette: true,
    frame: true,
    regionsGeoJSON: null,
    regionLabels: [],
    showRegionLabels: false,
    title: { text: "", show: false, pos: "top" },
    currentLabels: []
  };

  const el = (id) => document.getElementById(id);
  const palette = () => P[state.paletteKey];

  // ---------------------------------------------------------------- map
  const map = new maplibregl.Map({
    container: "map",
    style: OSMMap.buildStyle({ palette: palette(), show: state.show }),
    center: [2.3488, 48.8534],   // Paris — nice arrondissement districts to start
    zoom: 11,
    attributionControl: false,
    preserveDrawingBuffer: true,
    hash: false
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: "© OpenStreetMap contributors · OpenFreeMap"
  }), "bottom-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");

  function currentStyle() {
    return OSMMap.buildStyle({
      palette: palette(),
      show: state.show,
      regionsGeoJSON: state.regionsGeoJSON,
      regionOpacity: 0.55
    });
  }
  function applyStyle() {
    map.setStyle(currentStyle()); // diff:true by default — smooth, no full reload
    scheduleLabels();
  }

  // ---------------------------------------------------------------- labels overlay
  const labelCanvas = el("labelCanvas");
  const lctx = labelCanvas.getContext("2d");
  let labelsRAF = null;

  function sizeLabelCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const c = map.getContainer();
    const w = c.clientWidth, h = c.clientHeight;
    labelCanvas.width = Math.round(w * dpr);
    labelCanvas.height = Math.round(h * dpr);
    labelCanvas.style.width = w + "px";
    labelCanvas.style.height = h + "px";
    return dpr;
  }

  function renderLabels() {
    labelsRAF = null;
    const dpr = sizeLabelCanvas();
    lctx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);

    const wantPlaces = state.labels;
    const wantRegions = state.showRegionLabels && state.regionLabels.length > 0;
    if (!wantPlaces && !wantRegions) { state.currentLabels = []; return; }

    const placed = OSMMap.layoutLabels(map, {
      margin: 24,
      placeFeatures: wantPlaces,
      cityEmphasis: state.cityEmphasis,
      extraLabels: wantRegions ? state.regionLabels : []
    });
    state.currentLabels = placed;
    OSMMap.paintLabels(lctx, placed, dpr, palette());
  }

  function scheduleLabels() {
    if (labelsRAF == null) labelsRAF = requestAnimationFrame(renderLabels);
  }

  map.on("render", scheduleLabels);
  map.on("move", scheduleLabels);
  map.on("resize", () => { buildTexturePreview(); scheduleLabels(); });
  map.on("idle", scheduleLabels);

  // ---------------------------------------------------------------- decorative previews
  function buildTexturePreview() {
    const c = map.getContainer();
    const w = Math.max(32, c.clientWidth), h = Math.max(32, c.clientHeight);
    const url = OSMMap.textureDataURL(w, h, { seed: 7, intensity: 1 });
    const pt = el("paperTexture");
    pt.style.backgroundImage = "url(" + url + ")";
    pt.style.backgroundSize = "cover";
    pt.style.backgroundRepeat = "no-repeat";
  }

  function syncOverlays() {
    el("paperTexture").classList.toggle("hidden", !state.texture);
    el("vignette").classList.toggle("hidden", !state.vignette);
    el("frame").classList.toggle("hidden", !state.frame);

    const t = el("titleEl");
    t.textContent = state.title.text;
    t.style.color = palette().ink;
    t.classList.toggle("hidden", !(state.title.show && state.title.text));
    t.classList.toggle("pos-top", state.title.pos === "top");
    t.classList.toggle("pos-bottom", state.title.pos === "bottom");
  }

  // ---------------------------------------------------------------- palette UI
  function buildPaletteUI() {
    const wrap = el("palettes");
    wrap.innerHTML = "";
    Object.keys(P).forEach((key) => {
      const p = P[key];
      const d = document.createElement("div");
      d.className = "pal" + (key === state.paletteKey ? " active" : "");
      d.dataset.key = key;
      const sw = p.swatches.map((c) => `<span style="background:${c}"></span>`).join("");
      d.innerHTML = `<div class="swatches">${sw}</div><div class="name">${p.label}</div>`;
      d.addEventListener("click", () => {
        state.paletteKey = key;
        // recolour already-loaded regions to the new palette
        if (state.regionsGeoJSON) recolourRegions();
        document.querySelectorAll(".pal").forEach((n) => n.classList.remove("active"));
        d.classList.add("active");
        applyStyle();
        syncOverlays();
      });
      wrap.appendChild(d);
    });
  }

  function recolourRegions() {
    const cols = palette().regions;
    const feats = state.regionsGeoJSON.features;
    feats.forEach((f, i) => {
      const c = cols[i % cols.length];
      f.properties._fill = c.fill;
      f.properties._line = c.line;
    });
    // push the new colours straight to the live source (don't rely on diff)
    const src = map.getSource && map.getSource("regions");
    if (src && src.setData) src.setData(state.regionsGeoJSON);
  }

  // ---------------------------------------------------------------- toggles
  function bindToggle(id, fn) { el(id).addEventListener("change", (e) => fn(e.target.checked)); }

  bindToggle("t_regions", (v) => { state.show.regions = v; applyStyle(); });
  bindToggle("t_water", (v) => { state.show.water = v; applyStyle(); });
  bindToggle("t_boundaries", (v) => { state.show.boundaries = v; applyStyle(); });
  bindToggle("t_roads", (v) => { state.show.roads = v; applyStyle(); });
  bindToggle("t_labels", (v) => { state.labels = v; scheduleLabels(); });
  bindToggle("t_texture", (v) => { state.texture = v; syncOverlays(); });
  bindToggle("t_vignette", (v) => { state.vignette = v; syncOverlays(); });
  bindToggle("t_frame", (v) => { state.frame = v; syncOverlays(); });
  bindToggle("regionLabels", (v) => { state.showRegionLabels = v; scheduleLabels(); });
  el("cityEmphasis").addEventListener("change", (e) => { state.cityEmphasis = e.target.value; scheduleLabels(); });

  // ---------------------------------------------------------------- title
  el("title").addEventListener("input", (e) => { state.title.text = e.target.value; syncOverlays(); });
  el("titleShow").addEventListener("change", (e) => { state.title.show = e.target.checked; syncOverlays(); });
  el("titlePos").addEventListener("change", (e) => { state.title.pos = e.target.value; syncOverlays(); });

  // ---------------------------------------------------------------- search (Nominatim)
  const searchInput = el("search");
  const resultsBox = el("searchResults");

  async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    resultsBox.classList.remove("hidden");
    resultsBox.innerHTML = '<div class="res">Searching…</div>';
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=" +
        encodeURIComponent(q);
      const res = await fetch(url, { headers: { "Accept-Language": navigator.language || "en" } });
      const data = await res.json();
      if (!data.length) { resultsBox.innerHTML = '<div class="res">No results.</div>'; return; }
      resultsBox.innerHTML = "";
      data.forEach((r) => {
        const d = document.createElement("div");
        d.className = "res";
        const main = r.name || r.display_name.split(",")[0];
        d.innerHTML = `${main}<small>${r.display_name}</small>`;
        d.addEventListener("click", () => {
          resultsBox.classList.add("hidden");
          searchInput.value = main;
          const bb = r.boundingbox; // [south, north, west, east]
          if (bb) {
            map.fitBounds(
              [[+bb[2], +bb[0]], [+bb[3], +bb[1]]],
              { padding: 40, duration: 800, maxZoom: 14 }
            );
          } else {
            map.flyTo({ center: [+r.lon, +r.lat], zoom: 12 });
          }
        });
        resultsBox.appendChild(d);
      });
    } catch (err) {
      resultsBox.innerHTML = '<div class="res">Search failed (network/Nominatim).</div>';
    }
  }
  el("searchBtn").addEventListener("click", doSearch);
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
  // Close the results list when clicking elsewhere — but NOT on the search
  // controls themselves (that click is what opens/refreshes the list).
  document.addEventListener("click", (e) => {
    if (resultsBox.contains(e.target) || e.target === searchInput || e.target === el("searchBtn")) return;
    resultsBox.classList.add("hidden");
  });

  // ---------------------------------------------------------------- regions (Overpass)
  const busy = el("busy");
  const busyText = el("busyText");
  function setBusy(on, msg) { busy.classList.toggle("hidden", !on); if (msg) busyText.textContent = msg; }

  function setRegionStatus(msg, cls) {
    const s = el("regionStatus");
    s.textContent = msg || "";
    s.className = "status" + (cls ? " " + cls : "");
  }

  el("loadRegions").addEventListener("click", async () => {
    const btn = el("loadRegions");
    btn.disabled = true;
    setBusy(true, "Fetching regions from OSM…");
    setRegionStatus("Querying Overpass… this can take a few seconds.");
    try {
      const level = el("adminLevel").value;
      const { geojson, labels, count, levelsUsed } = await OSMMap.fetchRegions(map, level, palette());
      if (!count) {
        setRegionStatus("No admin areas found here at " +
          (level === "auto" ? "levels " + levelsUsed.join("/") : "level " + level) +
          ". Try a different level (German city districts are usually level 10) or zoom out.", "err");
      } else {
        state.regionsGeoJSON = geojson;
        state.regionLabels = labels;
        // show the area names by default so municipalities (e.g. Walzbachtal,
        // which has no place-node) are actually labelled.
        state.showRegionLabels = true;
        el("regionLabels").checked = true;
        applyStyle();
        setRegionStatus(count + " areas coloured (level " + levelsUsed.join("/") + "). " +
          "Untick “Label these regions” to hide their names.", "ok");
      }
    } catch (err) {
      if (err && err.busy) {
        setRegionStatus("Overpass servers are busy right now — wait ~30 s and try again, " +
          "or zoom in to shrink the query.", "err");
      } else {
        setRegionStatus("Failed: " + (err && err.message ? err.message : err), "err");
      }
    } finally {
      btn.disabled = false;
      setBusy(false);
    }
  });

  el("clearRegions").addEventListener("click", () => {
    state.regionsGeoJSON = null;
    state.regionLabels = [];
    state.showRegionLabels = false;
    el("regionLabels").checked = false;
    applyStyle();
    scheduleLabels();
    setRegionStatus("");
  });

  // ---------------------------------------------------------------- export
  el("exportBtn").addEventListener("click", async () => {
    const btn = el("exportBtn");
    btn.disabled = true;
    const longEdge = parseInt(el("exportSize").value, 10);
    const statusEl = el("exportStatus");
    setBusy(true, "Preparing export…");
    statusEl.textContent = "";
    statusEl.className = "status";
    try {
      // make sure overlay labels reflect the current view before export
      renderLabels();
      const result = await OSMMap.exportPNG({
        previewMap: map,
        style: currentStyle(),
        palette: palette(),
        labels: state.currentLabels,
        show: { texture: state.texture, vignette: state.vignette, frame: state.frame },
        title: state.title.show ? { text: state.title.text, pos: state.title.pos } : null,
        longEdge,
        filename: (state.title.text ? slug(state.title.text) : "antique-map") + ".png",
        onProgress: (m) => setBusy(true, m)
      });
      statusEl.textContent = "Saved " + result.width + "×" + result.height + " px PNG.";
      statusEl.className = "status ok";
    } catch (err) {
      statusEl.textContent = "Export failed: " + (err && err.message ? err.message : err);
      statusEl.className = "status err";
    } finally {
      btn.disabled = false;
      setBusy(false);
    }
  });

  function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "antique-map";
  }

  // ---------------------------------------------------------------- boot
  buildPaletteUI();

  // Keep the GL canvas, texture and labels sized to the container. MapLibre's
  // own tracking can miss layout-driven resizes (flexbox settling after init),
  // so observe the container directly.
  let texDebounce = null;
  const ro = new ResizeObserver(() => {
    map.resize();
    scheduleLabels();
    clearTimeout(texDebounce);
    texDebounce = setTimeout(buildTexturePreview, 150);
  });
  ro.observe(map.getContainer());

  map.on("load", () => {
    map.resize();
    buildTexturePreview();
    syncOverlays();
    renderLabels();
  });

  // expose for debugging
  window._osm = { map, state };
})();
