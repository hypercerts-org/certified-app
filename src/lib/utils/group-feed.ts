import type { HomeFeedActor, HomeFeedEvent } from "@/hooks/use-home-feed"

/** A consecutive burst of current endorsement awards by one actor. */
export interface EndorsementGroupItem {
  type: "endorsementGroup"
  key: string
  actor: string
  actorProfile: HomeFeedActor
  createdAt: string | null
  /** Most-recent first, preserving hydrated service summaries. */
  subjects: HomeFeedActor[]
}

export type FeedItem =
  | { type: "single"; event: HomeFeedEvent }
  | EndorsementGroupItem

export function groupConsecutiveEndorsements(
  events: readonly HomeFeedEvent[],
): FeedItem[] {
  const output: FeedItem[] = []
  for (const event of events) {
    if (event.kind !== "endorsement.award") {
      output.push({ type: "single", event })
      continue
    }
    const last = output.at(-1)
    if (last?.type === "endorsementGroup" && last.actor === event.actor) {
      last.subjects.push(event.subject)
      continue
    }
    if (
      last?.type === "single" &&
      last.event.kind === "endorsement.award" &&
      last.event.actor === event.actor
    ) {
      output[output.length - 1] = {
        type: "endorsementGroup",
        key: last.event.uri,
        actor: last.event.actor,
        actorProfile: last.event.actorProfile,
        createdAt: last.event.createdAt,
        subjects: [last.event.subject, event.subject],
      }
      continue
    }
    output.push({ type: "single", event })
  }
  return output
}
