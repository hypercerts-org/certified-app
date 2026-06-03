"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FolderGit2, User, Users } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useManagedProjects } from "@/hooks/use-managed-projects"
import { useManagedActivities } from "@/hooks/use-managed-activities"
import { usePageTitle } from "@/lib/navbar-context"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Avatar from "@/components/ui/avatar"
import Badge from "@/components/ui/badge"
import EmptyState from "@/components/ui/empty-state"
import ViaByline from "@/components/ui/via-byline"
import HomeFeed from "@/components/home/home-feed"
import NewsSection from "@/components/right-rail/news-section"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { getInitials } from "@/lib/utils/initials"
import type { CollectionRecord } from "@/lib/atproto/collection"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { OwnerTag } from "@/lib/atproto/owner-tag"
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
  const router = useRouter()
  const { isLoading: authLoading, isAuthenticated, did: personalDid } = useAuth()
  const { activeOrg } = useOrg()

  // "Acting-as" DID — when the viewer has switched into a group, the
  // home page surfaces the group's projects, certs, and follow feed
  // instead of the personal account's. The sidebar's Groups section
  // still lists the personal-account memberships (it's scoped via
  // useOrg() further down, which always reflects the signed-in user).
  const activeDid = activeOrg?.groupDid || personalDid

  // /home is a signed-in-only surface. Once auth resolves to
  // signed-out, redirect to the marketing landing rather than showing
  // a sign-in empty state. Runs in an effect because router.replace
  // can't fire during render. The brandmark links already aim straight
  // at /welcome when they know the viewer is signed out; this guard
  // backstops the remaining paths into /home — direct navigation, the
  // bottom-nav Home tab, or a click during the auth-loading tick.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/welcome")
    }
  }, [authLoading, isAuthenticated, router])

  // Show a spinner while auth is still resolving, while the signed-out
  // redirect above is in flight, or while an authenticated viewer's
  // acting-as DID is still resolving — never flash the feed or a CTA.
  if (authLoading || !isAuthenticated || !activeDid) {
    return (
      <div className="home-page">
        <div className="home__loading">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  return (
    <div className="home-page">
      <div className="home__layout">
        <aside className="home__sidebar" aria-label="Your library">
          <HomeSidebar activeDid={activeDid} isGroupFocused={!!activeOrg} />
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

function HomeSidebar({
  activeDid,
  isGroupFocused,
}: {
  activeDid: string
  /** True when the viewer has switched into a single group — the "via
   *  {group}" aggregation byline is suppressed in that mode since every
   *  visible record already belongs to that one group. */
  isGroupFocused: boolean
}) {
  const { groups, isLoading: groupsLoading } = useOrg()
  // Aggregated across the viewer's managed identities (personal + every
  // owned/admin group), so group-owned projects/activities surface here
  // too. The managed hooks anchor on the viewer's PERSONAL DID
  // internally (via useAuth), so this aggregate is stable regardless of
  // which identity the home page is currently focused on (activeDid).
  const { items: projects, isLoading: projectsLoading } = useManagedProjects()
  const { items: certs, isLoading: certsLoading } = useManagedActivities()

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
            <h2 className="home-section__title">My profile</h2>
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
        moreHref={`${profileBase}?tab=groups`}
        emptyLabel="No groups yet."
      />
      <SidebarSection
        title="My projects"
        icon={FolderGit2}
        isLoading={projectsLoading && previewProjects.length === 0}
        items={previewProjects}
        total={projects.length}
        renderItem={(p) => (
          <ProjectRow
            key={p.record.uri}
            project={p.record}
            owner={p.owner}
            showVia={!isGroupFocused}
          />
        )}
        moreHref={`${profileBase}?tab=projects`}
        emptyLabel="No projects yet."
      />
      <SidebarSection
        title="My activities"
        icon={CertIcon}
        isLoading={certsLoading && previewCerts.length === 0}
        items={previewCerts}
        total={certs.length}
        renderItem={(c) => (
          <CertRow
            key={c.record.uri}
            record={c.record}
            owner={c.owner}
            showVia={!isGroupFocused}
            fallbackDid={activeDid}
          />
        )}
        moreHref={`${profileBase}?tab=activities`}
        emptyLabel="No activities yet."
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
          <Badge variant="count-bare" className="home-section__count">
            {total}
          </Badge>
        ) : null}
      </header>
      {isLoading ? (
        <div className="home-section__loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState variant="inline" title={emptyLabel} className="home-section__empty" />
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

function ProjectRow({
  project,
  owner,
  showVia,
}: {
  project: CollectionRecord
  owner: OwnerTag
  /** Suppress the "via {group}" byline (e.g. while focused on one group). */
  showVia: boolean
}) {
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

  // Only group-owned records carry a provenance line; personal records
  // are the viewer's own, so no "via" is shown.
  const via = showVia && owner.kind === "group" && owner.group ? owner.group : null

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
        <span className="home-row__text">
          <span className="home-row__label">{title}</span>
          {via ? <ViaByline group={via} role={owner.role} /> : null}
        </span>
      </Link>
    </li>
  )
}

function CertRow({
  record,
  owner,
  showVia,
  fallbackDid,
}: {
  record: ActivityRecord
  owner: OwnerTag
  /** Suppress the "via {group}" byline (e.g. while focused on one group). */
  showVia: boolean
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

  // Only group-owned records carry a provenance line; personal records
  // are the viewer's own, so no "via" is shown.
  const via = showVia && owner.kind === "group" && owner.group ? owner.group : null

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
        <span className="home-row__text">
          <span className="home-row__label">
            {record.value.title || "Untitled activity"}
          </span>
          {via ? <ViaByline group={via} role={owner.role} /> : null}
        </span>
      </Link>
    </li>
  )
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}
