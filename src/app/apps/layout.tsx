import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Apps",
  description:
    "Apps built on the AT Protocol — sign in with your Certified identity to get started.",
}

export default function AppsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
