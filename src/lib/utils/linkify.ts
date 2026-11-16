import { safeHttpUrl } from "@/lib/utils/safe-url"

/**
 * Web addresses in plain text people wrote (comments): `https://…`,
 * `http://…` and `www.…`. Punctuation that ends a sentence is left out of
 * the link ("see https://example.org." links without the full stop), and
 * so is a closing bracket the address didn't open. Only http(s) links come
 * out, so a `javascript:` string can never become one.
 */

export type TextPart =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi
const TRAILING = /[.,;:!?*'"’”]+$/

function trimMatch(raw: string): string {
  let s = raw.replace(TRAILING, "")
  // Drop closing brackets the address itself didn't open:
  // "(see https://x.org/a)" keeps "https://x.org/a".
  for (const [open, close] of [["(", ")"], ["[", "]"]] as const) {
    while (s.endsWith(close) && count(s, close) > count(s, open)) {
      s = s.slice(0, -1).replace(TRAILING, "")
    }
  }
  return s
}

function count(s: string, ch: string): number {
  let n = 0
  for (const c of s) if (c === ch) n++
  return n
}

/** The text split into plain runs and links, in order. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    const raw = trimMatch(m[0])
    if (!raw) continue
    const href = safeHttpUrl(/^www\./i.test(raw) ? `https://${raw}` : raw)
    // A bare "www." or an address the URL parser rejects stays text.
    if (!href || /^(?:https?:\/\/|www\.)$/i.test(raw)) continue
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) })
    parts.push({ kind: "link", text: raw, href })
    last = start + raw.length
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) })
  return parts
}

/**
 * A link as shown: without the scheme and `www.`, and cut at `max`
 * characters with an ellipsis. The full address stays in the href.
 */
export function shortLinkText(text: string, max = 48): string {
  const s = text.replace(/^https?:\/\//i, "").replace(/^www\./i, "")
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * Link facets for a run of text, as AT Protocol rich text counts them:
 * UTF-8 byte offsets of each link.
 */
export function linkFacetRanges(text: string): { byteStart: number; byteEnd: number; uri: string }[] {
  const encoder = new TextEncoder()
  const out: { byteStart: number; byteEnd: number; uri: string }[] = []
  let bytes = 0
  for (const part of linkify(text)) {
    const size = encoder.encode(part.text).length
    if (part.kind === "link") out.push({ byteStart: bytes, byteEnd: bytes + size, uri: part.href })
    bytes += size
  }
  return out
}
