import type { Metadata } from "next"
import { Suspense } from "react"
import Workspace from "@/components/workspace/workspace"

export const metadata: Metadata = {
  title: "Workspace",
  description:
    "Compare navigation structures for stepping between the network, actors, and per-lexicon listings.",
}

export default function WorkspacePage() {
  return (
    <div className="workspace-page">
      {/* Suspense boundary required by Next 16 because <Workspace>
          reads useSearchParams() at the top level. Without it,
          static prerender of /workspace bails. */}
      <Suspense fallback={null}>
        <Workspace />
      </Suspense>
    </div>
  )
}
