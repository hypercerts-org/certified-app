import type { Metadata } from "next"
import Workspace from "@/components/workspace/workspace"

export const metadata: Metadata = {
  title: "Workspace — Certified",
  description:
    "Compare navigation structures for stepping between the network, actors, and per-lexicon listings.",
}

export default function WorkspacePage() {
  return (
    <div className="workspace-page">
      <Workspace />
    </div>
  )
}
