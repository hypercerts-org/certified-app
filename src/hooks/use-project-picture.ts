"use client"

import { useActivity } from "@/hooks/use-activity"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import {
  projectActivityUris,
  projectImage,
  type CollectionValue,
} from "@/lib/atproto/collection"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { parseAtUri } from "@/lib/urls"

/**
 * A project's picture from what is already loaded: its banner, else the
 * photo of the first of its activities (in the project's order) that has
 * one among `known`. `undefined` when the project has no banner and no
 * known activity of it has a photo (the caller may look further).
 */
export function projectPictureFrom(
  value: CollectionValue,
  projectDid: string,
  known: readonly ActivityRecord[] = [],
): string | null | undefined {
  const banner = projectImage(value, "banner")
  if (banner) return resolveActivityImageUrl(banner, projectDid)
  const uris = projectActivityUris(value.items)
  if (uris.length === 0) return null
  const byUri = new Map(known.map((a) => [a.uri, a]))
  for (const uri of uris) {
    const a = byUri.get(uri)
    if (a?.value.image) {
      return resolveActivityImageUrl(a.value.image, parseAtUri(uri)?.did ?? projectDid)
    }
  }
  return undefined
}

/**
 * The one picture rule for a project, wherever it shows (its page, its
 * card on a profile): the banner, else the first activity's photo. Uses
 * the activities the caller already has (`known`); when none of them
 * answers, reads the project's first activity (one cached request), so a
 * card never shows a placeholder where the page shows a photo.
 */
export function useProjectPicture(
  value: CollectionValue,
  projectDid: string,
  known: readonly ActivityRecord[] = [],
): string | null {
  const fromKnown = projectPictureFrom(value, projectDid, known)
  const firstUri = fromKnown === undefined ? projectActivityUris(value.items)[0] : null
  const parsed = firstUri ? parseAtUri(firstUri) : null
  const { activity } = useActivity(parsed?.did ?? null, parsed?.rkey ?? null)
  if (fromKnown !== undefined) return fromKnown
  if (!activity?.value.image || !parsed) return null
  return resolveActivityImageUrl(activity.value.image, parsed.did)
}
