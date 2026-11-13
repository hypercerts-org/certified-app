import { redirect } from "next/navigation"

/**
 * `/endorsements` is retired: endorsements are managed in one place,
 * Records → Endorsements. Old links and bookmarks land there.
 */
export default function EndorsementsPage(): never {
  redirect("/records?kind=endorsements")
}
