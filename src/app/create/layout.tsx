import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "New activity",
  description: "Create an activity record on Certified.",
}

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children
}
