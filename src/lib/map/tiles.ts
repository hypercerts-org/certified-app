/**
 * Tile provider selection for the <Map /> component.
 *
 * Primary: Stadia Maps — Alidade Smooth (light) / Alidade Smooth Dark.
 * Free tier, best-looking raster dark theme available without a
 * commercial license. Stadia allows unauthenticated requests from
 * localhost/127.0.0.1 under its "no-cost development" policy, so dev
 * works with zero config. Production needs a key in
 * NEXT_PUBLIC_STADIA_API_KEY.
 *
 * Fallback: Carto Positron / Dark Matter — free with attribution,
 * no API key required. Used when no Stadia key is set AND we're not
 * on localhost.
 */

export interface TileConfig {
  url: string
  attribution: string
}

const STADIA_ATTRIBUTION =
  '&copy; <a href="https://www.stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> contributors'

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'

/** Is the runtime allowed to hit Stadia without an API key? Stadia
 *  permits unauthenticated access only from localhost for development. */
function isLocalhost(): boolean {
  if (typeof window === "undefined") return false
  const h = window.location.hostname
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]"
}

/** Pick the best available tile source for the resolved theme. Called
 *  during component render so it always matches the current theme + env. */
export function getTileConfig(resolvedTheme: "light" | "dark" | undefined): TileConfig {
  const key = process.env.NEXT_PUBLIC_STADIA_API_KEY
  const canUseStadia = Boolean(key) || isLocalhost()

  if (canUseStadia) {
    const style = resolvedTheme === "dark" ? "alidade_smooth_dark" : "alidade_smooth"
    // `{r}` is expanded by Leaflet to `@2x` on retina displays, empty otherwise.
    const suffix = key ? `?api_key=${encodeURIComponent(key)}` : ""
    return {
      url: `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}{r}.png${suffix}`,
      attribution: STADIA_ATTRIBUTION,
    }
  }

  // Deployed without a Stadia key and off-localhost. Warn once so the
  // missing key is visible in production logs.
  if (typeof window !== "undefined" && !warnedNoKey) {
    warnedNoKey = true
    console.warn(
      "[map] NEXT_PUBLIC_STADIA_API_KEY not set; falling back to Carto tiles. " +
        "Set a Stadia API key for production to get the Alidade Smooth style."
    )
  }

  const cartoStyle = resolvedTheme === "dark" ? "dark_all" : "light_all"
  return {
    url: `https://{s}.basemaps.cartocdn.com/${cartoStyle}/{z}/{x}/{y}{r}.png`,
    attribution: CARTO_ATTRIBUTION,
  }
}

let warnedNoKey = false
