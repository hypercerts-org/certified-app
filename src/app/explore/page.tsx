import type { Metadata } from "next"
import { Suspense } from "react"
import Explore from "@/components/explore-page/explore"

export const metadata: Metadata = {
  title: "Explore — Certified",
  description:
    "Browse users, projects, and certs across the Certified network.",
}

export default function ExplorePage() {
  return (
    <div className="explore-page">
      {/* Suspense boundary required by Next 16 because <Explore>
          reads useSearchParams() at the top level. Without it,
          static prerender of /explore bails per
          https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout */}
      <Suspense fallback={null}>
        <Explore />
      </Suspense>
    </div>
  )
}
