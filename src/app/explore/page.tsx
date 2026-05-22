import type { Metadata } from "next"
import Explore from "@/components/explore-page/explore"

export const metadata: Metadata = {
  title: "Explore — Certified",
  description:
    "Browse users, projects, and certs across the Certified network.",
}

export default function ExplorePage() {
  return (
    <div className="explore-page">
      <Explore />
    </div>
  )
}
