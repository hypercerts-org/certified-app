"use client"

import { useCallback, useEffect, useState } from "react"
import {
  loadResolvedProfileOutcome,
  type ResolveOutcome,
} from "@/lib/atproto/resolve-did-batch"

/**
 * Compact profile info for rendering an activity card's author byline.
 * Handles are resolved via the batched resolve-did coalescer, which also
 * returns the Bluesky display name and avatar URL in one round-trip.
 */
export interface AuthorInfo {
  did: string
  handle: string
  displayName: string | null
  avatarUrl: string | null
  /** The profile's bio, when the resolver returned one (record pages show
   *  its start in "Who's behind it"). */
  description?: string | null
}

/** Waits before each automatic retry of a failed lookup (a 429, a network
 *  error, a 5xx). A `Retry-After` longer than the step is honoured. */
export const AUTHOR_RETRY_DELAYS_MS = [1_500, 4_000, 10_000] as const
/** A `Retry-After` longer than this isn't waited out with a placeholder:
 *  the lookup shows as failed at once, with its "Try again". */
export const AUTHOR_MAX_RETRY_WAIT_MS = 20_000

/** The message `error` carries once a lookup has failed for good. */
export const AUTHOR_LOAD_ERROR = "Couldn't load this account."

/** A DID-only byline: what a caller that doesn't look at `failed` still
 *  gets once the lookup has failed, or when the identity doesn't resolve. */
function didOnly(did: string): AuthorInfo {
  return { did, handle: did, displayName: null, avatarUrl: null, description: null }
}

function toInfo(did: string, outcome: ResolveOutcome): AuthorInfo {
  if (outcome.status !== "ok") return didOnly(did)
  const data = outcome.profile
  return {
    did,
    handle: data.handle || did,
    displayName: data.displayName ?? null,
    avatarUrl: data.avatar ?? null,
    description: data.description ?? null,
  }
}

interface AuthorState {
  info: AuthorInfo | null
  isLoading: boolean
  failed: boolean
}

/**
 * Resolve one author DID through the shared coalescer, which batches all
 * authors needed in a render pass into a single request and dedupes and
 * caches across every byline.
 *
 * A failed lookup is not "an account without a name": it is unknown. The
 * hook retries it a few times with backoff (honouring the server's
 * `Retry-After`) while `isLoading` stays true, so the byline keeps its
 * neutral placeholder. If it still fails, `failed` is true and `retry()`
 * tries again; `info` then holds a DID-only fallback for callers that
 * don't look at `failed`. An identity the server says doesn't resolve is
 * a fact, not a failure: `info` is the DID-only fallback, `failed` false.
 */
export function useAuthorInfo(did: string | null): {
  info: AuthorInfo | null
  isLoading: boolean
  /** "Couldn't load this account." once the lookup has failed for good. */
  error: string | null
  /** The lookup failed (after its retries): nothing is known about the
   *  account, so show that, not a placeholder name. */
  failed: boolean
  /** Look the account up again (after `failed`). */
  retry: () => void
} {
  const [state, setState] = useState<AuthorState>({
    info: null,
    isLoading: !!did,
    failed: false,
  })
  // Bumped by `retry()`; part of the effect's key.
  const [attempt, setAttempt] = useState(0)

  // Reset to the initializer state during render when the DID changes
  // (React's adjust-state-during-render pattern), so the effect only
  // contains the fetch lifecycle.
  const [prevDid, setPrevDid] = useState(did)
  if (prevDid !== did) {
    setPrevDid(did)
    setState({ info: null, isLoading: !!did, failed: false })
  }

  useEffect(() => {
    if (!did) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const run = (n: number) => {
      // Every lookup after the first replaces a cached failure; so does
      // the first one after "Try again".
      loadResolvedProfileOutcome(did, { retry: n > 0 || attempt > 0 }).then(
        (outcome) => {
          if (cancelled) return
          if (outcome.status !== "failed") {
            setState({ info: toInfo(did, outcome), isLoading: false, failed: false })
            return
          }
          const step = AUTHOR_RETRY_DELAYS_MS[n]
          const wait = Math.max(step ?? 0, outcome.retryAfterMs ?? 0)
          if (step !== undefined && wait <= AUTHOR_MAX_RETRY_WAIT_MS) {
            timer = setTimeout(() => run(n + 1), wait)
            return
          }
          setState({ info: didOnly(did), isLoading: false, failed: true })
        },
      )
    }
    run(0)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [did, attempt])

  const retry = useCallback(() => {
    setState((s) => ({ ...s, isLoading: true, failed: false }))
    setAttempt((a) => a + 1)
  }, [])

  return {
    info: state.info,
    isLoading: state.isLoading,
    error: state.failed ? AUTHOR_LOAD_ERROR : null,
    failed: state.failed,
    retry,
  }
}
