import type { ClaimActivity } from "./activity-types"

/**
 * Guard for org.hypercerts.claim.activity values read straight off a PDS
 * (`com.atproto.repo.getRecord`). ATProto is open: any repo can hold a
 * record whose string-declared fields are objects or arrays, and rendering
 * such a value throws "Objects are not valid as a React child", taking the
 * page down to its error boundary. The indexer path already normalizes
 * (`nodeToActivityRecord`); this closes the same gap for the per-URI PDS
 * fallback in use-activity / use-project-items.
 *
 * The coercion is shallow and preserving, NOT a rebuild: the result seeds
 * the edit route's form via the use-activity cache, so every field other
 * than the string-declared render fields — image blob, contributors,
 * workScope union, facets, unknown extras — must pass through untouched or
 * the next edit-save would silently drop data.
 */
export function coerceClaimActivityValue(value: unknown): ClaimActivity {
  const raw: Record<string, unknown> =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  return {
    ...raw,
    title: typeof raw.title === "string" ? raw.title : "",
    shortDescription:
      typeof raw.shortDescription === "string" ? raw.shortDescription : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    startDate: typeof raw.startDate === "string" ? raw.startDate : undefined,
    endDate: typeof raw.endDate === "string" ? raw.endDate : undefined,
  } as ClaimActivity
}
