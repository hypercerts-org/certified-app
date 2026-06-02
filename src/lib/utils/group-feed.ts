import type { HomeFeedEvent } from "@/hooks/use-home-feed"
import type { FeedActor } from "@/lib/atproto/follower-events"

/**
 * Render-time grouping for the home feed: a run of consecutive
 * `endorsement.award` events by the same actor collapses into one
 * "X endorsed Y and N others" descriptor. Anything else falls
 * through as a single event.
 *
 * Grouping is consecutive-only — any non-endorsement event between
 * two endorsements from the same actor breaks the group, since the
 * feed reads chronologically and a gap means the run wasn't actually
 * a burst.
 */
export interface EndorsementGroupItem {
  type: "endorsementGroup"
  /** Stable React key — uses the first event's URI. */
  key: string
  actor: string
  actorProfile: FeedActor
  /** RFC3339 — the latest event's createdAt (group's headline time). */
  createdAt: string
  /** Most-recent first (matches the descending-sort the feed lands in). */
  subjectDids: string[]
}

export type FeedItem =
  | { type: "single"; event: HomeFeedEvent }
  | EndorsementGroupItem

export function groupConsecutiveEndorsements(
  events: readonly HomeFeedEvent[],
): FeedItem[] {
  const out: FeedItem[] = []
  for (const event of events) {
    if (event.kind !== "endorsement.award") {
      out.push({ type: "single", event })
      continue
    }
    const last = out[out.length - 1]
    if (last?.type === "endorsementGroup" && last.actor === event.actor) {
      last.subjectDids.push(event.subjectDid)
      continue
    }
    if (
      last?.type === "single" &&
      last.event.kind === "endorsement.award" &&
      last.event.actor === event.actor
    ) {
      // Promote the existing single into a fresh group of two.
      out[out.length - 1] = {
        type: "endorsementGroup",
        key: last.event.uri,
        actor: last.event.actor,
        actorProfile: last.event.actorProfile,
        createdAt: last.event.createdAt,
        subjectDids: [last.event.subjectDid, event.subjectDid],
      }
      continue
    }
    out.push({ type: "single", event })
  }
  return out
}
