import { Metadata } from "next"
import LandingPage from "@/components/landing/landing-page"

export const metadata: Metadata = {
  title: "Certified — Show your work, earn the trust to back it up",
  description:
    "Mint verifiable certs, get endorsed by people who know your work, organize your impact into projects. Built on AT Protocol — your records live on your repo, not ours.",
  alternates: {
    canonical: "https://certified.app/welcome",
  },
  openGraph: {
    title: "Certified — Show your work, earn the trust to back it up",
    description:
      "A portable atproto profile for the certs you mint, the endorsements you collect, and the projects you ship. No lock-in.",
    url: "https://certified.app/welcome",
    siteName: "Certified",
    images: [
      {
        url: "https://certified.app/assets/certified-hero-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Certified — Show your work, earn the trust to back it up",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Certified — Show your work, earn the trust to back it up",
    description:
      "A portable atproto profile for the certs you mint, the endorsements you collect, and the projects you ship.",
    images: ["https://certified.app/assets/certified-hero-1200x630.png"],
  },
}

const softwareAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Certified",
  url: "https://certified.app",
  applicationCategory: "SocialNetworkingApplication",
  operatingSystem: "Web",
  description:
    "Certified is an atproto-native reputation platform operated by the Hypercerts Foundation. Mint verifiable certs, get endorsed, organize work into projects — with full data portability.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  creator: {
    "@type": "Organization",
    name: "Hypercerts Foundation",
    url: "https://hypercerts.org",
  },
  isAccessibleForFree: true,
}

export default function WelcomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareAppJsonLd),
        }}
      />
      <LandingPage />
    </>
  )
}
