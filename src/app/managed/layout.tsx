import type { Metadata } from "next"
import AuthGuard from "@/components/layout/auth-guard"

export const metadata: Metadata = {
  title: "Managed",
  description:
    "Everything you're responsible for — yours and your groups' — in one place.",
}

export default function ManagedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthGuard>{children}</AuthGuard>
}
