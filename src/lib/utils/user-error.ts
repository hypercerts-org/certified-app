import { toUserErrorMessage } from "./api"

// A message with no space in it is a name, not a sentence: an XRPC error
// name ("NotFound", "InvalidToken", "AuthRequired") or a status word
// ("Forbidden"). It means nothing to a person.
const ONE_WORD = /^\S+$/
// The BFF's "Not authenticated" and its cousins: a missing session.
const NOT_SIGNED_IN = /^(not authenticated|unauthori[sz]ed|auth(entication)? required)\.?$/i
// The libraries' own generic fallbacks ("Failed to update email", and
// Chrome's "Failed to fetch" for a request that never got through): the
// caller's fallback says the same thing in a full sentence.
const GENERIC_FAILURE = /^failed to\b/i
// The other browsers' words for a request that never got through
// (Safari's "Load failed", Firefox's "NetworkError when attempting to
// fetch resource.").
const NETWORK_FAILURE = /^(load failed|networkerror\b|network request failed)/i

/**
 * A failure in a settings form as a sentence a person can act on (DESIGN
 * §10.2). Runs the message through `toUserErrorMessage` after dropping
 * the upstream error names and generic library texts it doesn't know
 * about; a missing session reads as one. `status` is the response's when
 * the caller has it; without one the message is treated as a 4xx: a
 * sentence written for people passes through, anything technical becomes
 * `fallback`. Pass the fallback without a closing period (as
 * `toUserErrorMessage` expects); the result always ends as a sentence.
 */
export function userErrorMessage(
  message: string | undefined,
  fallback: string,
  status = 400,
): string {
  const text = message?.trim()
  const usable =
    text && !ONE_WORD.test(text) && !GENERIC_FAILURE.test(text) && !NETWORK_FAILURE.test(text)
      ? text
      : undefined
  const out =
    text && NOT_SIGNED_IN.test(text)
      ? toUserErrorMessage(401, text, fallback)
      : toUserErrorMessage(status, usable, fallback)
  return /[.!?]$/.test(out) ? out : `${out}.`
}

/**
 * {@link userErrorMessage} for a caught error: reads its message when it
 * is an `Error`, and uses `fallback` for anything else.
 */
export function caughtErrorMessage(err: unknown, fallback: string): string {
  return userErrorMessage(err instanceof Error ? err.message : undefined, fallback)
}
