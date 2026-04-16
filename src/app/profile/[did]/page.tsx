import { Metadata } from "next";
import ProfileClient from "@/components/profile/profile-client";

export const metadata: Metadata = {
  title: "Profile",
  description: "Certified profile.",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <ProfileClient />;
}
