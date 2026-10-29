/**
 * Size cap for OAuth-client responses that are validated with zod (TECH-804).
 *
 * zod < 4.6.6 (GHSA-mrhx-c7xc-m3w5) collects one issue object per failing
 * array element with no cap, so a large enough array exhausts memory. The
 * @atproto OAuth client still depends on zod 3, which has no fix, and it
 * validates JSON from servers an anonymous visitor chooses: authorization
 * server and protected-resource metadata, did:web / did:plc documents, and
 * the PAR and token responses. None of those reads is size-limited, and
 * starting a sign-in against a self-hosted PDS needs no account.
 *
 * Every such request goes through the client's `fetch` (safeFetch), so the
 * cap lives there. Real documents are a few KB. Authenticated XRPC calls to
 * the user's PDS are exempt: blobs and record listings are legitimately
 * large, and those responses are checked by lexicon validators, not zod.
 * The path alone is not enough, because a hostile authorization server can
 * publish a token or PAR endpoint under `/xrpc/`; those requests carry a
 * DPoP proof but never an Authorization header, session calls always do.
 */

/** Generous for metadata, DID documents and token responses (a few KB). */
export const MAX_OAUTH_RESPONSE_BYTES = 128 * 1024

export class ResponseTooLargeError extends Error {
  constructor(url: string, maxBytes: number) {
    super(`Response from ${new URL(url).origin} exceeds ${maxBytes} bytes`)
    this.name = "ResponseTooLargeError"
  }
}

/** Whether a request's response gets the cap: everything except
 *  authenticated XRPC calls. */
export function isSizeLimited(url: string, headers: Headers): boolean {
  return !(new URL(url).pathname.startsWith("/xrpc/") && headers.has("authorization"))
}

/**
 * Returns `response` with its body limited to `maxBytes`. A larger declared
 * Content-Length fails at once; otherwise the body errors as soon as more
 * than `maxBytes` arrive, whatever the header said, and the upstream body is
 * cancelled. Like atproto's own TransformedResponse, a wrapped body that is
 * dropped unread is not cancelled by GC (the source stream is locked by the
 * pipe); atproto cancels the bodies it doesn't read.
 */
export function limitResponseSize(
  response: Response,
  url: string,
  maxBytes: number = MAX_OAUTH_RESPONSE_BYTES,
): Response {
  const declared = Number(response.headers.get("content-length"))
  if (declared > maxBytes) {
    void response.body?.cancel().catch(() => {})
    throw new ResponseTooLargeError(url, maxBytes)
  }
  if (!response.body) return response

  let received = 0
  const limited = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength
        if (received > maxBytes) throw new ResponseTooLargeError(url, maxBytes)
        controller.enqueue(chunk)
      },
    }),
  )
  const wrapped = new Response(limited, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
  // A constructed Response has an empty url; keep the original for error
  // messages and any redirect checks downstream.
  Object.defineProperty(wrapped, "url", { value: response.url })
  return wrapped
}
