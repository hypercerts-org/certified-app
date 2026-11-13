import type { Metadata } from "next"
import Home from "@/components/home/home"

export const metadata: Metadata = {
  title: "Workspace",
}

export default function HomePage() {
  return <Home />
}
