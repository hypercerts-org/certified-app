import {
  Avatar,
  Button,
  Card,
  Eyebrow,
  Heading,
  Input,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react"
import Form from "next/form"
import Link from "next/link"
import { Suspense } from "react"
import { actorHref } from "@/components/cards"
import { getActor, getNetwork } from "@/lib/hypercerts/queries"

// Networks featured on the landing page. Chosen by hand: ranking by size would
// put test accounts first, since some hold hundreds of awards.
const FEATURED_NETWORKS = [
  "did:plc:7ffezlhobzihdt3nbazysgvr", // Ma Earth
  "did:plc:yjck2sybksyigp3zvbq7bfki", // GainForest
  "did:plc:5yrzhewvp6qfjyblb3lph4a7", // Silvi
  "did:plc:iqvh5yrqmibv2imh55hmzrfs", // Restor
]

async function NetworkCard({ did }: { did: string }) {
  const [actor, network] = await Promise.all([getActor(did), getNetwork(did)])
  if (!actor || !network) return null
  return (
    <Card as="li" variant="panel" className="card">
      <Link href={actorHref(did)} className="network-card-name">
        <Avatar name={actor.displayName} src={actor.avatarUrl} size="md" />
        <Heading level={3} size="heading">
          {actor.displayName}
        </Heading>
      </Link>
      {actor.description && (
        <Text size="body-sm" tone="muted" className="clamp">
          {actor.description}
        </Text>
      )}
      <Text size="micro" tone="muted">
        {network.memberCount} members ·{" "}
        {network.programmes
          .slice(0, 3)
          .map((programme) => programme.title)
          .join(", ")}
      </Text>
    </Card>
  )
}

export default function HomePage() {
  return (
    <div className="page">
      <div className="stack">
        <Eyebrow>certified.app v2 spike</Eyebrow>
        <Heading level={1} size="display-3">
          See who does the work, and who stands behind it
        </Heading>
        <Text>
          Funders, fellowships and communities recognize the organizations and
          projects they work with. Each organization owns its own profile;
          networks add their recognition to it.
        </Text>
      </div>

      <section className="tile">
        <Eyebrow as="p">Find your organization</Eyebrow>
        <Form action="/explore" className="find-form">
          <Input
            name="q"
            type="search"
            placeholder="Organization name"
            aria-label="Organization name"
            required
          />
          <Button type="submit" variant="primary">
            Find
          </Button>
        </Form>
      </section>

      <section className="tile">
        <Eyebrow as="p">Explore networks</Eyebrow>
        <ul className="grid">
          {FEATURED_NETWORKS.map((did) => (
            <Suspense
              key={did}
              fallback={
                <Card as="li" variant="panel" className="card">
                  <Skeleton variant="text" lines={3} />
                </Card>
              }
            >
              <NetworkCard did={did} />
            </Suspense>
          ))}
        </ul>
      </section>
    </div>
  )
}
