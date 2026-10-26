import type { Metadata } from "next"
import { Suspense } from "react"

import { ExploreSearch } from "@/components/explore-search"
import { OrganizationList } from "@/components/organization-list"
import { Heading, Skeleton } from "@/components/ui"
import { listOrganizationsPage } from "@/lib/hypercerts/queries"

export const metadata: Metadata = { title: "Explore" }

function queryFrom(value: string | string[] | undefined) {
  const query = Array.isArray(value) ? value[0] : value
  return query?.trim().slice(0, 100) ?? ""
}

async function Results({ searchParams }: Pick<PageProps<"/explore">, "searchParams">) {
  const query = queryFrom((await searchParams).q)
  const page = await listOrganizationsPage({ query: query || undefined })
  return (
    <>
      <ExploreSearch query={query} />
      {/* Keyed by query so a new search resets the client-side list. */}
      <OrganizationList key={query} initial={page} query={query} />
    </>
  )
}

export default function ExplorePage(props: PageProps<"/explore">) {
  return (
    <div className="page">
      <Heading level={1} size="display-3">
        Organizations
      </Heading>
      <div className="stack">
        <Suspense fallback={<Skeleton variant="text" lines={4} />}>
          <Results searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
