import { Metadata } from "next";
import HomeClient from "@/components/landing/home-client";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your Certified profile and account overview.",
};

export default function Home() {
  return <HomeClient />;
}
