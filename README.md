# Antique Map Maker (OSM)

Create vintage-style city & region maps from OpenStreetMap data and export them
as high-resolution PNGs — in the spirit of 18th-century hand-coloured maps:
pastel districts with coloured outlines, faint roads, serif place names, and an
aged-paper finish.

![style reference: antique coloured regions, serif labels, faint roads]

## Features

- **Keyless OSM basemap** via [OpenFreeMap](https://openfreemap.org) vector
  tiles (OpenMapTiles schema). No API keys, no sign-up.
- **Antique styling**: parchment background, muted water, subtle land-use tints,
  dotted administrative boundaries, deliberately faint roads, paper texture,
  vignette and a decorative frame.
- **Coloured districts / "kingdoms"**: fetch real administrative areas for the
  current view from the OSM **Overpass API** and tint each one a different
  pastel colour with a dotted outline — the signature look of the reference map.
- **Serif place labels only** (no POI icons/markers), drawn in the period
  *IM Fell English* typeface so they also render crisply into the export.
- **Palettes**: Antique, Sepia, Pastel kingdoms, Old moss.
- **Optional map title** and automatic attribution line.
- **High-resolution PNG export** up to 8000 px on the long edge.

## Run it

It's a static site — no build step. Open it through a tiny local web server
(recommended, so the browser allows all network requests cleanly):

```bash
cd "/Users/mariusmika/Documents/Persönlich/OSM-MapPNG-Creator"
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

> You can also just double-click `index.html` to open it via `file://`; the map
> and export work, and Overpass/Nominatim usually work too, but a local server
> is the most reliable.

## How to use

1. **Search** for a city/region (or pan & zoom the map) to frame your area.
2. Pick a **palette** and toggle the **layers** you want (roads, water,
   boundaries, place names, texture, vignette, frame).
3. For the coloured-regions look, click **Load & colour regions** (leave the
   selector on *Auto*). Their names are shown automatically — untick *Label
   these regions* to hide them.
4. Optionally add a **title**.
5. Choose an **export size** and click **Export high-res PNG**.

### Admin levels (rough guide)

OSM `admin_level` varies by country, so prefer **Auto**: it picks a primary
level for the current zoom and fills any gaps with a finer level — e.g. it shows
whole *municipalities* (Gemeinden) across a district while filling a
*kreisfreie Stadt* like Karlsruhe (which has no level‑8) with its level‑10
Stadtteile. You can still force a single level:

| Level | Typically |
|------:|-----------|
| 4 | states / provinces / Bundesländer |
| 6 | counties / districts / Landkreise **and** kreisfreie Städte |
| 7 | associations (Ämter / Verwaltungsgemeinschaften) |
| 8 | municipalities / Gemeinden |
| 9 | boroughs (only some cities) |
| 10 | city districts / Stadtteile / Ortsteile |

Notes:
- **Municipality names** (e.g. *Walzbachtal*) usually exist only on the boundary
  relation, not as a map point — so they appear via *region labels*, i.e. after
  **Load & colour regions**, not from the plain place layer.
- German **city districts are level 10**, not 9 — Auto handles this for you.
- If a single level returns nothing, that level probably isn't used there; try
  Auto or an adjacent level.

## Notes & limits

- **Data sources**: map tiles © OpenFreeMap; map data ©
  [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
  (ODbL). Geocoding by Nominatim. The required attribution is baked into every
  exported PNG — please keep it.
- Overpass and Nominatim are **free, shared, rate-limited** services. Don't
  hammer them; the app queries only when you click.
- Very large areas at low admin levels can be slow or hit Overpass timeouts.
- Export renders an off-screen map at an elevated pixel ratio; 6000–8000 px can
  take several seconds and a lot of memory.

## Project layout

```
index.html        app shell + UI
css/style.css      UI + preview-overlay styling
js/palettes.js     colour palettes (incl. region colour cycles)
js/texture.js      procedural aged-paper texture
js/style.js        MapLibre style builder (the antique look)
js/labels.js       serif place-name renderer (overlay + export)
js/regions.js      Overpass fetch → coloured admin polygons
js/exporter.js     high-res PNG compositing + download
js/app.js          wiring / state / UI
```

## Tech

Plain HTML/CSS/JS (no bundler). [MapLibre GL JS](https://maplibre.org),
[osmtogeojson](https://github.com/tyrasd/osmtogeojson), Google Fonts
(IM Fell English, EB Garamond).
