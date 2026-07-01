import type { Metadata } from "next"
import { recordUrl } from "@/lib/urls"
import { EmbedBoardClient } from "./embed-board-client"

export const metadata: Metadata = {
  title: "Contributor board",
  robots: { index: false },
}

/**
 * Public embed route for a contributor board: `/embed/board/<did>/<rkey>`.
 * Renders bare (the chrome components short-circuit on `/embed`) so it drops
 * cleanly into a third-party iframe.
 */
export default async function EmbedBoardPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const did = slug?.[0] ? decodeURIComponent(slug[0]) : ""
  const rkey = slug?.[1] ? decodeURIComponent(slug[1]) : ""

  if (!did || !rkey) {
    return (
      <div className="contributor-board-embed">
        <p className="contributor-board__empty">Invalid embed URL.</p>
      </div>
    )
  }

  return (
    <div className="contributor-board-embed">
      <EmbedBoardClient did={did} rkey={rkey} />
      <div className="contributor-board-embed__credit">
        <a
          href={`${recordUrl(did, "activity", rkey)}?tab=contributor-board`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by Certified
        </a>
      </div>
    </div>
  )
}
