import { Suspense } from "react"
import type { Metadata } from "next"
import RecordsPage from "@/components/records/records-page"

export const metadata: Metadata = {
  title: "Records",
}

// RecordsPage reads `?kind=` with useSearchParams, which needs a Suspense
// boundary to render statically.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <RecordsPage />
    </Suspense>
  )
}
