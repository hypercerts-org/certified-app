import { redirect } from "next/navigation"

/**
 * `/endorsement-graph` is now Network → Graph (`/graph`); old links land
 * there.
 */
export default function EndorsementGraphPage(): never {
  redirect("/graph")
}
