import { Metadata } from "next";
import LandingPage from "@/components/landing/landing-page";
import HomeClient from "@/components/landing/home-client";
import { FAQ_ITEMS } from "@/components/landing/sections/faq-content";

export const metadata: Metadata = {
  title: "Certified — One account, any app",
  description:
    "Certified is a passwordless identity platform built on AT Protocol, operated by the Hypercerts Foundation. Create a single account that works across partner apps with full data portability and no vendor lock-in.",
  alternates: {
    canonical: "https://certified.app",
  },
  openGraph: {
    title: "Certified — One account, any app",
    description:
      "Create your Certified identity and use one account across partner apps. No passwords, no lock-in.",
    url: "https://certified.app",
    siteName: "Certified",
    images: [
      {
        url: "https://certified.app/assets/certified-hero-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Certified — One account, any app",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Certified — One account, any app",
    description:
      "Create your Certified identity and use one account across partner apps. No passwords, no lock-in.",
    images: ["https://certified.app/assets/certified-hero-1200x630.png"],
  },
};

// JSON-LD for the homepage: SoftwareApplication + FAQPage
const softwareAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Certified",
  url: "https://certified.app",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Web",
  description:
    "Certified is a passwordless identity platform built on AT Protocol, operated by the Hypercerts Foundation. Create a single account that works across partner apps with full data portability and no vendor lock-in.",
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

export default function Home() {
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
      {/* Server-rendered landing page — visible to all crawlers */}
      <div className="landing-ssr">
        <LandingPage />
      </div>
      {/* Client component handles auth state: hides landing & shows dashboard when authenticated */}
      <HomeClient />
    </>
  );
}
