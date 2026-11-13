import { redirect } from "next/navigation"

/**
 * `/workspace` lands on the Workspace's Overview (`/home`). (It was once a
 * prototype for comparing navigation structures; that prototype still
 * renders at `/dev/preview/workspace`.)
 */
export default function WorkspacePage(): never {
  redirect("/home")
}
