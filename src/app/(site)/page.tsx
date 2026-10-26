import { Suspense } from "react"

import { ActivityList } from "@/components/activity-list"
import { TileSkeleton } from "@/components/tiles"
import { Eyebrow, Heading, Text } from "@/components/ui"
import { listActivitiesPage } from "@/lib/hypercerts/queries"

async function RecentActivities() {
  const page = await listActivitiesPage({ limit: 9 })
  return <ActivityList initial={page} source={{ kind: "all" }} />
}

export default function HomePage() {
  return (
    <div className="page">
      <div className="stack">
        <Eyebrow>certified.app v2 spike</Eyebrow>
        <Heading level={1} size="display-3">
          Organizations, projects and activities on the Hypercerts protocol
        </Heading>
        <Text>
          A read-only slice of the rebuild, reading live data from the
          Hypercerts API. Nothing here writes to the protocol.
        </Text>
      </div>
      <section className="tile">
        <Eyebrow as="p">Recent activities</Eyebrow>
        <Suspense fallback={<TileSkeleton title="Loading" />}>
          <RecentActivities />
        </Suspense>
      </section>
    </div>
  )
}
