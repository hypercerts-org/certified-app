import type { Metadata, Viewport } from "next";
import { Inter, Noto_Serif, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/auth-context";
import { NavbarProvider } from "@/lib/navbar-context";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { Providers } from "@/lib/providers";
import AppShell from "@/components/layout/app-shell";
import { OrgProvider } from "@/lib/groups/org-context";
import FeedbackModal from "@/components/ui/feedback-modal";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-headline",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif-alt",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Certified",
    template: "%s — Certified",
  },
  description: "Your identity, everywhere.",
  metadataBase: new URL("https://certified.app"),
  openGraph: {
    siteName: "Certified",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/assets/certified-hero-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Certified — One account, any app",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@hypercerts",
    creator: "@hypercerts",
    images: ["/assets/certified-hero-1200x630.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Certified",
  },
};

export const viewport: Viewport = {
  themeColor: "#f9f9f6",
};

const groupJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Hypercerts Foundation",
  legalName: "Hypercerts Foundation",
  url: "https://hypercerts.org",
  logo: {
    "@type": "ImageObject",
    url: "https://certified.app/assets/certified_brandmark_black.png",
    width: 512,
    height: 512,
  },
  description:
    "A Delaware nonstock corporation that develops open infrastructure for the hypercerts ecosystem, operating the Certified identity platform.",
  foundingDate: "2023-02-03",
  address: {
    "@type": "PostalAddress",
    streetAddress: "1209 Orange St.",
    addressLocality: "Wilmington",
    addressRegion: "DE",
    postalCode: "19801",
    addressCountry: "US",
  },
  contactPoint: {
    "@type": "ContactPoint",
    email: "legal@hypercerts.org",
    contactType: "legal",
  },
  sameAs: [
    "https://github.com/hypercerts-org",
    "https://x.com/hypercerts",
    "https://www.linkedin.com/company/hypercerts",
    "https://bsky.app/profile/hypercerts.org",
  ],
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Certified",
  url: "https://certified.app",
  description:
    "Create your Certified identity and use one account across partner apps. No passwords, no lock-in.",
  publisher: {
    "@type": "Organization",
    name: "Hypercerts Foundation",
    url: "https://hypercerts.org",
  },
  inLanguage: "en",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(groupJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className={`${inter.variable} ${notoSerif.variable} ${instrumentSerif.variable} min-h-screen flex flex-col`}>
        <Providers>
          <AuthProvider>
            <OrgProvider>
              <NavbarProvider>
                <a href="#main-content" className="skip-nav">Skip to main content</a>
                <Navbar />
                <main id="main-content" className="flex-1">
                  <AppShell>{children}</AppShell>
                </main>
                <Footer />
                <FeedbackModal />
              </NavbarProvider>
            </OrgProvider>
          </AuthProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
