"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { FolderGit2, ListChecks, ThumbsUp, UserCheck, Users } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import LoadingSpinner from "@/components/ui/loading-spinner"
import {
  ActivitiesPane,
  EndorsementsPane,
  FollowersPane,
  FollowingPane,
  ListsPane,
  ProjectsPane,
} from "@/components/records/records-panes"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"
import { useFollowing } from "@/hooks/use-following"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useActorWorkspaceCounts } from "@/hooks/use-workspace"
import { usePageTitle } from "@/lib/navbar-context"

type RecordKind =
  | "activities"
  | "projects"
  | "endorsements"
  | "following"
  | "followers"
  | "lists"

const KINDS: {
  key: RecordKind
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean | "true" }>
}[] = [
  { key: "activities", label: "Activities", icon: CertIcon },
  { key: "projects", label: "Projects", icon: FolderGit2 },
  { key: "endorsements", label: "Endorsements given", icon: ThumbsUp },
  { key: "following", label: "Following", icon: UserCheck },
  { key: "followers", label: "Followers", icon: Users },
  { key: "lists", label: "Lists", icon: ListChecks },
]

function parseKind(value: string | null): RecordKind {
  return KINDS.some((k) => k.key === value) ? (value as RecordKind) : "activities"
}

/**
 * `/records` — one place to manage everything the signed-in person's
 * account holds: activities, projects, endorsements given, who they follow
 * (and, read-only, who follows them) and lists. A list of kinds (a column
 * at 1100px and wider, a scrolling row of pills below) picks the pane via
 * `?kind=`; each pane lists the records with a way to create, open, edit
 * and delete them.
 *
 * Personal account only: lists have no group write path, and the nav
 * hides Records while acting as a group (see personal-only.ts).
 */
export default function RecordsPage() {
  usePageTitle("Records")
  const router = useRouter()
  const params = useSearchParams()
  const kind = parseKind(params.get("kind"))
  const { isLoading: authLoading, isAuthenticated, did } = useAuth()
  const { handle } = useSession()
  const { activeOrg } = useOrg()

  const { counts, isLoading: countsLoading } = useActorWorkspaceCounts(did ?? null)
  const following = useFollowing(did ?? null)
  const given = useGivenEndorsements(did ?? null)
  // Records deleted on this page, by URI. Kept here (not in the panes) so
  // a deleted row stays hidden after switching kinds and back while the
  // indexer still lists it, and so each delete lowers the count once.
  const [removed, setRemoved] = useState<{
    activities: ReadonlySet<string>
    projects: ReadonlySet<string>
  }>({ activities: new Set(), projects: new Set() })
  const markRemoved = (k: "activities" | "projects", uri: string) =>
    setRemoved((prev) => ({ ...prev, [k]: new Set(prev[k]).add(uri) }))

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) router.replace("/welcome")
    else if (activeOrg) router.replace("/home")
  }, [authLoading, isAuthenticated, activeOrg, router])

  if (authLoading || !isAuthenticated || !did || activeOrg) {
    return (
      <div className="records-page">
        <div className="records-page__loading">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  // No count for Lists: the indexer's list count covers endorsement lists
  // only, while the pane also holds activity, project and account lists.
  const base: Record<RecordKind, number | null> = {
    activities: counts.certs,
    projects: counts.projects,
    // Keep the last count while a refetch runs (after endorse / remove).
    endorsements:
      given.isLoading && given.endorsements.length === 0 ? null : given.endorsements.length,
    following: following.isLoading && following.count === 0 ? null : following.count,
    followers: counts.followers,
    lists: null,
  }
  const countFor = (k: RecordKind): number | null => {
    const n = base[k]
    if (n === null) return null
    const gone = k === "activities" || k === "projects" ? removed[k].size : 0
    return Math.max(0, n - gone)
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
                    {key === "lists" ? null : n !== null || countsLoading ? (
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
            <ActivitiesPane
              did={did}
              actor={actor}
              removed={removed.activities}
              onDeleted={(uri) => markRemoved("activities", uri)}
            />
          ) : kind === "projects" ? (
            <ProjectsPane
              did={did}
              actor={actor}
              removed={removed.projects}
              onDeleted={(uri) => markRemoved("projects", uri)}
            />
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
