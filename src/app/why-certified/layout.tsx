import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Why Certified | Certified",
  description:
    "One account across partner apps — your profile and records travel with you.",
  openGraph: {
    title: "Why Certified | Certified",
    description:
      "One account across partner apps — your profile and records travel with you.",
    siteName: "Certified",
  },
};

export default function WhyCertifiedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
