import {
  Avatar,
  Eyebrow,
  Heading,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ActivityList } from "@/components/activity-list"
import { actorHref } from "@/components/cards"
import { Tile, TileSkeleton } from "@/components/tiles"
import {
  getActor,
  getProject,
  listProjectActivitiesPage,
} from "@/lib/hypercerts/queries"

export async function generateStaticParams() {
  return [{ actor: "did:plc:6taywkxm2zmfsbqikjdaapey", rkey: "3msind56wn22t" }]
}

async function ProjectActivities({ uri }: { uri: string }) {
  const page = await listProjectActivitiesPage({ project: uri })
  return (
    <Tile title="Activities in this project">
      <ActivityList initial={page} source={{ kind: "project", uri }} />
    </Tile>
  )
}

async function Project({
  params,
}: Pick<PageProps<"/[actor]/project/[rkey]">, "params">) {
  const { actor: actorParam, rkey } = await params
  // The route accepts a handle or DID; the collection URI needs the DID.
  const actor = await getActor(decodeURIComponent(actorParam))
  if (!actor) notFound()
  const uri = `at://${actor.did}/org.hypercerts.collection/${rkey}`
  const project = await getProject(uri)
  if (!project) notFound()

  return (
    <>
      <div className="stack">
        <Eyebrow>Project</Eyebrow>
        <Heading level={1} size="display-3">
          {project.title}
        </Heading>
        <Link href={actorHref(actor.did)} className="meta-author">
          <Avatar name={actor.displayName} src={actor.avatarUrl} size="sm" />
          <Text as="span" size="body-sm">
            {actor.displayName}
          </Text>
        </Link>
        {project.description && (
          <Text relaxed className="prewrap">
            {project.description}
          </Text>
        )}
      </div>
      <Suspense fallback={<TileSkeleton title="Activities in this project" />}>
        <ProjectActivities uri={uri} />
      </Suspense>
    </>
  )
}

export default function ProjectPage(
  props: PageProps<"/[actor]/project/[rkey]">,
) {
  return (
    <div className="page">
      <Suspense fallback={<Skeleton variant="text" lines={6} />}>
        <Project params={props.params} />
      </Suspense>
    </div>
  )
}
