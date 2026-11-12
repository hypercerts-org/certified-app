import type { Metadata } from "next"
import FeedPage from "@/components/feed/feed-page"

export const metadata: Metadata = {
  title: "Feed",
}

export default function Page() {
  return <FeedPage />
}
