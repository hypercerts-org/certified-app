import type { Metadata } from "next"
import Visualization from "@/components/visualization/visualization"
import PageTitle from "@/components/layout/page-title"

export const metadata: Metadata = {
  title: "Endorsement network",
  description:
    "An interactive graph of the connections created through endorsements across the Certified network.",
}

export default function EndorsementGraphPage() {
  return (
    <>
      <PageTitle title="Endorsement network" />
      <Visualization />
    </>
  )
}
