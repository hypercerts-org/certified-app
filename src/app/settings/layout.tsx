import type { Metadata } from "next"
import AuthGuard from "@/components/layout/auth-guard"

export const metadata: Metadata = {
  title: "Settings",
  description: "Account settings on Certified.",
}

// AuthGuard is a client component; a server layout can render it as
// a child to apply route-segment auth gating without forcing the
// whole segment off the server-side metadata path.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>
}
