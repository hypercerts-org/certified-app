import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Endorsements",
  description: "Endorsements you've received and given on Certified.",
}

// No AuthGuard here: anonymous visitors render a public sign-in prompt
// (see EndorsementsPage) instead of being redirected to /welcome. The
// page itself gates its personal, owner-scoped content on the session.
export default function EndorsementsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
