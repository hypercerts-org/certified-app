import type { Metadata } from "next"
import GraphPage from "@/components/network/graph-page"

export const metadata: Metadata = {
  title: "Graph",
  description:
    "An interactive graph of the connections created through endorsements across the Certified network.",
}

export default function Page() {
  return <GraphPage />
}
