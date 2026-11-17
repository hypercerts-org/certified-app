import { toUserErrorMessage } from "@/lib/utils/api"

// The upstream answers we've seen reach these forms as their whole message:
// an XRPC error name ("NotFound", "InvalidToken", "AuthRequired") or the
// BFF's "Not authenticated". Neither means anything to a person.
const ERROR_NAME = /^[A-Z][a-z]+(?:[A-Z][a-z]*)+$/
const NOT_SIGNED_IN = /^(not authenticated|unauthori[sz]ed|auth(entication)? required)\.?$/i
// The library's own generic fallbacks ("Failed to update email"): the
// form's fallback says the same thing in a full sentence.
const GENERIC_FAILURE = /^failed to\b/i

/**
 * A failure in the account forms (email, password) as a sentence a person
 * can act on (DESIGN §10.2). Runs the message through `toUserErrorMessage`
 * after dropping the upstream error names it doesn't know about; a missing
 * session reads as one. `status` is the response's when the caller has it;
 * without one the message is treated as a 4xx: a sentence written for
 * people passes through, anything technical becomes `fallback`. Pass the
 * fallback without a closing period (as `toUserErrorMessage` expects); the
 * result always ends as a sentence.
 */
export function accountErrorMessage(
  message: string | undefined,
  fallback: string,
  status = 400,
): string {
  const text = message?.trim()
  const usable =
    text && !ERROR_NAME.test(text) && !GENERIC_FAILURE.test(text) ? text : undefined
  const out =
    text && NOT_SIGNED_IN.test(text)
      ? toUserErrorMessage(401, text, fallback)
      : toUserErrorMessage(status, usable, fallback)
  return /[.!?]$/.test(out) ? out : `${out}.`
}
