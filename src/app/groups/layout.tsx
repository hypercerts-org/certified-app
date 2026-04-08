import AuthGuard from "@/components/layout/auth-guard"

export default function GroupsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthGuard>{children}</AuthGuard>
}
