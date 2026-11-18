"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, UsersRound } from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import { SeeAllLink } from "@/components/ui/section-header"
import WorkspaceShell, {
  WorkspaceFrame,
  workspaceSectionLabel,
  type WorkspaceSection,
} from "@/components/layout/workspace-shell"
import {
  isFollowersKind,
  parseRecordKind,
  WORKSPACE_SECTIONS,
  type RecordKind,
} from "@/lib/layout/nav-items"
import { useSwitchActor } from "@/lib/groups/use-switch-actor"
import { isManagingRole } from "@/lib/groups/managed"
import { ownProfileUrl } from "@/lib/urls"
import WorkPane from "@/components/records/work-pane"
import {
  EndorsementsPane,
  GroupsPane,
  ListsPane,
  type PaneGroup,
} from "@/components/records/records-panes"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { usePageTitle } from "@/lib/navbar-context"
import type { CollectionRecord } from "@/lib/atproto/collection"

/**
 * Acting as a group, Projects and activities and Lists say in one
 * sentence where the group's own records of that kind are (naming the
 * group), and link to those tabs of its profile (`?tab=` keys of the
 * profile page). Endorsements shows the group's own (its pane, read for
 * its DID and written as the group); Groups is a personal list and has
 * its own state.
 */
const GROUP_SECTIONS: Record<
  Exclude<RecordKind, "groups" | "endorsements">,
  {
    /** What shows on the profile, after the group's name. */
    what: string
    description?: string
    links: { tab: string; label: string }[]
  }
> = {
  activities: {
    what: "projects and activities",
    description: "What you create here is published as the group.",
    links: [
      { tab: "activities", label: "Open activities" },
      { tab: "projects", label: "Open projects" },
    ],
  },
  lists: {
    what: "lists",
    links: [{ tab: "lists", label: "Open lists" }],
  },
}

/** "Estuary Alliance's endorsements show on its profile". */
export function groupSectionTitle(groupName: string, what: string): string {
  return `${groupName}'s ${what} show on its profile`
}

/**
 * `/records` — the Workspace sections that manage what the signed-in
 * person's account holds: projects with their activities (as folders),
 * endorsements given and received, lists, and their groups. `?kind=` picks
 * the section; Endorsements and Lists have tabs (`&tab=`). Followers and
 * who the account follows are on its profile: the old `?kind=followers`
 * (and `?kind=following`) links go to that tab of the profile of the
 * account you act as. The Workspace frame (`WorkspaceShell`
 * and `WorkspaceFrame`), shared with the Overview (`/home`), puts the
 * section's title over it; the navigation lists the sections.
 *
 * Each section carries its own create action in its tab row
 * (New activity and New project, Endorse someone, Find accounts, New
 * list, New group); the top bar's New is the global one.
 *
 * The sections write to the session DID's repo. While acting as a group,
 * Endorsements shows the group's own (read for its DID; owners and admins
 * endorse, revoke and hide as the group through the group routes, a member
 * reads); the other sections say
 * where the group's records of their kind are (that tab of the group's
 * profile) and offer to switch back; Projects and activities still
 * creates, as the group.
 */
export default function RecordsPage() {
  const router = useRouter()
  const params = useSearchParams()
  const kindParam = params.get("kind")
  const kind = parseRecordKind(kindParam)
  usePageTitle(workspaceSectionLabel(kind))
  const { isLoading: authLoading, isAuthenticated, did } = useAuth()
  const { handle } = useSession()
  const { activeOrg } = useOrg()
  const switchActor = useSwitchActor()
  // Bumped by the projects-and-activities pane's "Try again": remounts it
  // so both of its loads run again.
  const [workAttempt, setWorkAttempt] = useState(0)

  // The account the sections show: you, or the group you act as (its
  // given endorsements, read for its DID).
  const accountDid = activeOrg?.groupDid ?? did ?? null
  const given = useGivenEndorsements(accountDid)

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

  // Followers moved to the profile: old links to the Followers (or
  // Following) section open that tab of the profile of the account you
  // act as, once it is known.
  const toFollowers = isFollowersKind(kindParam)
  const following = kindParam === "following" || params.get("tab") === "following"
  const followersTarget =
    activeOrg || handle || did
      ? `${ownProfileUrl({ activeGroup: activeOrg, personalHandle: handle, personalDid: did })}?tab=followers${following ? "&sub=following" : ""}`
      : null
  useEffect(() => {
    if (toFollowers && isAuthenticated && followersTarget) router.replace(followersTarget)
  }, [toFollowers, isAuthenticated, followersTarget, router])

  // Every state renders the Workspace frame (side list, content, the
  // page's h1): the panes with their actions, the states below without.
  const content = (() => {
    // While auth resolves (also on the server) and while the signed-out
    // redirect runs: the side list and a spinner.
    if (authLoading || !isAuthenticated || !did || toFollowers) {
      return (
        <WorkspaceFrame>
          <div className="records-page__loading">
            <LoadingSpinner size="md" />
          </div>
        </WorkspaceFrame>
      )
    }

    // Acting as a group: Endorsements is the group's own, keyed on it so
    // switching groups starts the pane afresh. The other
    // sections explain themselves: where the group's records of that kind
    // are (a tab of its profile, linked), and the way back to your own.
    // Groups are a personal list.
    if (activeOrg) {
      const groupName = activeOrg.displayName?.trim() || `@${activeOrg.handle}`
      if (kind === "endorsements") {
        const group: PaneGroup = {
          name: groupName,
          sessionDid: did,
          canWrite: isManagingRole(activeOrg.role),
        }
        return (
          <EndorsementsPane
            key={activeOrg.groupDid}
            did={activeOrg.groupDid}
            actor={activeOrg.handle || activeOrg.groupDid}
            given={given}
            group={group}
          />
        )
      }
      const groupProfile = ownProfileUrl({ activeGroup: activeOrg })
      if (kind === "groups") {
        return (
          <WorkspaceFrame>
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
          </WorkspaceFrame>
        )
      }
      const section = GROUP_SECTIONS[kind]
      const icon = WORKSPACE_SECTIONS.find((s) => s.key === kind)?.icon
      return (
        <WorkspaceFrame>
          <EmptyState
            icon={icon}
            headingLevel={2}
            title={groupSectionTitle(groupName, section.what)}
            description={section.description}
          >
            <div className="records-group">
              {/* Creating lives in the Workspace (there is no global New),
                  so a group creates from here; /create and /project/new
                  publish as the account you act as. New activity is the
                  walk-through's "Create from your Workspace" step here
                  (WorkPane's button carries it otherwise). */}
              {kind === "activities" ? (
                <div className="records-group__actions">
                  <Button variant="primary" href="/create" data-tour="records-new">
                    <Plus size={16} strokeWidth={1.75} aria-hidden />
                    New activity
                  </Button>
                  <Button variant="secondary" href="/project/new">
                    <Plus size={16} strokeWidth={1.75} aria-hidden />
                    New project
                  </Button>
                </div>
              ) : null}
              <div className="records-group__links">
                {section.links.map((l) => (
                  <SeeAllLink key={l.tab} href={`${groupProfile}?tab=${l.tab}`} label={l.label} />
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => switchActor(null)}>
                Switch to personal account
              </Button>
            </div>
          </EmptyState>
        </WorkspaceFrame>
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
