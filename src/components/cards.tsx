import {
  Avatar,
  Badge,
  Card,
  Heading,
  IdentityRow,
  Text,
} from "@hypercerts-org/ui-react"
import Link from "next/link"
import type {
  ActivityCard,
  ActorCard,
  AwardSubject,
  BadgeCard,
  ProjectCard,
} from "@/lib/hypercerts/views"

// Presentational cards. They render the same on the server (first page) and on
// the client (pages loaded later), so they take only plain view models.

export function actorHref(did: string) {
  return `/${did}`
}

export function projectHref(project: Pick<ProjectCard, "authorDid" | "rkey">) {
  return `/${project.authorDid}/project/${project.rkey}`
}

export function ActorCardView({ actor }: { actor: ActorCard }) {
  return (
    <Card as="li" variant="panel" className="card">
      <IdentityRow
        name={actor.displayName}
        avatarSrc={actor.avatarUrl}
        href={actorHref(actor.did)}
        secondary={actor.isOrganization ? "Organization" : "Person"}
      />
      {actor.description && (
        <Text size="body-sm" tone="muted" className="clamp">
          {actor.description}
        </Text>
      )}
    </Card>
  )
}

export function ActivityCardView({
  activity,
  showAuthor,
}: {
  activity: ActivityCard
  showAuthor: boolean
}) {
  return (
    <Card as="li" variant="panel" className="card">
      <Heading level={3} size="heading">
        {activity.title}
      </Heading>
      {activity.summary && (
        <Text size="body-sm" className="clamp">
          {activity.summary}
        </Text>
      )}
      <div className="meta">
        {showAuthor && (
          <Link href={actorHref(activity.author.did)} className="meta-author">
            <Avatar
              name={activity.author.displayName}
              src={activity.author.avatarUrl}
              size="sm"
            />
            <Text as="span" size="micro">
              {activity.author.displayName}
            </Text>
          </Link>
        )}
        {activity.createdAt && (
          <Text as="span" size="micro" tone="muted">
            {activity.createdAt}
          </Text>
        )}
      </div>
    </Card>
  )
}

export function ProjectCardView({ project }: { project: ProjectCard }) {
  return (
    <Card as="li" variant="panel" className="card">
      <Heading level={3} size="heading">
        <Link href={projectHref(project)}>{project.title}</Link>
      </Heading>
      {project.summary && (
        <Text size="body-sm" className="clamp">
          {project.summary}
        </Text>
      )}
      <Text size="micro" tone="muted">
        {project.itemCount === 1 ? "1 item" : `${project.itemCount} items`}
      </Text>
    </Card>
  )
}

const responseVariant = { accepted: "success", rejected: "danger" } as const

export function BadgeCardView({ badge }: { badge: BadgeCard }) {
  return (
    <Card as="li" variant="inset" className="card">
      <div className="meta">
        <Text as="span" size="body-sm" tone="ink">
          {badge.title}
        </Text>
        {badge.response && (
          <Badge
            variant={
              responseVariant[badge.response as keyof typeof responseVariant] ??
              "neutral"
            }
          >
            {badge.response}
          </Badge>
        )}
      </div>
      <IdentityRow
        size="sm"
        name={badge.issuer.displayName}
        avatarSrc={badge.issuer.avatarUrl}
        href={actorHref(badge.issuer.did)}
        secondary={badge.createdAt ?? undefined}
      />
    </Card>
  )
}

// The subject of one badge award: an account, a project or another record.
export function AwardSubjectRow({ subject }: { subject: AwardSubject }) {
  if (subject.kind === "actor")
    return (
      <li>
        <IdentityRow
          size="sm"
          name={subject.actor.displayName}
          avatarSrc={subject.actor.avatarUrl}
          href={actorHref(subject.actor.did)}
          secondary={subject.actor.isOrganization ? "Organization" : "Person"}
        />
      </li>
    )
  if (subject.kind === "project")
    return (
      <li>
        <IdentityRow
          size="sm"
          name={subject.project.title}
          href={projectHref(subject.project)}
          secondary="Project"
        />
      </li>
    )
  return (
    <li>
      <IdentityRow size="sm" name={subject.uri} secondary="Other record" />
    </li>
  )
}
