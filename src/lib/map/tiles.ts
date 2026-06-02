/**
 * Tile providers for the `<Map />` component.
 *
 * Base layer: Esri World Imagery — high-resolution satellite /
 * aerial. Composited on top: Esri World Boundaries and Places — a
 * transparent reference overlay that adds country / region / city
 * labels and political boundaries so the satellite image reads as a
 * navigable map rather than raw pixels.
 *
 * No API key required for typical web-app use; Esri's terms require
 * attribution which is rendered in the Leaflet control corner.
 *
 * Tile URL template: `{z}/{y}/{x}` — Esri's REST endpoint orders `y`
 * before `x`, the opposite of XYZ. Leaflet's `TileLayer` honors
 * whichever placeholder order the URL uses.
 */

export interface TileConfig {
  url: string
  attribution: string
}

const ESRI_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

const ESRI_WORLD_IMAGERY_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

const ESRI_WORLD_BOUNDARIES_AND_PLACES_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"

/** Esri World Imagery looks the same in light + dark mode (it's a
 *  satellite raster, not a styled basemap), so the resolved theme is
 *  ignored. Kept as a parameter so the signature stays compatible
 *  with the previous Stadia / Carto themed configs. */
export function getTileConfig(
  _resolvedTheme: "light" | "dark" | undefined,
): TileConfig {
  return {
    url: ESRI_WORLD_IMAGERY_URL,
    attribution: ESRI_WORLD_IMAGERY_ATTRIBUTION,
  }
}

/** Reference overlay — transparent tiles with country / region /
 *  city labels and political boundaries. Stacked above the Imagery
 *  base layer so place names and borders are legible against the
 *  satellite imagery. Same Esri credits already in the base layer's
 *  attribution, so no separate attribution string is needed. */
export function getOverlayTileConfig(): TileConfig {
  return {
    url: ESRI_WORLD_BOUNDARIES_AND_PLACES_URL,
    attribution: "",
  }
}
