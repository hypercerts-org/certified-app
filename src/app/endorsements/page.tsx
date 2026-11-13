import { redirect } from "next/navigation"

/**
 * `/endorsements` is retired: endorsements are managed in one place,
 * Records → Endorsements. Old links and bookmarks land there, on the same
 * tab (`?tab=received` → `/records?kind=endorsements&tab=received`; Records
 * reads the same `tab` values: given, received, lists).
 *
 * Signed out, Records sends the visitor to /welcome like any other signed-in
 * page; signing in from /welcome lands on /home (post-signin treats it as a
 * fresh entry), so the deep link isn't kept through sign-in.
 */
export default async function EndorsementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<never> {
  const { tab } = await searchParams
  const params = new URLSearchParams({ kind: "endorsements" })
  const value = Array.isArray(tab) ? tab[0] : tab
  if (value) params.set("tab", value)
  redirect(`/records?${params.toString()}`)
}
