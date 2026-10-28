/**
 * Content-Security-Policy builder for the two policies `src/proxy.ts`
 * sends on every page response, both carrying the same per-request nonce
 * (TECH-803):
 *
 * - The enforced policy keeps the host allowlist for scripts and adds the
 *   nonce. Browsers ignore `'unsafe-inline'` once a nonce is present, so
 *   inline scripts and inline event handlers only run with the nonce.
 * - The strict policy, sent report-only while it is rolled out, is the
 *   standard nonce-based "strict CSP": only scripts carrying the nonce
 *   run, and `'strict-dynamic'` extends that trust to scripts they load
 *   (Next.js chunks, Vercel Analytics) instead of trusting hosts.
 *   `https:` and `'unsafe-inline'` are fallbacks for browsers without
 *   CSP3 support; browsers that understand nonces ignore both.
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

/** Directives shared by both policies. `frame-src` allowlists the iframe
 *  sources we explicitly support: Vercel's preview comments overlay and
 *  the leaflet embed providers (YouTube + Vimeo). Without them, the
 *  embeds show YouTube's own "This content is blocked" message. */
function sharedDirectives({
  isDev,
  frameAncestors,
}: Omit<CspOptions, "nonce">): string[] {
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

/** The enforced policy: host allowlist plus the nonce. `'unsafe-inline'`
 *  only applies in browsers too old to understand nonces. */
export function buildEnforcedCsp(options: CspOptions): string {
  const scriptSrc = [
    `script-src 'self' 'nonce-${options.nonce}' 'unsafe-inline'`,
    options.isDev ? "'unsafe-eval'" : null,
    "https://va.vercel-scripts.com https://vercel.live",
  ]
    .filter(Boolean)
    .join(" ")
  const [defaultSrc, ...rest] = sharedDirectives(options)
  return [defaultSrc, scriptSrc, ...rest].join("; ")
}

/** The nonce-based strict policy, sent report-only for now. */
export function buildStrictCsp(options: CspOptions): string {
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
