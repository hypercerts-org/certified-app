/**
 * URL normalisation for `pub.leaflet.blocks.iframe`. Embeds are
 * stored verbatim as `url` strings; the renderer relies on the URL
 * already being an embed-form URL (e.g. `youtube.com/embed/ID`)
 * rather than a watch / share URL. This helper does that conversion
 * for the providers we explicitly support.
 *
 * Returns the embed URL plus a sensible default aspect ratio so the
 * editor can persist both at once. Returns null for unsupported or
 * malformed inputs so the caller can show a validation error.
 */

export interface NormalisedEmbed {
  embedUrl: string
  aspectRatio: { width: number; height: number }
  provider: "youtube" | "vimeo" | "other"
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,16}$/
const VIMEO_ID = /^\d{6,12}$/

export function normaliseEmbedUrl(input: string): NormalisedEmbed | null {
  const raw = input.trim()
  if (raw.length === 0) return null

  let url: URL
  try {
    // Allow bare youtu.be / youtube.com URLs without scheme — paste
    // ergonomics. Prepend https:// when the user dropped it.
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    url = new URL(withScheme)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase()

  // ---- YouTube ----
  if (host === "youtube.com" || host === "m.youtube.com") {
    // Standard watch URL — extract `?v=ID`.
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v")
      if (id && YOUTUBE_ID.test(id)) {
        return {
          embedUrl: `https://www.youtube.com/embed/${id}`,
          aspectRatio: { width: 16, height: 9 },
          provider: "youtube",
        }
      }
    }
    // Already an embed URL — accept as-is.
    if (url.pathname.startsWith("/embed/")) {
      const id = url.pathname.split("/")[2]
      if (id && YOUTUBE_ID.test(id)) {
        return {
          embedUrl: `https://www.youtube.com/embed/${id}`,
          aspectRatio: { width: 16, height: 9 },
          provider: "youtube",
        }
      }
    }
    // Shorts: `/shorts/ID` → embed/ID.
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2]
      if (id && YOUTUBE_ID.test(id)) {
        return {
          embedUrl: `https://www.youtube.com/embed/${id}`,
          aspectRatio: { width: 9, height: 16 },
          provider: "youtube",
        }
      }
    }
  }

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0]
    if (id && YOUTUBE_ID.test(id)) {
      return {
        embedUrl: `https://www.youtube.com/embed/${id}`,
        aspectRatio: { width: 16, height: 9 },
        provider: "youtube",
      }
    }
  }

  // ---- Vimeo (light-touch support) ----
  if (host === "vimeo.com") {
    const id = url.pathname.replace(/^\//, "").split("/")[0]
    if (id && VIMEO_ID.test(id)) {
      return {
        embedUrl: `https://player.vimeo.com/video/${id}`,
        aspectRatio: { width: 16, height: 9 },
        provider: "vimeo",
      }
    }
  }
  if (host === "player.vimeo.com" && url.pathname.startsWith("/video/")) {
    const id = url.pathname.split("/")[2]
    if (id && VIMEO_ID.test(id)) {
      return {
        embedUrl: `https://player.vimeo.com/video/${id}`,
        aspectRatio: { width: 16, height: 9 },
        provider: "vimeo",
      }
    }
  }

  return null
}

/** True when the embed URL points at a known-safe provider. The
 *  renderer falls back to a "this embed isn't supported" message
 *  rather than rendering an iframe to an arbitrary origin. */
export function isAllowedEmbedHost(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase()
    return (
      host === "youtube.com" ||
      host === "youtube-nocookie.com" ||
      host === "player.vimeo.com"
    )
  } catch {
    return false
  }
}
