import type { Metadata } from "next"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Endorsements",
  description: "Endorsements you've received and given on Certified.",
}

// No AuthGuard here: anonymous visitors render a public sign-in prompt
// (see EndorsementsPage) instead of being redirected to /welcome. The
// page itself gates its personal, owner-scoped content on the session.
//
// The page is a client component that reads useSearchParams() at the top
// level. With AuthGuard gone it enters the static prerender path and would
// fail the Next 16 CSR-bailout check, so force the route dynamic and provide
// a Suspense boundary here (same pattern as /explore) — there is nothing
// static to prerender for this viewer-personalised view anyway.
export const dynamic = "force-dynamic"

export default function EndorsementsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <Suspense fallback={null}>{children}</Suspense>
}
