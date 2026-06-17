/**
 * Client-side relevance ranking over an already-fetched candidate set.
 *
 * Why this exists: the magic-indexer returns activity/project/actor
 * matches in keyset (≈ recency) order, NOT relevance order — there is
 * no server `_score`. So a query whose best match the indexer happens
 * to place 9th by recency would otherwise be buried. This module
 * re-ranks the small fetched set (fetch wide, show narrow) by lexical
 * relevance with a few small, capped boosts.
 *
 * Scope & honesty:
 *   - This re-orders results the indexer ALREADY returned. It cannot
 *     surface a record the indexer never returned (e.g. records on
 *     external PDSes that aren't ingested — see magic-indexer#224).
 *   - Phase 1 has NO typo tolerance ("Simocacy" ≠ "Simocracy"); fuzzy
 *     matching needs the indexer. The functions here are pure, exact
 *     (after diacritic folding), and unit-tested.
 *   - When the indexer eventually returns a relevance score, pass it as
 *     `serverScore` and it replaces the lexical core verbatim.
 *
 * Cross-entity interleaving: `lexicalRelevance` is computed against a
 * weighted PRIMARY field (name/title) plus a lower-weighted SECONDARY
 * field (description/workScope). Because the primary field carries the
 * bulk of the signal regardless of entity kind, scores from people /
 * certs / projects are comparable enough to interleave by score.
 */

/** Below this query length we trust the server's order rather than
 *  re-ranking — single-char queries make prefix/overlap fire on almost
 *  everything, so boosts would decide the order. */
export const MIN_QUERY_LEN = 2

/** Hard cap on the SUM of additive boosts. Boosts break ties WITHIN a
 *  lexical tier; they must never let a weak lexical match jump a strong
 *  one. The gaps between lexical tiers are ~0.1–0.25, so 0.15 keeps
 *  boosts sub-tier. */
export const MAX_TOTAL_BOOST = 0.15

/** Suggested per-signal caps for callers assembling `boosts`. The total
 *  is clamped to {@link MAX_TOTAL_BOOST} regardless, but keeping each
 *  input small keeps any single signal from dominating. */
export const BOOST_CAP = {
  /** Authored by the viewer ("your" stuff). Tiebreaker only. */
  owner: 0.05,
  /** Positive quality-label tier. Certs only (only certs carry
   *  per-record labels client-side). */
  quality: 0.1,
} as const

export interface RankBoosts {
  owner?: number
  quality?: number
}

export interface RankInput {
  /** Highest-weight matchable text: a person's displayName + handle, or
   *  a cert/project title. */
  primary: string
  /** Lower-weight text: shortDescription + workScope, profile bio, etc. */
  secondary?: string
  /** Small additive boosts; the SUM is clamped to MAX_TOTAL_BOOST. */
  boosts?: RankBoosts
  /** If the indexer ever returns a 0..1 relevance score, set it here and
   *  it replaces the client lexical core. */
  serverScore?: number
}

/**
 * Fold diacritics and lowercase so "Bioacústico" matches "bioacustico"
 * — the indexer's actor search already does unaccent+ILIKE, so the
 * client must fold too or it would score an accented server hit low.
 * Also collapses internal whitespace and trims.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Split normalized text into word tokens (letters/digits runs). Works
 *  for space-separated scripts; CJK/no-whitespace text yields a single
 *  token, so those queries fall back to exact/prefix/substring only. */
export function tokenize(value: string): string[] {
  const normalized = normalizeText(value)
  if (!normalized) return []
  return normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

/**
 * Lexical relevance in [0, 1]. `max()` of independent signals — a
 * deliberate conservative choice (it doesn't double-count corroborating
 * evidence, but never lets a weaker signal pull a strong one down).
 */
export function lexicalRelevance(
  query: string,
  primary: string,
  secondary?: string,
): number {
  const nq = normalizeText(query)
  if (!nq) return 0
  const nPrimary = normalizeText(primary)
  if (!nPrimary && !secondary) return 0

  const qTokens = tokenize(nq)
  const pTokens = tokenize(nPrimary)

  let score = 0

  // Exact / prefix / substring on the primary field.
  if (nPrimary) {
    if (nPrimary === nq) return 1
    if (nPrimary.startsWith(nq)) score = Math.max(score, 0.85)
    if (nPrimary.includes(nq)) score = Math.max(score, 0.3)
  }

  // Every query token is a word-prefix of some primary token — covers
  // reordered and last-name-only people queries ("clarke" → "Floofy
  // Clarke", "clarke floofy" → "Floofy Clarke"). Strong enough to beat
  // a mere title prefix on another entity.
  if (qTokens.length > 0 && pTokens.length > 0) {
    const allWordPrefix = qTokens.every((qt) =>
      pTokens.some((pt) => pt.startsWith(qt)),
    )
    if (allWordPrefix) score = Math.max(score, 0.9)

    // Token overlap on the primary field (not a long description bag —
    // that would float verbose records above exact-name matches).
    const pSet = new Set(pTokens)
    const overlap = qTokens.filter((qt) => pSet.has(qt)).length / qTokens.length
    score = Math.max(score, overlap * 0.6)
  }

  // Token overlap on the secondary field, weighted lower.
  if (secondary && qTokens.length > 0) {
    const sTokens = new Set(tokenize(secondary))
    if (sTokens.size > 0) {
      const overlap =
        qTokens.filter((qt) => sTokens.has(qt)).length / qTokens.length
      score = Math.max(score, overlap * 0.3)
    }
  }

  return score
}

/** Sum the provided boosts and clamp to {@link MAX_TOTAL_BOOST}. */
export function totalBoost(boosts?: RankBoosts): number {
  if (!boosts) return 0
  const sum = (boosts.owner ?? 0) + (boosts.quality ?? 0)
  return Math.min(Math.max(sum, 0), MAX_TOTAL_BOOST)
}

/**
 * Final score for one candidate: lexical (or server) relevance plus the
 * capped boost. Not clamped at the top — only relative order matters.
 */
export function scoreCandidate(query: string, input: RankInput): number {
  const relevance =
    typeof input.serverScore === "number"
      ? input.serverScore
      : lexicalRelevance(query, input.primary, input.secondary)
  return relevance + totalBoost(input.boosts)
}

/**
 * Stably re-rank `items` by score, descending. For queries shorter than
 * {@link MIN_QUERY_LEN} the original (server) order is preserved. Ties
 * keep server order because the sort is stable (decorate-sort-undecorate
 * on the original index).
 */
export function rankBy<T>(
  query: string,
  items: readonly T[],
  toInput: (item: T) => RankInput,
): T[] {
  if (normalizeText(query).length < MIN_QUERY_LEN) return [...items]
  return items
    .map((item, index) => ({ item, index, score: scoreCandidate(query, toInput(item)) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((d) => d.item)
}

/**
 * First-wins de-dupe by a string key. Safe for records keyed on at-URI
 * (cert and project collections are disjoint, so URIs never collide
 * across kinds).
 */
export function dedupeBy<T>(items: readonly T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const key = keyFn(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/**
 * Merge two people sources by DID with FIELD-LEVEL union (not
 * first-wins): the Bluesky AppView carries `handle` (the certified
 * `NetworkActor` has none), while the certified source carries richer
 * profile fields. Keeping both means the handle still contributes to
 * relevance and the row can render a subtitle.
 *
 * `primary` is the source whose non-empty fields win on conflict
 * (default: pass the certified actors first if you want their display
 * metadata to win). Order of the returned list follows `primary`, then
 * any `secondary`-only DIDs appended in their original order.
 */
export function mergePeopleByDid<T extends { did: string }>(
  primary: readonly T[],
  secondary: readonly T[],
): T[] {
  const byDid = new Map<string, T>()
  const order: string[] = []
  const add = (actor: T) => {
    const existing = byDid.get(actor.did)
    if (!existing) {
      byDid.set(actor.did, { ...actor })
      order.push(actor.did)
      return
    }
    // Field-level union: fill any empty field on the existing record
    // from this one. Existing (earlier source) wins on conflict.
    const merged = { ...actor, ...existing } as T
    for (const key of Object.keys(actor) as (keyof T)[]) {
      const cur = existing[key]
      if (cur === undefined || cur === null || cur === "") {
        merged[key] = actor[key]
      }
    }
    byDid.set(actor.did, merged)
  }
  for (const a of primary) add(a)
  for (const a of secondary) add(a)
  return order.map((did) => byDid.get(did)!)
}
