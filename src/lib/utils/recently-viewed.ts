"use client"

/**
 * Lightweight localStorage-backed "recently viewed" cache.
 *
 * Keyed by kind ("user" | "project" | "cert"). Each entry is the
 * at:// URI (or DID for actors) — the consumer resolves the rest
 * via the existing per-kind fetchers when rendering.
 *
 * Bounded to 30 entries per kind; oldest-out on overflow. New entries
 * push their URI to the front and dedupe previous occurrences.
 */

export type RecentlyViewedKind = "user" | "project" | "cert"

const STORAGE_KEY = "recently-viewed"
const MAX_PER_KIND = 30

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

interface RecentlyViewedShape {
  user: string[]
  project: string[]
  cert: string[]
}

function readAll(): RecentlyViewedShape {
  if (!isBrowser()) return { user: [], project: [], cert: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { user: [], project: [], cert: [] }
    const parsed = JSON.parse(raw) as Partial<RecentlyViewedShape>
    return {
      user: Array.isArray(parsed.user) ? parsed.user.filter(isString) : [],
      project: Array.isArray(parsed.project)
        ? parsed.project.filter(isString)
        : [],
      cert: Array.isArray(parsed.cert) ? parsed.cert.filter(isString) : [],
    }
  } catch {
    return { user: [], project: [], cert: [] }
  }
}

function writeAll(value: RecentlyViewedShape): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* quota / private mode — silently no-op */
  }
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0
}

export function trackRecentlyViewed(
  kind: RecentlyViewedKind,
  id: string,
): void {
  if (!id) return
  const all = readAll()
  const existing = all[kind].filter((v) => v !== id)
  all[kind] = [id, ...existing].slice(0, MAX_PER_KIND)
  writeAll(all)
}

export function getRecentlyViewed(kind: RecentlyViewedKind): string[] {
  return readAll()[kind]
}

/**
 * Drop one or more IDs from a kind's recently-viewed list. Used by the
 * explore page when a recorded URI / DID returns 404 from the PDS — we
 * prune dead entries so they don't keep appearing in the filter and
 * triggering futile lookups.
 */
export function removeRecentlyViewed(
  kind: RecentlyViewedKind,
  ids: string[],
): void {
  if (!ids || ids.length === 0) return
  const all = readAll()
  const drop = new Set(ids)
  all[kind] = all[kind].filter((v) => !drop.has(v))
  writeAll(all)
}
