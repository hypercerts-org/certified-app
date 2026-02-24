import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/auth-context";
import { NavbarProvider } from "@/lib/navbar-context";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { Providers } from "@/lib/providers";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
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
      <body className={`${inter.variable} min-h-screen flex flex-col`}>
        <Providers>
          <AuthProvider>
            <NavbarProvider>
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </NavbarProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
