/**
 * Content-Security-Policy builder for the policy `src/proxy.ts` sends on
 * every page response with a per-request nonce (TECH-803).
 *
 * It is the standard nonce-based "strict CSP": only scripts carrying the
 * nonce run, and `'strict-dynamic'` extends that trust to scripts they
 * load (Next.js chunks, Vercel Analytics) instead of trusting hosts.
 * `https:` and `'unsafe-inline'` are fallbacks for browsers without CSP3
 * support; browsers that understand nonces ignore both. Violations are
 * reported to `CSP_REPORT_PATH`.
 *
 * Next.js reads the nonce from the request's `content-security-policy`
 * header and stamps it on its own scripts. On Vercel, response CSP
 * headers also reach the renderer as request headers and take precedence,
 * so every CSP a page response carries must contain the same nonce; that
 * is why the CSP is not set in `next.config.ts` headers.
 *
 * Dev addendum: Next.js + React in dev mode use `eval()` for HMR /
 * source-map / debug callstacks, and the Next dev server's HMR WebSocket
 * runs on `ws://`. Without `'unsafe-eval'` and `ws:` in dev, client-side
 * React never hydrates.
 */

/** Same-origin endpoint that receives violation reports. */
export const CSP_REPORT_PATH = "/api/csp-report"

/** Reporting API endpoint name, referenced by `report-to`. */
export const CSP_REPORT_GROUP = "csp-endpoint"

/** `frame-ancestors` for the route: only the public `/embed/*` surface
 *  (the contributor-board share iframe) may be framed by other sites. */
export function frameAncestorsFor(pathname: string): string {
  return pathname === "/embed" || pathname.startsWith("/embed/") ? "*" : "'none'"
}

interface CspOptions {
  nonce: string
  isDev: boolean
  frameAncestors: string
}

/** The policy. `frame-src` allowlists the iframe sources we explicitly
 *  support: Vercel's preview comments overlay and the leaflet embed
 *  providers (YouTube + Vimeo). Without them, the embeds show YouTube's
 *  own "This content is blocked" message. */
export function buildCsp({ nonce, isDev, frameAncestors }: CspOptions): string {
  return [
    "default-src 'self'",
    isDev
      ? `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https: 'unsafe-inline'`
      : `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    "object-src 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https:",
    isDev ? "connect-src 'self' https: ws: wss:" : "connect-src 'self' https:",
    "frame-src 'self' https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join("; ")
}

/** Value for the `Reporting-Endpoints` response header. */
export function reportingEndpointsHeader(): string {
  return `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`
}

/** A fresh per-request nonce: 128 random bits, base64. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}
