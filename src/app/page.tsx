import { Metadata } from "next";
import HomeClient from "@/components/landing/home-client";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your Certified profile and account overview.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://certified.app/" },
};

export default function Home() {
  return <HomeClient />;
}
