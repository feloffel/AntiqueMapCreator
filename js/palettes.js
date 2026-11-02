/* Colour palettes for the antique map styles.
 * Each palette defines the parchment base, water, roads, land-use tints,
 * boundaries, label ink, and a cycle of pastel region colours (fill + outline)
 * used for the "coloured districts/kingdoms" overlay. */
window.OSMMap = window.OSMMap || {};

OSMMap.PALETTES = {
  antique: {
    label: "Antique",
    swatches: ["#efe3c6", "#e4b7b2", "#cdd6a1", "#b9c6c1"],
    paper: "#f1e6ca",
    paperEdge: "#e7d7b0",
    water: "#aebfbb",
    waterLine: "#8ba199",
    landcover: "#d7dcae",     // woods / grass
    landuseResidential: "#ecdcbd",
    landuseCommercial: "#e6d0b2",
    landuseIndustrial: "#dccdb4",
    park: "#cdd6a0",
    boundary: "#8a6246",
    road: "#7a5d3a",
    roadMajor: "#6b4f30",
    ink: "#5a4631",
    inkLight: "#7c6447",
    regions: [
      { fill: "#e4b7b2", line: "#b5706b" },
      { fill: "#cdd6a1", line: "#8a9a55" },
      { fill: "#ecdca6", line: "#c3a94e" },
      { fill: "#c3d2c7", line: "#7f9a86" },
      { fill: "#d9c3d0", line: "#a06e8c" },
      { fill: "#bfccd6", line: "#6e8aa0" },
      { fill: "#e7ccae", line: "#b5855b" },
      { fill: "#cfc6b0", line: "#938458" }
    ]
  },

  sepia: {
    label: "Sepia",
    swatches: ["#ecdcbf", "#d9c3a0", "#c6a877", "#b08e5f"],
    paper: "#efe0c2",
    paperEdge: "#e3cfa6",
    water: "#cdbd9a",
    waterLine: "#a88f63",
    landcover: "#ddcba6",
    landuseResidential: "#e7d4b0",
    landuseCommercial: "#e0cba3",
    landuseIndustrial: "#d8c49c",
    park: "#d3c196",
    boundary: "#7c5a3f",
    road: "#775a35",
    roadMajor: "#5f4729",
    ink: "#54402a",
    inkLight: "#7a5e3d",
    regions: [
      { fill: "#e3d0ac", line: "#a9884f" },
      { fill: "#d6bf95", line: "#8f6f3d" },
      { fill: "#e7d8b4", line: "#b89a5e" },
      { fill: "#cdb588", line: "#876b38" },
      { fill: "#dcc9a0", line: "#9c7d47" },
      { fill: "#cab07f", line: "#7e6033" }
    ]
  },

  pastel: {
    label: "Pastel kingdoms",
    swatches: ["#f3ecdc", "#f0c5c0", "#bfe0c8", "#c6d4ef"],
    paper: "#f5eedd",
    paperEdge: "#ece0c4",
    water: "#bcd3dd",
    waterLine: "#9bbccb",
    landcover: "#d9e6c2",
    landuseResidential: "#f0e6d2",
    landuseCommercial: "#eadcc6",
    landuseIndustrial: "#e2d8c8",
    park: "#cfe3b8",
    boundary: "#9a7b63",
    road: "#9a8468",
    roadMajor: "#7d664a",
    ink: "#5f4b38",
    inkLight: "#86705a",
    regions: [
      { fill: "#f0c5c0", line: "#cf8a84" },
      { fill: "#bfe0c8", line: "#7fb492" },
      { fill: "#f3e3ad", line: "#ccb061" },
      { fill: "#c6d4ef", line: "#8098c9" },
      { fill: "#e3c8e6", line: "#b283b7" },
      { fill: "#bfe4e2", line: "#7fbab6" },
      { fill: "#f2d4b4", line: "#cf9e6e" },
      { fill: "#d9d2bd", line: "#a99f7f" }
    ]
  },

  moss: {
    label: "Old moss",
    swatches: ["#e9e3c8", "#cdd3a0", "#aeb98c", "#9fb0a2"],
    paper: "#eae3c6",
    paperEdge: "#ddd3ab",
    water: "#a9bcb3",
    waterLine: "#86a093",
    landcover: "#cdd49e",
    landuseResidential: "#e3dcb9",
    landuseCommercial: "#dcd3ac",
    landuseIndustrial: "#d2cda6",
    park: "#c2cd8f",
    boundary: "#6f6a3f",
    road: "#6c6440",
    roadMajor: "#55502f",
    ink: "#4c4a2c",
    inkLight: "#6f6a44",
    regions: [
      { fill: "#cdd49e", line: "#8f9a55" },
      { fill: "#b9c9a0", line: "#7d9064" },
      { fill: "#dcd6a8", line: "#aa9c57" },
      { fill: "#a9bcae", line: "#6f8c7a" },
      { fill: "#c9c89a", line: "#8d8a52" },
      { fill: "#bcc8b0", line: "#7f9480" }
    ]
  }
};

/* Guard: fix any stray non-hex typos by validating; fall back to a neutral tint. */
(function sanitize() {
  const isHex = (c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
  Object.values(OSMMap.PALETTES).forEach((p) => {
    for (const k of Object.keys(p)) {
      if (typeof p[k] === "string" && p[k].startsWith("#") && !isHex(p[k])) p[k] = "#d8cdb2";
    }
    (p.regions || []).forEach((r) => {
      if (!isHex(r.fill)) r.fill = "#d8cdb2";
      if (!isHex(r.line)) r.line = "#9c8a66";
    });
  });
})();

OSMMap.DEFAULT_PALETTE = "antique";
