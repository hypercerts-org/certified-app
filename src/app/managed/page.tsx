import { Suspense } from "react"
import Managed from "@/components/managed/managed"

export default function ManagedPage() {
  return (
    // Suspense boundary required by Next 16 because <Managed> reads
    // useSearchParams() at the top level (the ?focus= filter). Without
    // it, static prerender of /managed bails.
    <Suspense fallback={null}>
      <Managed />
    </Suspense>
  )
}
