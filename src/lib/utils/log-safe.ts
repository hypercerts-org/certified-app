/**
 * Server-side logging helpers that strip secrets before they hit Vercel logs.
 *
 * Originally lived inside the xrpc route; promoted to a shared module so other
 * server routes (auth callback, session, group routes, indexer, etc.) can use
 * the same redaction surface.
 *
 * Design:
 *   redactSecrets(s)  : returns `s` with known secret shapes replaced. Wrapped
 *                        in try/catch so a pathological regex input falls back
 *                        to "<redaction-failed>" instead of crashing the
 *                        error-handler call site.
 *   logSafe(prefix, err, extra)
 *                      : `console.error(prefix, { name, message, ...extra })`
 *                        with `err.message` redacted. Deliberately DROPS
 *                        `err.cause` and `err.stack` because the atproto SDK
 *                        attaches the upstream Request (with DPoP proofs +
 *                        Bearer tokens) on `.cause` and stack traces include
 *                        the same Request via util.inspect.
 */

/**
 * Strip secrets out of strings before they hit logs. Targets things we've
 * actually seen leak from atproto SDK error messages: JWTs (DPoP proofs and
 * bearer tokens both match), `Authorization`/`DPoP`/`Cookie`/`Set-Cookie`
 * header lines that show up in serialized Request inspections, OAuth token
 * grants (form-encoded and JSON-shape), callback `code`/`state` params, JWK
 * private key material, and email addresses.
 *
 * Wrapped in try/catch so a pathological regex input can't crash the error
 * handler. Failsafe is "log a placeholder," never "log raw."
 */
export function redactSecrets(s: string): string {
  try {
    return s
      // JWTs — DPoP proofs, bearer tokens, ID tokens. Base64-permissive; benign
      // false positives on any "eyJ…" base64-JSON are acceptable (over-redaction).
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+=*/g, "<jwt>")
      // Header lines as serialized by util.inspect / Request stringification.
      // Excludes `"` and newlines so JSON-shape `{"Cookie":"...","Foo":"..."}`
      // payloads don't have the redaction bleed across into adjacent keys.
      // Comma is allowed inside the value so multi-value Cookie lines and
      // `Set-Cookie: …; Expires=Wed, 21 Oct …` are fully consumed.
      .replace(/(Authorization|DPoP|Cookie|Set-Cookie):[^"\r\n]*/gi, "$1: <redacted>")
      // Form-encoded OAuth token grants. Use \w + extra punctuation rather
      // than enumerating A-Z / a-z / 0-9 / _ explicitly — Sonar's S5869
      // misfires on the longer class.
      .replace(/(access_token|refresh_token|id_token)=[\w.~+/-]+=*/gi, "$1=<redacted>")
      // JSON-shape OAuth token grants — atproto SDK sometimes serializes these
      // through JSON.stringify when an error message includes a response body.
      // Escape-tolerant value match.
      .replace(
        /"(access_token|refresh_token|id_token)"\s*:\s*"(?:[^"\\]|\\.)*"/gi,
        '"$1":"<redacted>"'
      )
      // OAuth callback query params — `code` and `state` can land in error
      // messages if a callback URL is included in a serialized request.
      .replace(/([?&](?:code|state))=[^&\s"]+/gi, "$1=<redacted>")
      // JWK private material — atproto uses ES256/P-256 so `"d"` is realistic;
      // `"k"` covers any symmetric variant; RSA CRT params are belt-and-suspenders.
      // Longest alternatives first to avoid backtracking on `"dp"` etc.
      // Over-redaction risk: any unrelated single-letter JSON key (`{"d":"…"}`,
      // `{"k":"…"}`) gets caught too. Accepted — over-redacting log payloads
      // is the safer failure direction.
      .replace(
        /"(dp|dq|qi|d|k|p|q)"\s*:\s*"(?:[^"\\]|\\.)*"/g,
        '"$1":"<redacted>"'
      )
      // Email last — earlier patterns already replaced their secrets with
      // placeholders that contain no '@'.
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
  } catch {
    return "<redaction-failed>"
  }
}

/**
 * Log an unknown error safely. Drops `err.cause` and `err.stack` to avoid
 * leaking attached upstream Request objects (DPoP / Bearer tokens). Never
 * throws.
 */
export function logSafe(
  prefix: string,
  err: unknown,
  extra?: Record<string, unknown>
): void {
  const e = err as { name?: string; message?: string }
  const message = typeof e?.message === "string" ? redactSecrets(e.message) : undefined
  const payload: Record<string, unknown> = { name: e?.name }
  if (message && message !== "<redaction-failed>") payload.message = message
  if (extra) Object.assign(payload, extra)
  console.error(prefix, payload)
}
