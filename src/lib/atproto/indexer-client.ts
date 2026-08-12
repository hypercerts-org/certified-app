/**
 * Shared client-side plumbing for the same-origin indexer proxy — the
 * proxy URL, the {@link postIndexer} POST helper, and {@link chunkArray}.
 *
 * This is a leaf module: it imports nothing from the other indexer
 * modules. The domain modules (`indexer-funding`, `indexer-closure`,
 * `indexer-counts`, `indexer-collections`) and the `indexer` barrel all
 * import from here, which keeps the module graph acyclic — no module
 * ever holds a live-but-uninitialized binding during evaluation. The
 * barrel re-exports everything in this file, so call sites keep
 * importing from `@/lib/atproto/indexer` unchanged.
 */

export const INDEXER_PROXY_URL = "/api/indexer"

/**
 * Structured result of a single indexer-proxy POST. Carries the HTTP
 * status, the parsed GraphQL `data` payload, and the GraphQL `errors`
 * array side by side so every caller can apply its own policy without
 * re-parsing the envelope.
 */
export interface IndexerPostResult<T> {
  /** HTTP-level success (`response.ok`). */
  ok: boolean
  /** HTTP status code of the proxy response. */
  status: number
  /** Parsed GraphQL `data` field; null when missing or unparseable. */
  data: T | null
  /** GraphQL `errors` array; empty when the response carried none. */
  errors: { message: string; extensions?: { code?: string } }[]
}

/**
 * POST one GraphQL operation to the same-origin indexer proxy
 * ({@link INDEXER_PROXY_URL}) and return the envelope as a structured
 * {@link IndexerPostResult}.
 *
 * Contract:
 *
 *   - **Never throws on HTTP `!ok` or GraphQL errors.** Call sites
 *     disagree on policy — some throw with the status in the message,
 *     some warn and fail soft to an empty page, one branches on
 *     `errors[0].extensions?.code` — so the helper reports and the
 *     caller decides. GraphQL also returns partial data alongside
 *     errors (non-nullable nulls propagate up), which a thrown
 *     exception couldn't represent.
 *   - **Guarded body parse.** A malformed or empty body (e.g. an HTML
 *     502 page from the proxy) yields `data: null, errors: []`; the
 *     status code alone carries the signal.
 *   - **Aborts still reject.** An `AbortError` (from `fetch` or from
 *     the body read) is rethrown so callers' cancellation flows keep
 *     working. Other network-level rejections propagate as-is.
 */
export async function postIndexer<T>(
  operationName: string,
  variables: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
): Promise<IndexerPostResult<T>> {
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationName, variables }),
    signal: opts?.signal,
  })

  let data: T | null = null
  const errors: IndexerPostResult<T>["errors"] = []
  try {
    const json = (await res.json()) as {
      data?: T | null
      errors?:
        | ({ message?: unknown; extensions?: { code?: unknown } | null } | null)[]
        | null
    } | null
    data = json?.data ?? null
    if (Array.isArray(json?.errors)) {
      for (const err of json.errors) {
        if (typeof err?.message !== "string") continue
        const code = err.extensions?.code
        errors.push(
          typeof code === "string"
            ? { message: err.message, extensions: { code } }
            : { message: err.message },
        )
      }
    }
  } catch (err) {
    // An abort during the body read must keep rejecting like an
    // aborted fetch would.
    if (
      (err instanceof DOMException || err instanceof Error) &&
      err.name === "AbortError"
    ) {
      throw err
    }
    // Anything else is a malformed / empty body — fall through with
    // data null and errors [].
  }

  return { ok: res.ok, status: res.status, data, errors }
}

/**
 * Split `arr` into chunks of at most `size` items. Shared by the
 * by-URIs batch fetchers in `indexer` and `indexer-collections` (the
 * proxy caps `uri: { in: [...] }` lists at 50 values per request).
 */
export function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) return [arr.slice()]
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}
