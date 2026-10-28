/**
 * Content-Security-Policy builder: the single source for both policies
 * the app sends.
 *
 * - The enforced policy (`next.config.ts` headers) still allows
 *   `'unsafe-inline'` scripts. It is unchanged while the strict policy
 *   below runs in report-only mode (TECH-803).
 * - The strict policy (`src/proxy.ts`, per request) is the standard
 *   nonce-based "strict CSP": only scripts carrying this request's nonce
 *   run, and `'strict-dynamic'` extends that trust to scripts they load
 *   (Next.js chunks, Vercel Analytics). `https:` and `'unsafe-inline'`
 *   are fallbacks for browsers without CSP3 support; browsers that
 *   understand nonces / `'strict-dynamic'` ignore both.
 *
 * Next.js reads the nonce from the request's CSP header (enforced or
 * report-only) and stamps it on its own scripts, which is why the proxy
 * sets the policy on the request as well as the response.
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
  isDev: boolean
  frameAncestors: string
}

interface StrictCspOptions extends CspOptions {
  nonce: string
}

/** Directives shared by both policies. `frame-src` allowlists the iframe
 *  sources we explicitly support: Vercel's preview comments overlay and
 *  the leaflet embed providers (YouTube + Vimeo). Without them, the
 *  embeds show YouTube's own "This content is blocked" message. */
function sharedDirectives({ isDev, frameAncestors }: CspOptions): string[] {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https:",
    isDev ? "connect-src 'self' https: ws: wss:" : "connect-src 'self' https:",
    "frame-src 'self' https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
  ]
}

/** The currently enforced policy (host allowlist + `'unsafe-inline'`). */
export function buildEnforcedCsp(options: CspOptions): string {
  const scriptSrc = [
    "script-src 'self' 'unsafe-inline'",
    options.isDev ? "'unsafe-eval'" : null,
    "https://va.vercel-scripts.com https://vercel.live",
  ]
    .filter(Boolean)
    .join(" ")
  const [defaultSrc, ...rest] = sharedDirectives(options)
  return [defaultSrc, scriptSrc, ...rest].join("; ")
}

/** The nonce-based strict policy, sent report-only for now. */
export function buildStrictCsp(options: StrictCspOptions): string {
  const scriptSrc = [
    `script-src 'nonce-${options.nonce}' 'strict-dynamic'`,
    options.isDev ? "'unsafe-eval'" : null,
    "https: 'unsafe-inline'",
  ]
    .filter(Boolean)
    .join(" ")
  const [defaultSrc, ...rest] = sharedDirectives(options)
  return [
    defaultSrc,
    scriptSrc,
    "object-src 'none'",
    ...rest,
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
