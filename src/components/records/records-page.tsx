"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FolderGit2, FolderOpen, ListChecks, ThumbsUp, Users } from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import SideNav, { type SideNavIcon } from "@/components/ui/side-nav"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import { SeeAllLink } from "@/components/ui/section-header"
import { useSwitchActor } from "@/lib/groups/use-switch-actor"
import { ownProfileUrl } from "@/lib/urls"
import WorkPane from "@/components/records/work-pane"
import {
  EndorsementsPane,
  FollowersPane,
  ListsPane,
} from "@/components/records/records-panes"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"
import { useFollowing } from "@/hooks/use-following"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { usePageTitle } from "@/lib/navbar-context"
import type { CollectionRecord } from "@/lib/atproto/collection"

// "activities" is the projects-and-activities folder view (key kept so
// existing ?kind=activities links still land on it).
// "followers" holds both Followers and Following, as tabs.
type RecordKind = "activities" | "endorsements" | "followers" | "lists"

const KINDS: { key: RecordKind; label: string; icon: SideNavIcon }[] = [
  { key: "activities", label: "Projects and activities", icon: FolderGit2 },
  { key: "endorsements", label: "Endorsements", icon: ThumbsUp },
  { key: "followers", label: "Followers", icon: Users },
  { key: "lists", label: "Lists", icon: ListChecks },
]

function parseKind(value: string | null): RecordKind {
  // The old Following section is now a tab of Followers.
  if (value === "following") return "followers"
  return KINDS.some((k) => k.key === value) ? (value as RecordKind) : "activities"
}

const TITLE = "Records"
const DESCRIPTION = "Everything your account holds. Create, change and organise it here."

/**
 * `/records` — one place to manage everything the signed-in person's
 * account holds: projects with their activities (as folders), endorsements
 * given and received, followers and who they follow, and lists. A
 * `SideNav` of kinds (a column from 1100px, pills below) picks the pane
 * via `?kind=`; Endorsements, Followers and Lists have tabs (`&tab=`).
 *
 * Personal account only: the page writes to the session DID's repo. While
 * acting as a group the page stays in the navigation, points to the
 * group's records on its profile and offers to switch back.
 *
 * The page header has no action: each pane's header carries its own
 * (New activity and New project, New list, Endorse someone, Find
 * accounts), and the top bar's New is the global one.
 */
export default function RecordsPage() {
  usePageTitle(TITLE)
  const router = useRouter()
  const params = useSearchParams()
  const kindParam = params.get("kind")
  const kind = parseKind(kindParam)
  const { isLoading: authLoading, isAuthenticated, did } = useAuth()
  const { handle } = useSession()
  const { activeOrg } = useOrg()
  const switchActor = useSwitchActor()
  // Bumped by the projects-and-activities pane's "Try again": remounts it
  // so both of its loads run again.
  const [workAttempt, setWorkAttempt] = useState(0)

  const following = useFollowing(did ?? null)
  const given = useGivenEndorsements(did ?? null)

  // Kept here (not in the panes) so they survive switching kinds and back
  // while the indexer still lags: projects and activities deleted on this
  // page, and projects written on it (changed items, or new).
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [written, setWritten] = useState<ReadonlyMap<string, CollectionRecord>>(new Map())
  const markRemoved = useCallback(
    (uri: string) => setRemoved((prev) => new Set(prev).add(uri)),
    [],
  )
  const markWritten = useCallback(
    (record: CollectionRecord) => setWritten((prev) => new Map(prev).set(record.uri, record)),
    [],
  )

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) router.replace("/welcome")
  }, [authLoading, isAuthenticated, router])

  // Old links to the Following section open the Following tab.
  useEffect(() => {
    if (kindParam === "following") router.replace("/records?kind=followers&tab=following")
  }, [kindParam, router])

  if (authLoading || !isAuthenticated || !did) {
    return (
      <PageContainer className="records-page">
        <div className="records-page__loading">
          <LoadingSpinner size="md" />
        </div>
      </PageContainer>
    )
  }

  // Acting as a group: Records stays in the navigation. The group's
  // records live on its profile (the same target as Home's "All
  // records"), so that comes first; switching back is the way to manage
  // your own.
  if (activeOrg) {
    const groupProfile = ownProfileUrl({ activeGroup: activeOrg })
    return (
      <PageContainer className="records-page">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <EmptyState
          icon={FolderOpen}
          headingLevel={2}
          title="This group's records are on its profile"
          description="To manage your own records, switch to your personal account."
        >
          <div className="records-group">
            <div className="records-group__actions">
              <Button variant="primary" href={`${groupProfile}?tab=activities`}>
                Open activities
              </Button>
              <Button variant="secondary" onClick={() => switchActor(null)}>
                Switch to personal account
              </Button>
            </div>
            <SeeAllLink href={`${groupProfile}?tab=projects`} label="Open projects" />
          </div>
        </EmptyState>
      </PageContainer>
    )
  }

  // No counts in the side list: the folder view counts per folder, and
  // Endorsements, Followers and Lists count per tab.
  const actor = handle || did

  return (
    <PageContainer className="records-page">
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <div className="records__layout">
        <SideNav
          aria-label="Kinds of records"
          className="records__nav"
          items={KINDS.map(({ key, label, icon }) => ({
            key,
            label,
            icon,
            href: `/records?kind=${key}`,
            current: key === kind,
          }))}
        />
        <div className="records__main">
          {kind === "activities" ? (
            <WorkPane
              key={workAttempt}
              did={did}
              actor={actor}
              removed={removed}
              written={written}
              onDeleted={markRemoved}
              onProjectWritten={markWritten}
              onRetry={() => setWorkAttempt((n) => n + 1)}
            />
          ) : kind === "endorsements" ? (
            <EndorsementsPane did={did} actor={actor} given={given} />
          ) : kind === "followers" ? (
            <FollowersPane did={did} actor={actor} following={following} />
          ) : (
            <ListsPane did={did} />
          )}
        </div>
      </div>
    </PageContainer>
  )
}
