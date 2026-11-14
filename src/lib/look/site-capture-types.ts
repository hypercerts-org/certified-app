/**
 * What `/api/looks/site-capture` returns: what the website looks like when
 * rendered (screenshots, logo, share image), the computed styles of its
 * real elements, and the colours that cover most of its screens. Shared by
 * the server (site-capture.ts) and the browser (generate-look.ts), so it
 * holds types only. scripts/site-capture/capture.mjs writes it.
 */

export interface CapturedImage {
  /** What the image shows, said to Claude before it. */
  label: string
  mediaType: "image/jpeg" | "image/png"
  /** Base64, no data: prefix. */
  data: string
}

/** One real element's look, from getComputedStyle in the rendered page. */
export interface ComputedSample {
  /** What it is: "body", "h1", "button", "card", "nav" … */
  role: string
  tag: string
  /** Its first words, so a reader knows which element it was. */
  text: string
  styles: Record<string, string>
}

/** A large image the site lays behind its content (a texture, pattern,
 *  illustration or photo): the whole of it small, for Claude to tell what
 *  it shows (`data`), and a crop for the ID card (`card`). A style can put
 *  the crop under the ID card (custom-look-spec.ts, withSiteImage). */
export interface SiteSurfaceImage extends CapturedImage {
  /** "site-image-1" …, how Claude names it. */
  id: string
  where: string
  /** How much of a screen it covers (1 = a whole screen). */
  covers: number
  /** Its average colour, #RRGGBB. */
  average: string
  /** 0 a calm texture … 1 a busy photograph. */
  busy: number
  /** The ID card's crop, about the card's shape, at the scale the site
   *  shows the image and where it has the most detail, so the card keeps
   *  its grain. `average` and `busy` are this crop's. Older captures have
   *  none: the card then uses `data`. */
  card?: { mediaType: "image/webp" | "image/jpeg"; data: string }
}

export interface SiteCapture {
  url: string
  screenshots: CapturedImage[]
  logo: CapturedImage | null
  shareImage: CapturedImage | null
  computed: ComputedSample[]
  /** The colours covering most of the screenshots, largest first. */
  visibleColours: { hex: string; share: number }[]
  /** Large images behind the site's content, largest first (none from
   *  older captures). */
  surfaceImages?: SiteSurfaceImage[]
}

export interface SiteCaptureResponse {
  capture?: SiteCapture
  error?: string
}
