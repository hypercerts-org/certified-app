import { Metadata } from "next";
import LandingPage from "@/components/landing/landing-page";
import { FAQ_ITEMS } from "@/components/landing/sections/faq-content";

// ISR: the page embeds three server-resolved network profiles (the
// Explore section); revalidate hourly so they stay fresh without a
// per-request fetch.
export const revalidate = 3600;

export const metadata: Metadata = {
  // absolute: the root layout's "%s — Certified" template would
  // otherwise append a second "— Certified" to a title that already
  // leads with the brand.
  title: {
    absolute: "Certified — One account. Your work. Recognized everywhere.",
  },
  description:
    "Your profile, your work, and your supporters in one account — recognized on every app in the network, independent of any single platform.",
  alternates: {
    canonical: "https://certified.app/welcome",
  },
  openGraph: {
    title: "Certified — One account. Your work. Recognized everywhere.",
    description:
      "Your profile, your work, and your supporters in one account — recognized on every app in the network, independent of any single platform.",
    url: "https://certified.app/welcome",
    siteName: "Certified",
    images: [
      {
        url: "https://certified.app/assets/certs-hero-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Certified — One account. Your work. Recognized everywhere.",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Certified — One account. Your work. Recognized everywhere.",
    description:
      "Your profile, your work, and your supporters in one account — recognized on every app in the network, independent of any single platform.",
    images: ["https://certified.app/assets/certs-hero-1200x630.png"],
  },
};

const softwareAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Certified",
  url: "https://certified.app",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Web",
  description:
    "Certified is where your profile, your work, and your supporters live — one account, built on AT Protocol, recognized across every app in the network. Operated by the Hypercerts Foundation with full data portability and no vendor lock-in.",
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
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function WelcomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LandingPage />
    </>
  );
}
