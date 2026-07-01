import type { Metadata } from "next"
import { profileMetadata } from "@/lib/og-metadata"

/**
 * Server layout for the `/[actor]` subtree. Its sole job is to attach
 * per-profile Open Graph / Twitter metadata — the page itself is a client
 * component and can't export `generateMetadata`. Record routes nested below
 * (`/[actor]/{type}/{rkey}`) override this with their own metadata.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ actor: string }>
}): Promise<Metadata> {
  const { actor } = await params
  return profileMetadata(decodeURIComponent(actor))
}

export default function ActorLayout({ children }: { children: React.ReactNode }) {
  return children
}
