import type { Metadata } from "next"
import { recordMetadata } from "@/lib/og-metadata"
import { collectionForType, isRecordType } from "@/lib/urls"

/**
 * Server layout for the `/[actor]/{type}/{rkey}` record subtree. Attaches
 * per-record Open Graph / Twitter metadata (activity or project), overriding
 * the profile metadata from the parent `[actor]` layout. The page and its
 * edit/update children are client components, so the metadata lives here.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ actor: string; type: string; rkey: string }>
}): Promise<Metadata> {
  const { actor, type, rkey } = await params
  if (!isRecordType(type)) return {}
  return recordMetadata(
    decodeURIComponent(actor),
    type,
    collectionForType(type),
    decodeURIComponent(rkey),
  )
}

export default function RecordLayout({ children }: { children: React.ReactNode }) {
  return children
}
