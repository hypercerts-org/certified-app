import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Apps",
  description:
    "Apps built on the AT Protocol — sign in with your Certified identity to get started.",
  openGraph: {
    title: "Apps — Certified",
    description:
      "Apps built on the AT Protocol — sign in with your Certified identity to get started.",
    siteName: "Certified",
    locale: "en_US",
    type: "website",
    url: "/apps",
    images: [
      {
        url: "/assets/certs-hero-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Apps built on the AT Protocol",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@hypercerts",
    creator: "@hypercerts",
    title: "Apps — Certified",
    description:
      "Apps built on the AT Protocol — sign in with your Certified identity to get started.",
    images: ["/assets/certs-hero-1200x630.png"],
  },
}

export default function AppsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
