/**
 * Normalizes Content-Security-Policy violation reports (TECH-803).
 *
 * Browsers send two formats:
 * - `report-uri`: `application/csp-report`, `{ "csp-report": { … } }`
 * - `report-to` (Reporting API): `application/reports+json`, an array of
 *   `{ type: "csp-violation", body: { … } }`
 *
 * URLs keep origin + path only: the OAuth callback page carries a
 * one-time `code` and `state` in its query string.
 */

export interface CspViolation {
  documentUrl: string | null
  directive: string | null
  blockedUrl: string | null
  sourceFile: string | null
  line: number | null
  sample: string | null
  disposition: string | null
}

export function parseCspReports(body: unknown): CspViolation[] {
  if (Array.isArray(body)) {
    return body
      .filter(
        (r): r is { type: string; body: Record<string, unknown> } =>
          isRecord(r) && r.type === "csp-violation" && isRecord(r.body),
      )
      .map((r) =>
        violation({
          documentUrl: r.body.documentURL,
          directive: r.body.effectiveDirective,
          blockedUrl: r.body.blockedURL,
          sourceFile: r.body.sourceFile,
          line: r.body.lineNumber,
          sample: r.body.sample,
          disposition: r.body.disposition,
        }),
      )
  }
  if (isRecord(body) && isRecord(body["csp-report"])) {
    const r = body["csp-report"]
    return [
      violation({
        documentUrl: r["document-uri"],
        directive: r["effective-directive"] ?? r["violated-directive"],
        blockedUrl: r["blocked-uri"],
        sourceFile: r["source-file"],
        line: r["line-number"],
        sample: r["script-sample"],
        disposition: r.disposition,
      }),
    ]
  }
  return []
}

function violation(fields: Record<keyof CspViolation, unknown>): CspViolation {
  return {
    documentUrl: safeUrl(fields.documentUrl),
    directive: text(fields.directive, 100),
    blockedUrl: safeUrl(fields.blockedUrl),
    sourceFile: safeUrl(fields.sourceFile),
    line: typeof fields.line === "number" ? fields.line : null,
    sample: text(fields.sample, 80),
    disposition: text(fields.disposition, 20),
  }
}

/** Keep origin + path only. Non-URL values ("inline", "eval") pass as-is. */
function safeUrl(value: unknown): string | null {
  const s = text(value, 500)
  if (!s) return null
  try {
    const url = new URL(s)
    return `${url.origin}${url.pathname}`
  } catch {
    return s.split(/[?#]/)[0]
  }
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
