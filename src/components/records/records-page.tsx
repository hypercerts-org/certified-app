"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FolderOpen, UsersRound } from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import PageHeader from "@/components/ui/page-header"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import { SeeAllLink } from "@/components/ui/section-header"
import WorkspaceShell, {
  WORKSPACE_SECTIONS,
  workspaceSectionLabel,
  type WorkspaceSection,
} from "@/components/layout/workspace-shell"
import { useSwitchActor } from "@/lib/groups/use-switch-actor"
import { ownProfileUrl } from "@/lib/urls"
import WorkPane from "@/components/records/work-pane"
import {
  EndorsementsPane,
  FollowersPane,
  GroupsPane,
  ListsPane,
} from "@/components/records/records-panes"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"
import { useFollowing } from "@/hooks/use-following"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { usePageTitle } from "@/lib/navbar-context"
import type { CollectionRecord } from "@/lib/atproto/collection"

/** The Workspace sections this page renders (the Overview is /home). */
type RecordKind = Exclude<WorkspaceSection, "overview">

const KINDS: readonly RecordKind[] = WORKSPACE_SECTIONS.map((s) => s.key).filter(
  (k): k is RecordKind => k !== "overview",
)

function parseKind(value: string | null): RecordKind {
  // The old Following section is now a tab of Followers.
  if (value === "following") return "followers"
  return (KINDS as readonly string[]).includes(value ?? "") ? (value as RecordKind) : "activities"
}

/**
 * `/records` — the Workspace sections that manage what the signed-in
 * person's account holds: projects with their activities (as folders),
 * endorsements given and received, followers and who they follow, lists,
 * and their groups. `?kind=` picks the section; Endorsements, Followers
 * and Lists have tabs (`&tab=`). The Workspace frame (`WorkspaceShell`)
 * carries the side list, shared with the Overview (`/home`).
 *
 * Each section opens with its own `<PageHeader>` and carries its own
 * create action (New activity and New project, Endorse someone, Find
 * accounts, New list, New group); the top bar's New is the global one.
 *
 * Personal account only: the sections write to the session DID's repo.
 * While acting as a group they point to the group's records on its
 * profile and offer to switch back.
 */
export default function RecordsPage() {
  const router = useRouter()
  const params = useSearchParams()
  const kindParam = params.get("kind")
  const kind = parseKind(kindParam)
  usePageTitle(workspaceSectionLabel(kind))
  const { isLoading: authLoading, isAuthenticated, did } = useAuth()
  const { handle } = useSession()
  const { activeOrg } = useOrg()
  const switchActor = useSwitchActor()
  // Bumped by the projects-and-activities pane's "Try again": remounts it
  // so both of its loads run again.
  const [workAttempt, setWorkAttempt] = useState(0)

  const following = useFollowing(did ?? null)
  const given = useGivenEndorsements(did ?? null)

  // Kept here (not in the panes) so they survive switching sections and
  // back while the indexer still lags: projects and activities deleted on
  // this page, and projects written on it (changed items, or new).
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

  const content = (() => {
    if (authLoading || !isAuthenticated || !did) {
      return (
        <div className="records-page__loading">
          <LoadingSpinner size="md" />
        </div>
      )
    }

    // Acting as a group: the sections stay in the side list and explain
    // themselves. The group's records live on its profile (the same target
    // as the Overview's "All records"); switching back is the way to manage
    // your own. Groups are a personal list.
    if (activeOrg) {
      const groupProfile = ownProfileUrl({ activeGroup: activeOrg })
      return (
        <>
          <PageHeader title={workspaceSectionLabel(kind)} />
          {kind === "groups" ? (
            <EmptyState
              icon={UsersRound}
              headingLevel={2}
              title="Your groups are on your personal account"
              description="Switch to your personal account to see the groups you belong to."
            >
              <Button variant="secondary" onClick={() => switchActor(null)}>
                Switch to personal account
              </Button>
            </EmptyState>
          ) : (
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
          )}
        </>
      )
    }

    const actor = handle || did
    switch (kind) {
      case "activities":
        return (
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
        )
      case "endorsements":
        return <EndorsementsPane did={did} actor={actor} given={given} />
      case "followers":
        return <FollowersPane did={did} actor={actor} following={following} />
      case "lists":
        return <ListsPane did={did} />
      case "groups":
        return <GroupsPane />
    }
  })()

  return (
    <WorkspaceShell current={kind} className="records-page">
      {content}
    </WorkspaceShell>
  )
}
