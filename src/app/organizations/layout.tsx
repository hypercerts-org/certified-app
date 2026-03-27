import AuthGuard from "@/components/layout/auth-guard"

export default function OrganizationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthGuard>{children}</AuthGuard>
}
