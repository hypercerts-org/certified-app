import { redirect } from "next/navigation"
import { profileUrl } from "@/lib/urls"
import { resolveHandle } from "@/lib/atproto/did"

/**
 * Legacy group-profile page. The actual content (profile hero, admin
 * affordances, "Acting as this group" eyebrow) now lives on
 * /profile/[handle], which already handles both individuals and groups
 * consistently. We keep this route as a server-side redirect for
 * existing bookmarks and account-switcher links generated before the
 * consolidation.
 *
 * Sub-routes (/groups/[groupDid]/edit-profile, /groups/[groupDid]/settings)
 * remain — they're the admin entry points.
 */
export default async function GroupProfileRedirect({
  params,
}: {
  params: Promise<{ groupDid: string }>
}) {
  const { groupDid: rawGroupDid } = await params
  const groupDid = decodeURIComponent(rawGroupDid)

  const handle = await resolveHandle(groupDid)
  // Falling back to /groups (the list page) if the DID doesn't resolve
  // to a handle — strictly an edge case, e.g. a freshly-imported DID
  // whose plc.directory record hasn't propagated yet.
  if (!handle) redirect("/groups")

  redirect(profileUrl(handle))
}
