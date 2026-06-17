import { redirect } from "next/navigation"

/**
 * The standalone `/groups` listing has been replaced by the profile
 * Groups tab (e.g. `/{handle}?tab=groups`). The page no longer exists as
 * its own surface; retire the URL with a redirect to `/home` so any old
 * link or bookmark lands somewhere sensible instead of 404ing.
 *
 * The sub-routes — `/groups/create`, `/groups/import`, and
 * `/groups/[groupDid]` — are unaffected (they keep the shared layout).
 */
export default function GroupsIndexPage() {
  redirect("/home")
}
