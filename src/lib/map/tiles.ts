/**
 * Tile provider for the `<Map />` component.
 *
 * Esri World Imagery — high-resolution satellite/aerial basemap.
 * No API key required for typical web-app use; attribution per
 * Esri's terms is mandatory and is rendered in the Leaflet control
 * corner via the `attribution` field below.
 *
 * Switched from Stadia / Carto rasters to Esri Imagery so the
 * cert-location maps land on real terrain context (useful for
 * place-based work like Ma Earth's regenerative projects in
 * Niger, where the polygon shape against the dryland mosaic reads
 * more meaningfully than against a flat OSM basemap).
 *
 * Tile URL template: `{z}/{y}/{x}` — note Esri's REST endpoint orders
 * `y` before `x`, the opposite of XYZ. Leaflet's `TileLayer` honors
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
