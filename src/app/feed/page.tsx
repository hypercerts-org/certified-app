import { Metadata } from "next";
import HomeClient from "@/components/landing/home-client";

export const metadata: Metadata = {
  title: "Feed",
  description: "Activity feed on Certified — for-you and following.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://certified.app/feed" },
};

export default function FeedPage() {
  return <HomeClient />;
}
