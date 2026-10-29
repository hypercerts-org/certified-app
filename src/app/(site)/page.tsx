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
import { getActor, getAwardsIssued } from "@/lib/hypercerts/queries"

// Accounts featured on the landing page because they have issued badge awards.
// Chosen by hand: ranking by award count would put test accounts first, since
// some have issued hundreds of awards.
const FEATURED_ISSUERS = [
  "did:plc:7ffezlhobzihdt3nbazysgvr", // Ma Earth
  "did:plc:yjck2sybksyigp3zvbq7bfki", // GainForest
  "did:plc:5yrzhewvp6qfjyblb3lph4a7", // Silvi
  "did:plc:iqvh5yrqmibv2imh55hmzrfs", // Restor
]

async function IssuerCard({ did }: { did: string }) {
  const [actor, issued] = await Promise.all([
    getActor(did),
    getAwardsIssued(did),
  ])
  if (!actor || !issued) return null
  return (
    <Card as="li" variant="panel" className="card">
      <Link href={actorHref(did)} className="issuer-card-name">
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
        {issued.awardCount} badge awards ·{" "}
        {issued.badges
          .slice(0, 3)
          .map((badge) => badge.title)
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
          See what organizations do, and the badges they award
        </Heading>
        <Text>
          Organizations publish their own profiles, activities and projects, and
          award badges to other accounts and projects.
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
        <Eyebrow as="p">Organizations that award badges</Eyebrow>
        <ul className="grid">
          {FEATURED_ISSUERS.map((did) => (
            <Suspense
              key={did}
              fallback={
                <Card as="li" variant="panel" className="card">
                  <Skeleton variant="text" lines={3} />
                </Card>
              }
            >
              <IssuerCard did={did} />
            </Suspense>
          ))}
        </ul>
      </section>
    </div>
  )
}
