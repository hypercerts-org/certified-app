"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FolderGit2, Library, ListChecks, ThumbsUp, UserCheck, Users } from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import SideNav, { type SideNavIcon } from "@/components/ui/side-nav"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import { useSwitchActor } from "@/lib/groups/use-switch-actor"
import WorkPane from "@/components/records/work-pane"
import RecordsNewMenu from "@/components/records/records-new-menu"
import {
  EndorsementsPane,
  FollowersPane,
  FollowingPane,
  ListsPane,
} from "@/components/records/records-panes"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"
import { useFollowing } from "@/hooks/use-following"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useActorWorkspaceCounts } from "@/hooks/use-workspace"
import { usePageTitle } from "@/lib/navbar-context"
import type { CollectionRecord } from "@/lib/atproto/collection"

// "activities" is the projects-and-activities folder view (key kept so
// existing ?kind=activities links still land on it).
type RecordKind = "activities" | "endorsements" | "following" | "followers" | "lists"

const KINDS: { key: RecordKind; label: string; icon: SideNavIcon }[] = [
  { key: "activities", label: "Projects and activities", icon: FolderGit2 },
  { key: "endorsements", label: "Endorsements", icon: ThumbsUp },
  { key: "following", label: "Following", icon: UserCheck },
  { key: "followers", label: "Followers", icon: Users },
  { key: "lists", label: "Lists", icon: ListChecks },
]

function parseKind(value: string | null): RecordKind {
  return KINDS.some((k) => k.key === value) ? (value as RecordKind) : "activities"
}

const TITLE = "Records"
const DESCRIPTION = "Everything your account holds. Create, change and organise it here."

/**
 * `/records` — one place to manage everything the signed-in person's
 * account holds: projects with their activities (as folders), endorsements
 * given and received, who they follow (and, read-only, who follows them)
 * and lists. A `SideNav` of kinds (a column from 1100px, a scrolling row
 * of pills below) picks the pane via `?kind=`.
 *
 * Personal account only: the page writes to the session DID's repo. While
 * acting as a group the page stays in the navigation and explains that
 * records are managed on the personal account, with a button to switch.
 */
export default function RecordsPage() {
  usePageTitle(TITLE)
  const router = useRouter()
  const params = useSearchParams()
  const kind = parseKind(params.get("kind"))
  const { isLoading: authLoading, isAuthenticated, did } = useAuth()
  const { handle } = useSession()
  const { activeOrg } = useOrg()
  const switchActor = useSwitchActor()

  const { counts, isLoading: countsLoading } = useActorWorkspaceCounts(did ?? null)
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

  if (authLoading || !isAuthenticated || !did) {
    return (
      <PageContainer className="records-page">
        <div className="records-page__loading">
          <LoadingSpinner size="md" />
        </div>
      </PageContainer>
    )
  }

  // Acting as a group: Records stays in the navigation, and the page says
  // where records live instead of redirecting.
  if (activeOrg) {
    return (
      <PageContainer className="records-page">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <EmptyState
          icon={Library}
          headingLevel={2}
          title="Records are managed on your personal account"
          description="Switch to your personal account to see and edit your projects, activities, endorsements, follows and lists."
        >
          <Button variant="primary" onClick={() => switchActor(null)}>
            Switch to personal account
          </Button>
        </EmptyState>
      </PageContainer>
    )
  }

  // Counts only where one number says it: the folder view counts per
  // folder, and Endorsements counts per tab.
  const countFor = (k: RecordKind): number | string | null => {
    if (k === "following") {
      return following.isLoading && following.count === 0 ? "…" : following.count
    }
    if (k === "followers") {
      return counts.followers ?? (countsLoading ? "…" : null)
    }
    return null
  }
  const actor = handle || did

  return (
    <PageContainer className="records-page">
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <RecordsNewMenu
            first={kind === "lists" ? "list" : "activity"}
          />
        }
      />
      <div className="records__layout">
        <SideNav
          aria-label="Kinds of records"
          className="records__nav"
          items={KINDS.map(({ key, label, icon }) => ({
            key,
            label,
            icon,
            href: `/records?kind=${key}`,
            count: countFor(key),
            current: key === kind,
          }))}
        />
        <div className="records__main">
          {kind === "activities" ? (
            <WorkPane
              did={did}
              actor={actor}
              removed={removed}
              written={written}
              onDeleted={markRemoved}
              onProjectWritten={markWritten}
            />
          ) : kind === "endorsements" ? (
            <EndorsementsPane did={did} actor={actor} given={given} />
          ) : kind === "following" ? (
            <FollowingPane did={did} following={following} />
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
