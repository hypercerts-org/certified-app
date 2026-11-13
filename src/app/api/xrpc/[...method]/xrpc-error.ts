import { redactSecrets } from "@/lib/utils/log-safe"

// Helpers for the XRPC proxy route. They live outside `route.ts` because a
// Next.js route module may only export route handlers and config; any other
// export breaks the generated route types (and `tsc` while a dev server runs).

export function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

/** Extract a usable HTTP status + message from an unknown XRPC error. */
export function xrpcError(err: unknown): {
  status: number
  message: string
  code?: string
} {
  if (!err || typeof err !== "object") {
    return { status: 500, message: "Internal server error" }
  }
  const e = err as Record<string, unknown>
  const statusRaw = typeof e.status === "number" ? e.status : e.statusCode
  const statusNum = typeof statusRaw === "number" ? statusRaw : 500
  // Clamp to the valid HTTP range. An upstream status of 0, a negative
  // number, >599, or a non-integer would throw a RangeError when passed
  // straight to NextResponse.json(..., { status }) — surfacing an opaque
  // framework 500 instead of our masked error. Mirrors clampHttpStatus
  // in src/lib/utils/api.ts.
  const status =
    Number.isInteger(statusNum) && statusNum >= 200 && statusNum <= 599
      ? statusNum
      : 500
  const rawMessage = asString(e.message)
  const message = status >= 500 || !rawMessage ? "Internal server error" : redactSecrets(rawMessage)
  // Preserve the atproto error discriminator (`InvalidSwap`,
  // `RecordNotFound`, etc.) so the client can branch on it
  // without re-parsing a localised human-readable string. The
  // @atproto/api `XRPCError` carries it on `.error`.
  const code = asString(e.error) ?? undefined
  // Server-side log so the masked-to-client message can still be diagnosed
  // from Vercel logs. Client never sees the original PDS error body.
  console.error("[xrpc] upstream error", {
    name: asString(e.name),
    status,
    error: code,
    message: rawMessage ? redactSecrets(rawMessage) : undefined,
  })
  return { status, message, code }
}
