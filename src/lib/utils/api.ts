import { NextResponse } from "next/server"
import { logSafe, redactSecrets } from "./log-safe"

/**
 * Extract a usable HTTP status from an unknown caught error and emit a
 * redacted server-side log. The raw cause is always logged so operators
 * can diagnose. Status and message semantics:
 *
 *   - 4xx upstream  → status is preserved; `err.message` is echoed (after
 *     redaction) when it is a usable string. 4xx errors are usually
 *     validation responses a user can act on (AGENTS.md §17 #7).
 *   - 5xx upstream OR non-numeric / out-of-range status → returned as
 *     500 "Internal server error" so we don't leak upstream specifics.
 *
 * The status is clamped to the valid HTTP range (200..599); anything
 * outside collapses to 500 to avoid emitting non-standard codes that
 * caches/browsers handle weirdly.
 */
export function extractRouteError(
  err: unknown,
  prefix = "[route] upstream error"
): { status: number; message: string } {
  const raw = readRawStatus(err)
  const status = clampHttpStatus(raw)
  logSafe(prefix, err, { status })
  const message =
    status >= 400 && status < 500
      ? messageFor4xx(err, status)
      : genericMessageFor(status)
  return { status, message }
}

function readRawStatus(err: unknown): number {
  if (!err || typeof err !== "object") return 500
  const e = err as Record<string, unknown>
  if (typeof e.status === "number") return e.status
  if (typeof e.statusCode === "number") return e.statusCode
  return 500
}

function clampHttpStatus(s: number): number {
  if (!Number.isInteger(s) || s < 200 || s > 599) return 500
  return s
}

function messageFor4xx(err: unknown, status: number): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    if (typeof e.message === "string" && e.message.trim().length > 0) {
      // redactSecrets from log-safe is a strict superset of the prior
      // local redactor (JWT + Authorization/DPoP/Cookie header lines +
      // OAuth grants + JWK material + email). Strict superset is the
      // safer direction here — over-redacting a 4xx body never leaks.
      return redactSecrets(e.message).trim()
    }
  }
  return genericMessageFor(status)
}

function genericMessageFor(status: number): string {
  if (status === 400) return "Bad request"
  if (status === 401) return "Not authenticated"
  if (status === 403) return "Forbidden"
  if (status === 404) return "Not found"
  if (status === 409) return "Conflict"
  if (status === 429) return "Too many requests"
  return "Internal server error"
}

/**
 * Build a record object by copying only the allowed fields from the
 * raw request body. Prevents mass assignment by rejecting keys that
 * are not in the allowlist.
 */
export function pickAllowedFields(
  body: Record<string, unknown>,
  allowedFields: readonly string[],
  $type: string
): Record<string, unknown> {
  const record: Record<string, unknown> = { $type }
  for (const key of allowedFields) {
    if (key in body && body[key] !== undefined) {
      record[key] = body[key]
    }
  }
  return record
}

type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse }

/**
 * Parse `request.json()` and surface the failure in a uniform way:
 *   - logs the parse error (via logSafe so caught secrets are redacted)
 *   - returns a 400 NextResponse the caller can return directly
 *
 * Without this, every POST route silently does `await request.json()`
 * and falls into the generic catch — a malformed body is indistinguishable
 * from a missing field, which is annoying to diagnose.
 */
export async function parseJsonBody(
  request: Request,
  prefix: string,
): Promise<JsonBodyResult> {
  try {
    const body = await request.json()
    return { ok: true, body }
  } catch (err) {
    logSafe(`${prefix} invalid JSON body`, err)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      ),
    }
  }
}

/**
 * Extract an error message from a failed API response.
 * Attempts to parse JSON and look for an `error` field; falls back to `fallback`.
 */
export async function extractError(
  res: Response,
  fallback: string
): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown }
    return typeof data.error === "string" ? data.error : fallback
  } catch {
    return fallback
  }
}

/**
 * Validate the `{ data: { uri, cid } }` shape that AT Protocol mutation
 * XRPC methods (createRecord / putRecord etc.) return through the
 * AtpAgent. Returns `{ uri, cid }` when both strings are present, or
 * `null` to signal the upstream response was malformed — the caller
 * typically maps that to a 502.
 *
 * The previous pattern, repeated verbatim in four group route handlers,
 * was:
 *
 *     const data = (upstream as unknown as {
 *       data?: { uri?: string; cid?: string }
 *     }).data
 *     const uri = typeof data?.uri === "string" ? data.uri : null
 *     const cid = typeof data?.cid === "string" ? data.cid : null
 *     if (!uri || !cid) return 502
 *
 * This collapses to a single call.
 */
export function extractRecordRef(
  upstream: unknown,
): { uri: string; cid: string } | null {
  const data = (upstream as { data?: { uri?: unknown; cid?: unknown } } | null)
    ?.data
  if (!data) return null
  if (typeof data.uri !== "string" || typeof data.cid !== "string") return null
  return { uri: data.uri, cid: data.cid }
}
