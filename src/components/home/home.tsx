"use client"

import Link from "next/link"
import { FolderGit2, LogIn, User, Users } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useUserProjects } from "@/hooks/use-user-projects"
import { useUserActivities } from "@/hooks/use-user-activities"
import { usePageTitle } from "@/lib/navbar-context"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Avatar from "@/components/ui/avatar"
import HomeFeed from "@/components/home/home-feed"
import NewsSection from "@/components/right-rail/news-section"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { getInitials } from "@/lib/utils/initials"
import type { CollectionRecord } from "@/lib/atproto/collection"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { Group } from "@/lib/groups/types"

/** DID of the actor whose Bluesky timeline powers the home page's
 *  "Our news" rail. Hard-coded — the source-of-truth lives in this
 *  component because the home page is its only consumer. */
const NEWS_ACTOR_DID = "did:plc:apun3uo5jqm34pxzqq6on754"

const SIDEBAR_PREVIEW_LIMIT = 5

/**
 * Signed-in home page. Same shell as /explore (sidebar + main pane),
 * with the main pane split into a wide activity feed + a narrow
 * "Our news" rail.
 *
 *   sidebar (220px)        main (flex)
 *   ┌──────────────────┐   ┌────────────────────────────┐
 *   │ Groups (5)       │   │ feed (1fr)   │ news (320px) │
 *   │ Projects (5)     │   │              │              │
 *   │ Certs (5)        │   │              │              │
 *   └──────────────────┘   └────────────────────────────┘
 *
 * The sidebar shows the viewer's first five groups / projects / certs
 * with a "Show all" link to the full surface. The feed is the
 * follow-graph activity feed. The news rail pulls Bluesky posts from
 * the hard-coded news DID.
 */
export default function Home() {
  usePageTitle("Home")
  const { isAuthenticated, did: personalDid } = useAuth()
  const { activeOrg } = useOrg()

  // "Acting-as" DID — when the viewer has switched into a group, the
  // home page surfaces the group's projects, certs, and follow feed
  // instead of the personal account's. The sidebar's Groups section
  // still lists the personal-account memberships (it's scoped via
  // useOrg() further down, which always reflects the signed-in user).
  const activeDid = activeOrg?.groupDid || personalDid

  if (!isAuthenticated || !activeDid) {
    return (
      <div className="home-page">
        <div className="home__signed-out">
          <EmptyState
            icon={LogIn}
            title="Sign in to see your home"
            description="Once signed in, you'll see the groups, projects, and certs you own — plus a feed of activity from the people you follow."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="home-page">
      <div className="home__layout">
        <aside className="home__sidebar" aria-label="Your library">
          <HomeSidebar activeDid={activeDid} />
        </aside>
        <main className="home__main">
          <div className="home__split">
            <div className="home__feed">
              <HomeFeed activeDid={activeDid} />
            </div>
            <aside className="home__news" aria-label="News from Certified">
              <NewsSection actor={NEWS_ACTOR_DID} heading="News from Certified" />
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}

// ---------------------------- Sidebar ---------------------------------------

function HomeSidebar({ activeDid }: { activeDid: string }) {
  const { groups, isLoading: groupsLoading } = useOrg()
  const { projects, isLoading: projectsLoading } = useUserProjects(activeDid)
  const { activities: certs, isLoading: certsLoading } =
    useUserActivities(activeDid)

  const previewGroups = groups.slice(0, SIDEBAR_PREVIEW_LIMIT)
  const previewProjects = projects.slice(0, SIDEBAR_PREVIEW_LIMIT)
  const previewCerts = certs.slice(0, SIDEBAR_PREVIEW_LIMIT)

  // Profile detail accepts the DID under the [handle] slot, so
  // "Show more" stays correct even before we've resolved the handle.
  const profileBase = `/profile/${encodeURIComponent(activeDid)}`

  return (
    <>
      <section className="home-section">
        <header className="home-section__head">
          <User size={14} strokeWidth={1.75} aria-hidden />
          <Link href={profileBase} className="home-section__title-link">
            <h2 className="home-section__title">Go to my profile</h2>
          </Link>
        </header>
      </section>
      <SidebarSection
        title="My groups"
        icon={Users}
        isLoading={groupsLoading && previewGroups.length === 0}
        items={previewGroups}
        total={groups.length}
        renderItem={(g) => <GroupRow key={g.groupDid} group={g} />}
        moreHref="/groups"
        emptyLabel="No groups yet."
      />
      <SidebarSection
        title="My projects"
        icon={FolderGit2}
        isLoading={projectsLoading && previewProjects.length === 0}
        items={previewProjects}
        total={projects.length}
        renderItem={(p) => <ProjectRow key={p.uri} project={p} />}
        moreHref={`${profileBase}?tab=projects`}
        emptyLabel="No projects yet."
      />
      <SidebarSection
        title="My certs"
        icon={CertIcon}
        isLoading={certsLoading && previewCerts.length === 0}
        items={previewCerts}
        total={certs.length}
        renderItem={(c) => <CertRow key={c.uri} record={c} fallbackDid={activeDid} />}
        moreHref={`${profileBase}?tab=certs`}
        emptyLabel="No certs yet."
      />
    </>
  )
}

interface SidebarSectionProps<T> {
  title: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean | "true" }>
  items: T[]
  total: number
  isLoading: boolean
  renderItem: (item: T) => React.ReactNode
  moreHref: string
  emptyLabel: string
}

function SidebarSection<T>({
  title,
  icon: Icon,
  items,
  total,
  isLoading,
  renderItem,
  moreHref,
  emptyLabel,
}: SidebarSectionProps<T>) {
  // "Show all" only makes sense when there are extras to reveal —
  // hide when the preview already contains everything.
  const hasMore = total > items.length
  return (
    <section className="home-section">
      <header className="home-section__head">
        <Icon size={14} strokeWidth={1.75} aria-hidden />
        <Link href={moreHref} className="home-section__title-link">
          <h2 className="home-section__title">{title}</h2>
        </Link>
        {total > 0 ? (
          <span className="home-section__count">{total}</span>
        ) : null}
      </header>
      {isLoading ? (
        <div className="home-section__loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : items.length === 0 ? (
        <p className="home-section__empty">{emptyLabel}</p>
      ) : (
        <ul className="home-section__list">{items.map(renderItem)}</ul>
      )}
      {hasMore ? (
        <Link href={moreHref} className="home-section__more">
          Show all
        </Link>
      ) : null}
    </section>
  )
}

// ----------------------------- Row variants ---------------------------------

function GroupRow({ group }: { group: Group }) {
  const initials = getInitials(group.displayName ?? group.handle, group.groupDid)
  const label = group.displayName || group.handle || "Group"
  return (
    <li>
      <Link
        href={`/groups/${encodeURIComponent(group.groupDid)}`}
        className="home-row"
      >
        <Avatar
          size="sm"
          src={group.avatarUrl}
          alt=""
          fallbackInitials={initials}
        />
        <span className="home-row__label">{label}</span>
      </Link>
    </li>
  )
}

function ProjectRow({ project }: { project: CollectionRecord }) {
  const parsed = parseAtUri(project.uri)
  const did = parsed?.did ?? ""
  const href = parsed
    ? `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : "#"

  const title =
    asString(project.value.title) ||
    asString(project.value.name) ||
    "Untitled project"

  const rawImage =
    (project.value as Record<string, unknown>).banner ?? project.value.image
  const imageUrl =
    rawImage && did
      ? resolveActivityImageUrl(
          rawImage as Parameters<typeof resolveActivityImageUrl>[0],
          did,
        )
      : null

  return (
    <li>
      <Link href={href} className="home-row">
        <span className="home-row__thumb">
          {imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={imageUrl} alt="" loading="lazy" />
          ) : (
            <FolderGit2
              size={14}
              strokeWidth={1.5}
              aria-hidden
              className="home-row__thumb-icon"
            />
          )}
        </span>
        <span className="home-row__label">{title}</span>
      </Link>
    </li>
  )
}

function CertRow({
  record,
  fallbackDid,
}: {
  record: ActivityRecord
  fallbackDid: string
}) {
  const parsed = parseAtUri(record.uri)
  const href = parsed
    ? `/activity/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : "#"
  const did = parsed?.did ?? fallbackDid

  const imageUrl = record.value.image
    ? resolveActivityImageUrl(record.value.image, did)
    : null

  return (
    <li>
      <Link href={href} className="home-row">
        <span className="home-row__thumb">
          {imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={imageUrl} alt="" loading="lazy" />
          ) : (
            <CertIcon
              size={14}
              strokeWidth={1.5}
              aria-hidden
              className="home-row__thumb-icon"
            />
          )}
        </span>
        <span className="home-row__label">
          {record.value.title || "Untitled cert"}
        </span>
      </Link>
    </li>
  )
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}
