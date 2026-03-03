import { Metadata } from "next";
import HomeClient from "@/components/landing/home-client";

export const metadata: Metadata = {
  title: "Certified — One account, any app",
  description: "Create your Certified identity and use one account across partner apps. No passwords, no lock-in.",
};

export default function Home() {
  return <HomeClient />;
}
