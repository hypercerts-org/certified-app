import type { Metadata } from "next"
import AuthGuard from "@/components/layout/auth-guard"

export const metadata: Metadata = {
  title: "Groups",
  description: "Organizations you're a member of on Certified.",
}

export default function GroupsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthGuard>{children}</AuthGuard>
}
