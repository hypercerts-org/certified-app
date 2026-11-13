import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import {
  Bricolage_Grotesque,
  DM_Mono,
  Doto,
  Geist,
  Geist_Mono,
  Google_Sans_Flex,
  Hanken_Grotesk,
  IBM_Plex_Mono,
  Instrument_Serif,
  Inter,
  Inter_Tight,
  Newsreader,
  Noto_Serif,
  Schibsted_Grotesk,
} from "next/font/google";
import { LOOK_INIT_SCRIPT } from "@/lib/look/looks";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/auth-context";
import { NavbarProvider } from "@/lib/navbar-context";
import { ViewTransitionProvider } from "@/lib/view-transitions";
import Navbar from "@/components/layout/navbar";
import DesktopTopBar from "@/components/layout/desktop-top-bar";
import { Providers } from "@/lib/providers";
import AppShell from "@/components/layout/app-shell";
import { OrgProvider } from "@/lib/groups/org-context";
import { OnboardingProvider } from "@/lib/onboarding/onboarding-context";
import OnboardingModal from "@/components/onboarding/onboarding-modal";
import { TourProvider } from "@/lib/tour/tour-context";
import ProductTour from "@/components/tour/product-tour";
import FeedbackModal from "@/components/ui/feedback-modal";
import { FeedbackProvider } from "@/lib/feedback-context";
import BottomNav from "@/components/layout/bottom-nav";
import PwaInstallGuard from "@/components/layout/pwa-install-guard";
import { ToastProvider } from "@/components/ui/toast";
import { Analytics } from "@vercel/analytics/next";

// Inter loads as the variable font: one file covers every weight. The
// design system uses 400 / 500 / 600 only (DESIGN.md §3).
// The face variables sit on <html>, so tokens.css can name the UI and
// display faces on :root (--font-inter, --font-headline) and a style
// (looks.css) can swap them there.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter-face",
  display: "swap",
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  // 300 is the landing-page display weight (hero + section headlines);
  // 400 / 600 / 700 are the app heading weights (h1 + display 700,
  // h2-h4 + EmptyState titles 600). Without 600 loaded, `font-semibold`
  // on the serif silently rendered the 700 face.
  weight: ["300", "400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-noto-serif",
  display: "swap",
});

// The experimental styles' faces (Settings → Appearance → Style;
// looks.css). Not preloaded: a browser downloads a face only when the
// chosen style (or the picker's preview of it) uses it. (next/font needs
// literal options, so each is written out.)
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif", display: "swap", preload: false });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap", preload: false });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap", preload: false });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap", preload: false });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap", preload: false });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap", preload: false });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap", preload: false });
const doto = Doto({ subsets: ["latin"], variable: "--font-doto", display: "swap", preload: false });
// Next has no fallback metrics for Google Sans Flex yet.
const sansFlex = Google_Sans_Flex({ subsets: ["latin"], axes: ["ROND"], variable: "--font-sans-flex", display: "swap", preload: false, adjustFontFallback: false });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], axes: ["wdth", "opsz"], variable: "--font-bricolage", display: "swap", preload: false });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono", display: "swap", preload: false });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap", preload: false });

const fontVariables = [
  inter, notoSerif, instrumentSerif, interTight, newsreader, plexMono, hanken,
  geist, geistMono, doto, sansFlex, bricolage, dmMono, schibsted,
].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: {
    default: "Certified",
    template: "%s — Certified",
  },
  description: "Your identity, everywhere.",
  metadataBase: new URL("https://certified.app"),
  openGraph: {
    title: "Certified",
    description: "Your identity, everywhere.",
    siteName: "Certified",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/assets/certs-hero-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Certified — One account. Your work. Recognized everywhere.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@hypercerts",
    creator: "@hypercerts",
    images: ["/assets/certs-hero-1200x630.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Certified",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f9" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
  viewportFit: "cover",
};

const groupJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Hypercerts Foundation",
  legalName: "Hypercerts Foundation",
  url: "https://hypercerts.org",
  logo: {
    "@type": "ImageObject",
    url: "https://certified.app/brand/brandmark/certified_brandmark_black_512.png",
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
    "Your profile, your work, and your supporters in one account — recognized on every app in the network. No passwords, no lock-in.",
  publisher: {
    "@type": "Organization",
    name: "Hypercerts Foundation",
    url: "https://hypercerts.org",
  },
  inLanguage: "en",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request CSP nonce from src/proxy.ts (TECH-803). Reading request
  // headers renders every route dynamically, which nonces require: a
  // statically generated page has no request to take a nonce from.
  // Next.js stamps the nonce on its own scripts; next-themes needs it
  // passed in for its inline anti-flash script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Applies the style chosen in Settings → Appearance before first
            paint (data-look on <html>), so it never flashes the default. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: LOOK_INIT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(groupJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Providers nonce={nonce}>
          {/* App-wide toast region. Mounted high in the tree so any
              client component below can call useToast(); ToastProvider
              renders its own portal-backed Toaster. */}
          <ToastProvider>
          <AuthProvider>
            <OrgProvider>
              <OnboardingProvider>
              <TourProvider>
              <NavbarProvider>
                <FeedbackProvider>
                <ViewTransitionProvider>
                <a href="#main-content" className="skip-nav">Skip to main content</a>
                <Navbar />
                {/* Suspense is required because DesktopTopBar reads
                    useSearchParams() to highlight the active profile tab.
                    Without a boundary, statically-rendered pages (e.g.
                    /dsa, /terms, /privacy) deopt and fail the build with
                    missing-suspense-with-csr-bailout. */}
                <Suspense fallback={<div className="desktop-top-bar desktop-top-bar--placeholder" aria-hidden />}>
                  <DesktopTopBar />
                </Suspense>
                {/* <main id="main-content"> and, after it, the site
                    footer (the contentinfo landmark). */}
                <AppShell>{children}</AppShell>
                <BottomNav />
                <PwaInstallGuard />
                <FeedbackModal />
                <OnboardingModal />
                <ProductTour />
                </ViewTransitionProvider>
                </FeedbackProvider>
              </NavbarProvider>
              </TourProvider>
              </OnboardingProvider>
            </OrgProvider>
          </AuthProvider>
          </ToastProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
