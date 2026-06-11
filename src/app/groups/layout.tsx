import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Groups",
  description: "Organizations you're a member of on Certified.",
}

// No AuthGuard here: anonymous visitors render a public sign-in prompt
// (see GroupsPage) instead of being redirected to /welcome. The page
// itself gates its personal, owner-scoped membership list on the session.
export default function GroupsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
