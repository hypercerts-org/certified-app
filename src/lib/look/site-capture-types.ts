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

export interface SiteCapture {
  url: string
  screenshots: CapturedImage[]
  logo: CapturedImage | null
  shareImage: CapturedImage | null
  computed: ComputedSample[]
  /** The colours covering most of the screenshots, largest first. */
  visibleColours: { hex: string; share: number }[]
}

export interface SiteCaptureResponse {
  capture?: SiteCapture
  error?: string
}
