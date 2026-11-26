import type { Metadata } from "next";
import { Inter, Noto_Serif } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

import "./globals.css";

// The Certified theme's faces: Inter for text, Noto Serif for headings.
// next/font downloads them at build time and serves them from this site, so
// no request goes to Google. globals.css points the theme's font variables at
// them.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--font-noto-serif",
  display: "swap",
});

const DEFAULT_DESCRIPTION =
  "Your profile, your work, and your supporters in one portable AT Protocol account — recognized across the Hypercerts network.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE.url],
  },
};

// Root layout: theme, design system and providers only. Site chrome lives
// in the (site) route group.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-hc-theme="certified"
      suppressHydrationWarning
      className={`${inter.variable} ${notoSerif.variable}`}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap prevents dark-mode flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
