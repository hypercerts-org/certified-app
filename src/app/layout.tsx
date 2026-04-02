import type { Metadata } from "next";
import { Inter, Noto_Serif, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/auth-context";
import { NavbarProvider } from "@/lib/navbar-context";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { Providers } from "@/lib/providers";
import AppShell from "@/components/layout/app-shell";
import { OrgProvider } from "@/lib/organizations/org-context";
import FeedbackModal from "@/components/ui/feedback-modal";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-headline",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif-alt",
});

export const metadata: Metadata = {
  title: "Certified",
  description: "Your identity, everywhere.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${notoSerif.variable} ${instrumentSerif.variable} min-h-screen flex flex-col`}>
        <Providers>
          <AuthProvider>
            <OrgProvider>
              <NavbarProvider>
                <Navbar />
                <main className="flex-1">
                  <AppShell>{children}</AppShell>
                </main>
                <Footer />
                <FeedbackModal />
              </NavbarProvider>
            </OrgProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
