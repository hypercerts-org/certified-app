import { redirect } from "next/navigation"

/**
 * `/workspace` was a prototype for comparing navigation structures. The
 * signed-in person's records live at `/records`, so old links land there.
 * The prototype itself still renders at `/dev/preview/workspace`.
 */
export default function WorkspacePage(): never {
  redirect("/records")
}
