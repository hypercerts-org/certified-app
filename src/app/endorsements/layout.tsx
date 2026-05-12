import type { Metadata } from "next"
import AuthGuard from "@/components/layout/auth-guard"

export const metadata: Metadata = {
  title: "Endorsements",
  description: "Endorsements you've received and given on Certified.",
}

export default function EndorsementsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <AuthGuard>{children}</AuthGuard>
}
