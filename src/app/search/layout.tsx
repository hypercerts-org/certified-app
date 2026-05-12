import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Explore",
  description: "Find people on Certified — search by handle or display name.",
  alternates: { canonical: "https://certified.app/search" },
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children
}
