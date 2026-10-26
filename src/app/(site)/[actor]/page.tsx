import { notFound } from "next/navigation"
import { Suspense } from "react"

import {
  AboutTile,
  ActivitiesTile,
  BadgesTile,
  ProjectsTile,
  TileSkeleton,
} from "@/components/tiles"
import { Avatar, Heading, Skeleton, Text } from "@/components/ui"
import { getActor } from "@/lib/hypercerts/queries"

// Prerender one known organization at build time; every other actor gets the
// app shell first and is then rendered and cached per URL (ISR).
export async function generateStaticParams() {
  return [{ actor: "did:plc:6taywkxm2zmfsbqikjdaapey" }]
}

async function ActorProfile({ params }: Pick<PageProps<"/[actor]">, "params">) {
  const actor = await getActor(decodeURIComponent((await params).actor))
  if (!actor) notFound()

  return (
    <>
      <header className="page-header">
        <Avatar name={actor.displayName} src={actor.avatarUrl} size="lg" />
        <div>
          <Heading level={1} size="display-3">
            {actor.displayName}
          </Heading>
          <Text size="micro" tone="muted">
            {actor.isOrganization ? "Organization" : "Person"} · {actor.did}
          </Text>
        </div>
      </header>
      <div className="tiles">
        <div className="page">
          <Suspense fallback={<TileSkeleton title="Activities" />}>
            <ActivitiesTile did={actor.did} />
          </Suspense>
          <Suspense fallback={<TileSkeleton title="Projects" />}>
            <ProjectsTile did={actor.did} />
          </Suspense>
        </div>
        <div className="page">
          <AboutTile actor={actor} />
          <Suspense fallback={<TileSkeleton title="Badges received" />}>
            <BadgesTile did={actor.did} />
          </Suspense>
        </div>
      </div>
    </>
  )
}

export default function ActorPage(props: PageProps<"/[actor]">) {
  return (
    <div className="page">
      <Suspense fallback={<Skeleton variant="text" lines={6} />}>
        <ActorProfile params={props.params} />
      </Suspense>
    </div>
  )
}
