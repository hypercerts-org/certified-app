"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { FolderGit2, Library, ListChecks, ThumbsUp, UserCheck, Users } from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import { useSwitchActor } from "@/lib/groups/use-switch-actor"
import {
  EndorsementsPane,
  FollowersPane,
  FollowingPane,
  ListsPane,
  WorkPane,
} from "@/components/records/records-panes"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"
import { useFollowing } from "@/hooks/use-following"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useActorWorkspaceCounts } from "@/hooks/use-workspace"
import { usePageTitle } from "@/lib/navbar-context"

// "activities" is the projects-and-activities folder view (key kept so
// existing ?kind=activities links still land on it).
type RecordKind = "activities" | "endorsements" | "following" | "followers" | "lists"

const KINDS: {
  key: RecordKind
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean | "true" }>
}[] = [
  { key: "activities", label: "Projects / Activities", icon: FolderGit2 },
  { key: "endorsements", label: "Endorsements", icon: ThumbsUp },
  { key: "following", label: "Following", icon: UserCheck },
  { key: "followers", label: "Followers", icon: Users },
  { key: "lists", label: "Lists", icon: ListChecks },
]

function parseKind(value: string | null): RecordKind {
  return KINDS.some((k) => k.key === value) ? (value as RecordKind) : "activities"
}

/**
 * `/records` — one place to manage everything the signed-in person's
 * account holds: projects with their activities (as folders), endorsements
 * given and received, who they follow (and, read-only, who follows them)
 * and lists. A list of kinds (a column
 * at 1100px and wider, a scrolling row of pills below) picks the pane via
 * `?kind=`; each pane lists the records with a way to create, open, edit
 * and delete them.
 *
 * Personal account only: lists have no group write path. While acting as
 * a group the page stays in the navigation and explains that records are
 * managed on the personal account, with a button to switch back.
 */
export default function RecordsPage() {
  usePageTitle("Records")
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
  // Projects and activities deleted on this page, by URI. Kept here (not
  // in the pane) so a deleted row stays hidden after switching kinds and
  // back while the indexer still lists it.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const markRemoved = (uri: string) => setRemoved((prev) => new Set(prev).add(uri))

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) router.replace("/welcome")
  }, [authLoading, isAuthenticated, router])

  if (authLoading || !isAuthenticated || !did) {
    return (
      <div className="records-page">
        <div className="records-page__loading">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  // Acting as a group: Records stays in the navigation, and the page says
  // where records live instead of redirecting.
  if (activeOrg) {
    return (
      <PageContainer>
        <PageHeader title="Records" />
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
  const countFor = (k: RecordKind): number | null | undefined => {
    if (k === "following") {
      return following.isLoading && following.count === 0 ? null : following.count
    }
    if (k === "followers") return counts.followers
    return undefined
  }
  const actor = handle || did

  return (
    <div className="records-page">
      <div className="records__layout">
        <nav className="records-nav" aria-label="Kinds of records">
          <ul className="records-nav__list">
            {KINDS.map(({ key, label, icon: Icon }) => {
              const n = countFor(key)
              const current = key === kind
              return (
                <li key={key}>
                  <Link
                    href={`/records?kind=${key}`}
                    className="records-nav__link"
                    aria-current={current ? "page" : undefined}
                  >
                    <Icon size={16} strokeWidth={1.75} aria-hidden />
                    <span className="records-nav__label">{label}</span>
                    {n === undefined ? null : n !== null || countsLoading ? (
                      <span className="records-nav__count">{n ?? "…"}</span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="records__main">
          {kind === "activities" ? (
            <WorkPane did={did} actor={actor} removed={removed} onDeleted={markRemoved} />
          ) : kind === "endorsements" ? (
            <EndorsementsPane did={did} given={given} />
          ) : kind === "following" ? (
            <FollowingPane did={did} following={following} />
          ) : kind === "followers" ? (
            <FollowersPane did={did} following={following} />
          ) : (
            <ListsPane did={did} />
          )}
        </div>
      </div>
    </div>
  )
}
