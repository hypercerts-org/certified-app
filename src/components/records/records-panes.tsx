"use client"

import { useId, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Compass, Plus, Users, UsersRound } from "lucide-react"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import IdentityRow from "@/components/ui/identity-row"
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs"
import NewEndorsementPanel from "@/components/endorsements/new-endorsement-panel"
import ProfileLists from "@/components/profile/profile-lists"
import EndorsementLists, {
  EndorsementListsToolbar,
  hasEndorsementListsToolbar,
  useEndorsementListsState,
} from "@/components/profile/endorsement-lists"
import { FollowButton } from "@/components/profile/profile-follow-endorse"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useFollowers } from "@/hooks/use-followers"
import type { useFollowing } from "@/hooks/use-following"
import type { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useUrlParam } from "@/hooks/use-url-param"
import type { FollowRecord } from "@/lib/atproto/follow"
import {
  LIST_ACCOUNTS_TYPE,
  LIST_CERTS_TYPE,
  LIST_PROJECTS_TYPE,
} from "@/lib/atproto/typed-lists"
import { profileUrl } from "@/lib/urls"
import { formatShortDate } from "@/lib/utils/format-date"
import ReceivedEndorsements, { isHiddenEndorsement } from "@/components/records/received-endorsements"
import GivenEndorsements from "@/components/records/given-endorsements"
import { GroupRows } from "@/components/home/home-sections"
import { useOrg } from "@/lib/groups/org-context"
import { PaneHead, PaneTabBar, RowsSkeleton } from "@/components/records/records-shared"
import { WorkspaceFrame } from "@/components/layout/workspace-shell"

type FollowingState = ReturnType<typeof useFollowing>
type GivenState = ReturnType<typeof useGivenEndorsements>

/** People lists render in steps of this many rows. */
const PEOPLE_PAGE = 50

// ------------------------------ Endorsements --------------------------------

const ENDORSEMENT_TABS = ["received", "given", "lists"] as const
type EndorsementsTab = (typeof ENDORSEMENT_TABS)[number]

function parseTab(value: string | null): EndorsementsTab {
  return (ENDORSEMENT_TABS as readonly string[]).includes(value ?? "")
    ? (value as EndorsementsTab)
    : "received"
}

/**
 * Endorsements received and given, and the lists of endorsed accounts.
 * Opens on Received; another tab lives in the URL
 * (`?kind=endorsements&tab=given`), and `&tab=received` still works.
 */
export function EndorsementsPane({
  did,
  actor,
  given,
}: {
  did: string
  actor: string
  given: GivenState
}) {
  const titleId = useId()
  const [tabParam, setTabParam] = useUrlParam("tab", { defaultValue: "received" })
  const tab = parseTab(tabParam)
  const [panelOpen, setPanelOpen] = useState(false)
  // Hidden ones included: this is where you can show them again.
  const received = useReceivedEndorsements(did, { includeRejected: true })
  const ownStates = useOwnResponseStates()
  // The count is the shown ones, the same number as the Overview and the
  // profile; hidden ones are named beside it ("3 · 1 hidden").
  const hiddenCount = received.endorsements.filter((e) => isHiddenEndorsement(e, ownStates)).length
  const shownCount = received.endorsements.length - hiddenCount
  const receivedCount =
    received.isLoading && received.endorsements.length === 0
      ? undefined
      : hiddenCount > 0
        ? `${shownCount} · ${hiddenCount} hidden`
        : shownCount
  const existing = useMemo(
    () => new Set(given.endorsements.map((e) => e.subjectDid)),
    [given.endorsements],
  )
  // The lists tab's sort and "New list" sit on the tab line, so the pane
  // holds that view's state.
  const lists = useEndorsementListsState(did)
  // The panel opens on the Given tab, so from another tab the button
  // switches there first.
  const endorseOpen = panelOpen && tab === "given"
  const onEndorse = () => {
    if (tab !== "given") {
      setTabParam("given")
      setPanelOpen(true)
    } else {
      setPanelOpen((v) => !v)
    }
  }

  return (
    <WorkspaceFrame
      offset={false}
      header={
        <PaneHead
          titleId={titleId}
          section="endorsements"
          action={
            <Button variant="secondary" size="sm" aria-expanded={endorseOpen} onClick={onEndorse}>
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              Endorse someone
            </Button>
          }
        />
      }
    >
      <section className="records-pane" aria-labelledby={titleId}>
        <Tabs value={tab} onChange={(v) => setTabParam(v)}>
          <PaneTabBar
            actions={
              tab === "lists" && hasEndorsementListsToolbar(lists) ? (
                <EndorsementListsToolbar state={lists} viewerIsOwner />
              ) : null
            }
          >
            <TabList aria-label="Endorsements" className="records-pane__tablist">
              {/* Received first: it is what the pane opens on. Counts are
                  left out while their list loads. */}
              <Tab value="received" count={receivedCount}>
                Received
              </Tab>
              <Tab
                value="given"
                count={given.isLoading && given.endorsements.length === 0 ? undefined : given.endorsements.length}
              >
                Given
              </Tab>
              <Tab value="lists">Endorsement lists</Tab>
            </TabList>
          </PaneTabBar>

          <TabPanel value="given">
            <div className="records-pane__tab-body">
              {endorseOpen ? (
                <NewEndorsementPanel
                  ownDid={did}
                  existingSubjectDids={existing}
                  onClose={() => setPanelOpen(false)}
                  onCreated={given.refetch}
                />
              ) : null}
              {/* The same rows as Received, with Revoke per row. */}
              <GivenEndorsements
                did={did}
                endorsements={given.endorsements}
                isLoading={given.isLoading}
                error={given.error}
                onRetry={given.refetch}
              />
            </div>
          </TabPanel>

          <TabPanel value="received">
            <div className="records-pane__tab-body">
              <ReceivedEndorsements
                did={did}
                profileHref={profileUrl(actor)}
                endorsements={received.endorsements}
                isLoading={received.isLoading}
                error={received.error}
                onRetry={() => void received.refetch()}
                ownStates={ownStates}
              />
            </div>
          </TabPanel>

          <TabPanel value="lists">
            <div className="records-pane__tab-body">
              <EndorsementLists state={lists} viewerIsOwner />
            </div>
          </TabPanel>
        </Tabs>
      </section>
    </WorkspaceFrame>
  )
}

// ------------------------------ People --------------------------------------

function PersonRow({
  did,
  since,
  action,
}: {
  did: string
  since: string
  /** Built with the person's name, for per-person button names. */
  action: (name: string) => React.ReactNode
}) {
  const { info, isLoading } = useAuthorInfo(did)
  const name = info?.displayName || (info?.handle ? `@${info.handle}` : did)
  return (
    <li className="records-person">
      <div className="records-person__identity">
        <IdentityRow
          did={did}
          handle={info?.handle ?? undefined}
          displayName={info?.displayName ?? undefined}
          avatarUrl={info?.avatarUrl ?? undefined}
          href={profileUrl(info?.handle || did)}
          loading={isLoading && !info}
        />
      </div>
      {since ? (
        <span className="records-person__since">Since {formatShortDate(since)}</span>
      ) : null}
      <div className="records-person__action">{action(name)}</div>
    </li>
  )
}

function ShowMore({ onClick }: { onClick: () => void }) {
  return (
    <div className="records-pane__more">
      <Button variant="secondary" size="sm" onClick={onClick}>
        Show more
      </Button>
    </div>
  )
}

const PEOPLE_TABS = ["followers", "following"] as const
type PeopleTab = (typeof PEOPLE_TABS)[number]

function parsePeopleTab(value: string | null): PeopleTab {
  return (PEOPLE_TABS as readonly string[]).includes(value ?? "")
    ? (value as PeopleTab)
    : "followers"
}

/**
 * Followers: the accounts that follow you and the accounts you follow, as
 * two tabs (like Endorsements: what others gave you first). Opens on
 * Followers; the other tab lives in the URL (`?kind=followers&tab=following`).
 */
export function FollowersPane({
  did,
  actor,
  following,
}: {
  did: string
  actor: string
  following: FollowingState
}) {
  const titleId = useId()
  const [tabParam, setTabParam] = useUrlParam("tab", { defaultValue: "followers" })
  const tab = parsePeopleTab(tabParam)
  const followers = useFollowers(did)

  return (
    <WorkspaceFrame
      offset={false}
      header={
        <PaneHead
          titleId={titleId}
          section="followers"
          action={
            <Button href="/explore" variant="secondary" size="sm">
              <Compass size={16} strokeWidth={1.75} aria-hidden />
              Find accounts
            </Button>
          }
        />
      }
    >
      <section className="records-pane" aria-labelledby={titleId}>
        <Tabs value={tab} onChange={(v) => setTabParam(v)}>
          <TabList aria-label="Followers">
            {/* Counts are left out while their list loads. */}
            <Tab
              value="followers"
              count={followers.isLoading && followers.entries.length === 0 ? undefined : followers.entries.length}
            >
              Followers
            </Tab>
            <Tab
              value="following"
              count={following.isLoading && following.count === 0 ? undefined : following.count}
            >
              Following
            </Tab>
          </TabList>

          <TabPanel value="followers">
            <div className="records-pane__tab-body">
              <FollowersList did={did} actor={actor} followers={followers} following={following} />
            </div>
          </TabPanel>

          <TabPanel value="following">
            <div className="records-pane__tab-body">
              <FollowingList did={did} following={following} />
            </div>
          </TabPanel>
        </Tabs>
      </section>
    </WorkspaceFrame>
  )
}

function FollowingList({ did, following }: { did: string; following: FollowingState }) {
  const [shown, setShown] = useState(PEOPLE_PAGE)
  // Accounts unfollowed on this page keep their row (with a Follow button)
  // until the tab closes, so an accidental unfollow can be undone.
  const [unfollowed, setUnfollowed] = useState<ReadonlyMap<string, FollowRecord>>(new Map())
  const rows = useMemo(() => {
    const bySubject = new Map<string, FollowRecord>()
    for (const r of following.records) {
      if (following.subjects.has(r.value.subject)) bySubject.set(r.value.subject, r)
    }
    for (const [subject, r] of unfollowed) {
      if (!bySubject.has(subject)) bySubject.set(subject, r)
    }
    return [...bySubject.values()].sort((a, b) =>
      a.value.createdAt < b.value.createdAt ? 1 : -1,
    )
  }, [following.records, following.subjects, unfollowed])

  if (following.isLoading && rows.length === 0) return <RowsSkeleton shape="circle" />
  if (following.error && rows.length === 0) {
    return (
      <EmptyState variant="inline" title="Couldn't load who you follow.">
        <Button variant="ghost" size="sm" onClick={() => void following.refetch()}>
          Try again
        </Button>
      </EmptyState>
    )
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Compass}
        headingLevel={2}
        title="You're not following anyone yet"
        description="Follow accounts to see what they publish in your feed. Find them with Find accounts."
      />
    )
  }
  return (
    <>
      <ul className="records-list">
        {rows.slice(0, shown).map((r) => {
          const subject = r.value.subject
          return (
            <PersonRow
              key={subject}
              did={subject}
              since={r.value.createdAt}
              action={(name) => (
                <FollowButton
                  viewerDid={did}
                  subjectDid={subject}
                  subjectName={name}
                  isFollowing={following.subjects.has(subject)}
                  isLoading={false}
                  onFollowed={(uri, cid) => {
                    following.addFollow(subject, uri, cid)
                    setUnfollowed((prev) => {
                      const next = new Map(prev)
                      next.delete(subject)
                      return next
                    })
                  }}
                  onUnfollowed={() => {
                    following.removeFollow(subject)
                    setUnfollowed((prev) => new Map(prev).set(subject, r))
                  }}
                />
              )}
            />
          )
        })}
      </ul>
      {rows.length > shown ? <ShowMore onClick={() => setShown((n) => n + PEOPLE_PAGE)} /> : null}
    </>
  )
}

/** A follow is the follower's record, so it can't be removed here; you
 *  can follow them back. */
function FollowersList({
  did,
  actor,
  followers,
  following,
}: {
  did: string
  actor: string
  followers: ReturnType<typeof useFollowers>
  following: FollowingState
}) {
  const [shown, setShown] = useState(PEOPLE_PAGE)

  if (followers.isLoading && followers.entries.length === 0) return <RowsSkeleton shape="circle" />
  if (followers.error && followers.entries.length === 0) {
    return (
      <EmptyState variant="inline" title="Couldn't load your followers.">
        <Button variant="ghost" size="sm" onClick={() => void followers.refetch()}>
          Try again
        </Button>
      </EmptyState>
    )
  }
  if (followers.entries.length === 0) {
    return (
      <EmptyState
        icon={Users}
        headingLevel={2}
        title="No followers yet"
        description="When another account follows yours, it shows here."
      >
        <Button href={profileUrl(actor)} variant="secondary" size="sm">
          View your profile
        </Button>
      </EmptyState>
    )
  }
  return (
    <>
      <ul className="records-list">
        {followers.entries.slice(0, shown).map((f) => (
          <PersonRow
            key={f.uri}
            did={f.followerDid}
            since={f.createdAt}
            action={(name) => (
              <FollowButton
                viewerDid={did}
                subjectDid={f.followerDid}
                subjectName={name}
                isFollowing={following.subjects.has(f.followerDid)}
                isLoading={following.isLoading}
                onFollowed={(uri, cid) => following.addFollow(f.followerDid, uri, cid)}
                onUnfollowed={() => following.removeFollow(f.followerDid)}
              />
            )}
          />
        ))}
      </ul>
      {followers.entries.length > shown ? (
        <ShowMore onClick={() => setShown((n) => n + PEOPLE_PAGE)} />
      ) : null}
    </>
  )
}

// --------------------------------- Lists ------------------------------------

const LIST_TABS = ["activities", "projects", "accounts", "endorsements"] as const
type ListTab = (typeof LIST_TABS)[number]

function parseListTab(value: string | null): ListTab {
  return (LIST_TABS as readonly string[]).includes(value ?? "")
    ? (value as ListTab)
    : "activities"
}

/**
 * Lists, one tab per kind: activities, projects, accounts and endorsement
 * lists (which also stay under Endorsements). Each tab has its own "New
 * list". The tab lives in the URL (`?kind=lists&tab=projects`); switching
 * tabs closes an open list (`?list=`).
 */
export function ListsPane({ did }: { did: string }) {
  const titleId = useId()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const tab = parseListTab(params.get("tab"))
  // The endorsement lists' sort and "New list" sit on the tab line, so
  // the pane holds that view's state.
  const endorsementLists = useEndorsementListsState(did)
  const selectTab = (next: string) => {
    const qs = new URLSearchParams(params.toString())
    if (next === "activities") qs.delete("tab")
    else qs.set("tab", next)
    qs.delete("list")
    endorsementLists.setOpenUri(null)
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
  }

  return (
    <WorkspaceFrame offset={false} header={<PaneHead titleId={titleId} section="lists" />}>
      <section className="records-pane" aria-labelledby={titleId}>
        <Tabs value={tab} onChange={selectTab}>
          <PaneTabBar
            actions={
              tab === "endorsements" && hasEndorsementListsToolbar(endorsementLists) ? (
                <EndorsementListsToolbar state={endorsementLists} viewerIsOwner />
              ) : null
            }
          >
            <TabList aria-label="Lists" className="records-pane__tablist">
              <Tab value="activities">Activities</Tab>
              <Tab value="projects">Projects</Tab>
              <Tab value="accounts">Accounts</Tab>
              <Tab value="endorsements">Endorsements</Tab>
            </TabList>
          </PaneTabBar>

          {/* The profile's list manager, one kind per tab; it carries
              create, edit and delete. */}
          <TabPanel value="activities">
            <div className="records-pane__tab-body">
              <ProfileLists did={did} viewerIsOwner only={LIST_CERTS_TYPE} />
            </div>
          </TabPanel>
          <TabPanel value="projects">
            <div className="records-pane__tab-body">
              <ProfileLists did={did} viewerIsOwner only={LIST_PROJECTS_TYPE} />
            </div>
          </TabPanel>
          <TabPanel value="accounts">
            <div className="records-pane__tab-body">
              <ProfileLists did={did} viewerIsOwner only={LIST_ACCOUNTS_TYPE} />
            </div>
          </TabPanel>
          <TabPanel value="endorsements">
            <div className="records-pane__tab-body">
              <EndorsementLists state={endorsementLists} viewerIsOwner />
            </div>
          </TabPanel>
        </Tabs>
      </section>
    </WorkspaceFrame>
  )
}

// --------------------------------- Groups -----------------------------------

/**
 * Every group the account belongs to, with your role in each: open its
 * profile, or switch to act as it. Home's "Your groups" shows the first
 * few and links here.
 */
export function GroupsPane() {
  const titleId = useId()
  const { groups, isLoading } = useOrg()
  return (
    <WorkspaceFrame
      offset={false}
      header={
        <PaneHead
          titleId={titleId}
          section="groups"
          action={
            <Button href="/groups/create" variant="secondary" size="sm">
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              New group
            </Button>
          }
        />
      }
    >
      <section className="records-pane" aria-labelledby={titleId}>
        {isLoading && groups.length === 0 ? (
          <RowsSkeleton shape="square" rows={3} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            headingLevel={2}
            title="You're not in any groups yet"
            description="A group is an account that several people manage together, like an organisation or a team. Create one, or ask a group's admin to add you."
          />
        ) : (
          <GroupRows groups={groups} />
        )}
      </section>
    </WorkspaceFrame>
  )
}
