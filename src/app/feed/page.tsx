import type { Metadata } from "next"
import FeedPageClient from "./feed-page-client"

export const metadata: Metadata = {
  title: "Feed",
  description: "Activity feed on Certified — for-you and following.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://certified.app/feed" },
}

export default function FeedPage() {
  return <FeedPageClient />
}
