import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Why Certified | Certified",
  description:
    "One account that works across trusted impact apps. Your identity and data travel with you.",
  openGraph: {
    title: "Why Certified | Certified",
    description:
      "One account that works across trusted impact apps. Your identity and data travel with you.",
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
