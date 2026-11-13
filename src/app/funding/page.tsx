import type { Metadata } from "next"
import FundingPage from "@/components/network/funding-page"

export const metadata: Metadata = {
  title: "Funding",
}

export default function Page() {
  return <FundingPage />
}
