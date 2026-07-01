/**
 * Parser for the bulk-paste-people textarea on the endorsement-list
 * detail. Pure function — no I/O — so it can run synchronously in the
 * preview phase before any handle resolution is kicked off.
 *
 * Accepts four input flavours:
 *   - bare DID (`did:plc:abc...`) → `{ kind: "did" }` passthrough
 *   - handle (`alice.bsky.social` or `@alice.bsky.social`) →
 *     `{ kind: "handle" }`; the caller resolves it via the public
 *     appView
 *   - profile URL — the handle-forward form (`https://<host>/<segment>`)
 *     or the legacy `https://<host>/profile/<segment>` — returns the
 *     segment as either a DID or a handle depending on shape
 *   - actor at-URI (`at://did:plc:.../...` or just `at://did:plc:...`)
 *     → extracts the DID
 *
 * Returns `null` for anything that doesn't look like one of the above
 * — the caller surfaces "Unrecognized" in that case. Loose handle
 * validity (one dot, letters/digits/hyphens) is enough because the
 * real validity gate is whether `resolveHandleToDid` actually returns
 * a DID.
 */
export type SubjectInputKind = "did" | "handle"

export interface ParsedSubjectInput {
  kind: SubjectInputKind
  value: string
}

const DID_RE = /^did:[a-z]+:[A-Za-z0-9._:-]+$/
const AT_URI_RE = /^at:\/\/(did:[a-z]+:[A-Za-z0-9._:-]+)(?:\/.*)?$/
const PROFILE_PATH_RE = /\/profile\/([^/?#]+)/
const HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$/

export function parseSubjectInput(raw: string): ParsedSubjectInput | null {
  const trimmed = raw.trim().replace(/^@/, "")
  if (!trimmed) return null

  if (DID_RE.test(trimmed)) {
    return { kind: "did", value: trimmed }
  }

  const atMatch = trimmed.match(AT_URI_RE)
  if (atMatch) {
    return { kind: "did", value: atMatch[1] }
  }

  const profileMatch = trimmed.match(PROFILE_PATH_RE)
  if (profileMatch) {
    const segment = decodeURIComponent(profileMatch[1])
    if (DID_RE.test(segment)) {
      return { kind: "did", value: segment }
    }
    return { kind: "handle", value: segment }
  }

  // Handle-forward profile URL: the first path segment is the actor.
  const urlMatch = trimmed.match(/^https?:\/\/[^/]+\/([^/?#]+)/)
  if (urlMatch) {
    const segment = decodeURIComponent(urlMatch[1])
    if (DID_RE.test(segment)) {
      return { kind: "did", value: segment }
    }
    if (HANDLE_RE.test(segment)) {
      return { kind: "handle", value: segment }
    }
  }

  if (HANDLE_RE.test(trimmed)) {
    return { kind: "handle", value: trimmed }
  }

  return null
}
