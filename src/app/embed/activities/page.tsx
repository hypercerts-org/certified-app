import type { Metadata } from "next"
import { Suspense } from "react"

import { ActivityList } from "@/components/activity-list"
import { actorHref } from "@/components/cards"
import { ErrorMessage, Skeleton, Text } from "@/components/ui"
import { listActivitiesPage } from "@/lib/hypercerts/queries"
import { isDid } from "@/lib/validate"

export const metadata: Metadata = { title: "Activities", robots: { index: false } }

// A minimal page meant to be iframed on another website:
//   <iframe src="https://certified.app/embed/activities?author=did:plc:..." ...>
// It reuses the same query function and list component as the site.
async function EmbeddedActivities({ searchParams }: Pick<PageProps<"/embed/activities">, "searchParams">) {
  const author = (await searchParams).author
  if (typeof author !== "string" || !isDid(author)) {
    return <ErrorMessage>Set the author parameter to an account DID.</ErrorMessage>
  }
  const page = await listActivitiesPage({ author, limit: 6 })
  return (
    <>
      <ActivityList initial={page} source={{ kind: "author", did: author }} showAuthor={false} />
      <Text size="micro" tone="muted" className="embed-footer">
        <a href={actorHref(author)} target="_blank" rel="noopener">
          View on Certified
        </a>
      </Text>
    </>
  )
}

export default function EmbedActivitiesPage(props: PageProps<"/embed/activities">) {
  return (
    <main className="embed">
      <Suspense fallback={<Skeleton variant="text" lines={4} />}>
        <EmbeddedActivities searchParams={props.searchParams} />
      </Suspense>
    </main>
  )
}
