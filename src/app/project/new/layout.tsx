import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "New project",
  description: "Create a project on Certified.",
}

export default function NewProjectLayout({ children }: { children: React.ReactNode }) {
  return children
}
