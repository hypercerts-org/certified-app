import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Certified", template: "%s | Certified" },
  description: "Organizations, projects and activities on the Hypercerts protocol.",
};

// Root layout shared by the site and the embeds: theme, design system and
// providers only. Site chrome lives in the (site) route group.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-hc-theme="certified">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
