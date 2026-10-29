import type { Metadata } from "next"

// Absolute: the parent /groups layout sets a plain "Groups" title, so the
// root "%s — Certified" template doesn't reach this segment.
export const metadata: Metadata = {
  title: { absolute: "Import account as group — Certified" },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
