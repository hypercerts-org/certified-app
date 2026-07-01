import type { Metadata } from "next"
import Visualization from "@/components/visualization/visualization"

export const metadata: Metadata = {
  title: "Endorsement network — Certified",
  description:
    "An interactive graph of the connections created through endorsements across the Certified network.",
}

export default function EndorsementGraphPage() {
  return <Visualization />
}
