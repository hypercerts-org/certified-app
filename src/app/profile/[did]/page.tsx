import { Metadata } from "next";
import HomeClient from "@/components/landing/home-client";

export const metadata: Metadata = {
  title: "Profile",
  description: "Certified profile and account overview.",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <HomeClient />;
}
