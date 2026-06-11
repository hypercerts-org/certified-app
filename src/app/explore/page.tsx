import type { Metadata } from "next"
import { Suspense } from "react"
import Explore from "@/components/explore-page/explore"

export const metadata: Metadata = {
  title: "Explore — Certified",
  description:
    "Browse users, projects, and activities across the Certified network.",
  openGraph: {
    title: "Explore Certified",
    description:
      "Browse users, projects, and activities across the Certified network.",
    siteName: "Certified",
    locale: "en_US",
    type: "website",
    url: "/explore",
    images: [
      {
        url: "/assets/certs-hero-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Explore the Certified network",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@hypercerts",
    creator: "@hypercerts",
    title: "Explore Certified",
    description:
      "Browse users, projects, and activities across the Certified network.",
    images: ["/assets/certs-hero-1200x630.png"],
  },
}

/**
 * Opt this route out of static prerendering.
 *
 * The page's entire UX is keyed off `useSearchParams()` (kind / filter /
 * sub / sort / view / degree…), and clicks on the sidebar are
 * implemented by calling `router.replace(pathname?queryString)`. With
 * static prerender enabled, Next 16's App Router treats subsequent
 * `router.replace` calls against the same pathname as cache hits and
 * silently canonicalises the new URL back to the prerendered entry's
 * URL — so the URL never actually changes, `useSearchParams` never
 * re-fires, and the filter clicks look broken on the deployed build
 * while working fine in `next dev` (which never prerenders). Verified
 * on redesign.certified.app: `r.toString()` produces the right query
 * string, `router.replace` is called with it, then `history.replaceState`
 * is invoked with the OLD URL. Forcing the route dynamic disables that
 * static-segment cache so the replace lands intact.
 */
export const dynamic = "force-dynamic"

export default function ExplorePage() {
  return (
    <div className="explore-page">
      {/* Suspense boundary still required by Next 16 because <Explore>
          reads useSearchParams() at the top level. Without it,
          even dynamic rendering bails per
          https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout */}
      <Suspense fallback={null}>
        <Explore />
      </Suspense>
    </div>
  )
}
