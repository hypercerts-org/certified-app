import type { Metadata } from "next"
import MapPage from "@/components/network/map-page"

export const metadata: Metadata = {
  title: "Map",
}

export default function Page() {
  return <MapPage />
}
