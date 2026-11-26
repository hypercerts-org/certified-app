import type { Metadata } from "next";
import { Inter, Noto_Serif } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
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

export const metadata: Metadata = {
  title: { default: "Certified", template: "%s | Certified" },
  description: "Organizations, projects and activities on the Hypercerts protocol.",
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
