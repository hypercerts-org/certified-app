"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Compass, Plus, Users, UsersRound } from "lucide-react"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import IdentityRow from "@/components/ui/identity-row"
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs"
import NewEndorsementPanel from "@/components/endorsements/new-endorsement-panel"
import ProfileLists, { LIST_SECTIONS } from "@/components/profile/profile-lists"
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
  type TypedListType,
} from "@/lib/atproto/typed-lists"
import { useTypedLists } from "@/hooks/use-typed-lists"
import { profileUrl } from "@/lib/urls"
import { formatShortDate } from "@/lib/utils/format-date"
import ReceivedEndorsements, { isHiddenEndorsement } from "@/components/records/received-endorsements"
import GivenEndorsements from "@/components/records/given-endorsements"
import { GroupRows } from "@/components/home/home-sections"
import { useOrg } from "@/lib/groups/org-context"
import { PaneTabBar, RowsSkeleton } from "@/components/records/records-shared"
import { WorkspaceFrame } from "@/components/layout/workspace-shell"

type FollowingState = ReturnType<typeof useFollowing>
type GivenState = ReturnType<typeof useGivenEndorsements>

/**
 * Acting as a group, Endorsements and Followers show the group's own: the
 * pane's `did` is the group's DID (every read), and the writes go through
 * the signed-in person's session into the group's repo by the group
 * routes (`targetDid`, as on the group's profile).
 */
export interface PaneGroup {
  /** The group's display name, or its @handle. */
  name: string
  /** The signed-in person's DID: the writes are made through it. */
  sessionDid: string
  /** Owners and admins write as the group (`isManagingRole`); a member
   *  sees the same lists without the write controls, and a line why. */
  canWrite: boolean
}

/** A member acting as the group: why the pane has no write controls. */
function RoleNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="records-pane__note" role="note">
      {children}
    </p>
  )
}

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
 *
 * Acting as a group (`group`), the group's: received and given read for
 * its DID, Endorse someone and Revoke as the group, Hide / Show as the
 * group's responses; its endorsement lists read only (list writes are
 * personal). A member reads (`group.canWrite`).
 */
export function EndorsementsPane({
  did,
  actor,
  given,
  group,
}: {
  /** The account the pane shows: yours, or the group's. */
  did: string
  /** Its handle (or DID), for its profile link. */
  actor: string
  /** Its given endorsements (held by the page, shared with Overview). */
  given: GivenState
  /** Set while acting as a group. */
  group?: PaneGroup
}) {
  const titleId = useId()
  const [tabParam, setTabParam] = useUrlParam("tab", { defaultValue: "received" })
  const tab = parseTab(tabParam)
  const [panelOpen, setPanelOpen] = useState(false)
  // Writes: through your session; as a group, into its repo.
  const sessionDid = group?.sessionDid ?? did
  const targetDid = group ? did : undefined
  const canWrite = group?.canWrite ?? true
  // Hidden ones included: this is where you can show them again.
  const received = useReceivedEndorsements(did, { includeRejected: true })
  // The responses of the account shown: the group's while acting as one.
  const ownStates = useOwnResponseStates(group ? did : undefined)
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
  // holds that view's state. A group's lists are read only: list writes
  // go to your own repo.
  const lists = useEndorsementListsState(did)
  const listsEditable = !group
  // The panel opens on the Given tab, so from another tab the button
  // switches there first. It only opens: the panel's own Cancel is the
  // one way to close it, and pressing the button again while it is open
  // goes back to the panel's search field.
  const endorseOpen = panelOpen && tab === "given"
  const endorseButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const focusedRequestRef = useRef(0)
  const onEndorse = () => {
    if (tab !== "given") setTabParam("given")
    setPanelOpen(true)
    setFocusRequest((n) => n + 1)
  }
  // Once the panel is on screen (after the switch to Given, which goes
  // through the URL), its search field takes the focus.
  useEffect(() => {
    if (!endorseOpen || focusRequest === focusedRequestRef.current) return
    const field = panelRef.current?.querySelector<HTMLInputElement>("input")
    if (!field) return
    focusedRequestRef.current = focusRequest
    field.focus()
  }, [endorseOpen, focusRequest])
  // Closing removes the focused Cancel, so the focus goes back to the
  // button that opened the panel.
  const onPanelClose = () => {
    setPanelOpen(false)
    endorseButtonRef.current?.focus()
  }
  const endorseButton = (
    <Button ref={endorseButtonRef} variant="secondary" size="sm" onClick={onEndorse}>
      <Plus size={16} strokeWidth={1.75} aria-hidden />
      Endorse someone
    </Button>
  )

  return (
    <WorkspaceFrame titleId={titleId}>
      <section className="records-pane" aria-labelledby={titleId}>
        {group && !canWrite ? (
          <RoleNote>Only {group.name}&apos;s owners and admins can change its endorsements.</RoleNote>
        ) : null}
        <Tabs value={tab} onChange={(v) => setTabParam(v)}>
          <PaneTabBar
            actions={
              tab === "lists" && hasEndorsementListsToolbar(lists) ? (
                <>
                  <EndorsementListsToolbar state={lists} viewerIsOwner={listsEditable} />
                  {canWrite ? endorseButton : null}
                </>
              ) : canWrite ? (
                endorseButton
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
              {endorseOpen && canWrite ? (
                <div ref={panelRef}>
                  <NewEndorsementPanel
                    ownDid={sessionDid}
                    targetDid={targetDid}
                    groupName={group?.name}
                    existingSubjectDids={existing}
                    onClose={onPanelClose}
                    onCreated={given.refetch}
                  />
                </div>
              ) : null}
              {/* The same rows as Received, with Revoke per row. With the
                  panel open, "No endorsements given yet" would only repeat
                  it, so the empty state steps aside. */}
              <GivenEndorsements
                did={sessionDid}
                targetDid={targetDid}
                readOnly={!canWrite}
                groupName={group?.name}
                endorsements={given.endorsements}
                isLoading={given.isLoading}
                error={given.error}
                onRetry={given.refetch}
                hideEmpty={endorseOpen}
              />
            </div>
          </TabPanel>

          <TabPanel value="received">
            <div className="records-pane__tab-body">
              <ReceivedEndorsements
                did={sessionDid}
                targetDid={targetDid}
                readOnly={!canWrite}
                groupName={group?.name}
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
              {group ? (
                <p className="records-pane__note">Endorsement lists can&apos;t be made as a group yet.</p>
              ) : null}
              <EndorsementLists state={lists} viewerIsOwner={listsEditable} />
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
  const loading = isLoading && !info
  return (
    <li className="records-person">
      <div className="records-person__identity">
        {/* The row's link (avatar and name) takes the one hover tint,
            bleeding 8px past its text. */}
        <IdentityRow
          did={did}
          handle={info?.handle ?? undefined}
          displayName={info?.displayName ?? undefined}
          avatarUrl={info?.avatarUrl ?? undefined}
          href={profileUrl(info?.handle || did)}
          loading={loading}
          className={loading ? undefined : "hover-tint hover-tint--bleed"}
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
 *
 * Acting as a group (`group`), the group's: who follows it and whom it
 * follows, read for its DID; Follow and Unfollow write as the group (the
 * unfollow deletes the group's own follow record, found in its repo). A
 * member reads (`group.canWrite`).
 */
export function FollowersPane({
  did,
  actor,
  following,
  group,
}: {
  /** The account the pane shows: yours, or the group's. */
  did: string
  /** Its handle (or DID), for its profile link. */
  actor: string
  /** Whom it follows (held by the page, shared with Overview and Feed). */
  following: FollowingState
  /** Set while acting as a group. */
  group?: PaneGroup
}) {
  const titleId = useId()
  const [tabParam, setTabParam] = useUrlParam("tab", { defaultValue: "followers" })
  const tab = parsePeopleTab(tabParam)
  const followers = useFollowers(did)
  const writer: PeopleWriter = {
    sessionDid: group?.sessionDid ?? did,
    targetDid: group ? did : undefined,
    canWrite: group?.canWrite ?? true,
    groupName: group?.name,
  }

  return (
    <WorkspaceFrame titleId={titleId}>
      <section className="records-pane" aria-labelledby={titleId}>
        {group && !group.canWrite ? (
          <RoleNote>Only {group.name}&apos;s owners and admins can change whom it follows.</RoleNote>
        ) : null}
        <Tabs value={tab} onChange={(v) => setTabParam(v)}>
          <PaneTabBar
            actions={
              <Button href="/explore" variant="secondary" size="sm">
                <Compass size={16} strokeWidth={1.75} aria-hidden />
                Find accounts
              </Button>
            }
          >
          <TabList aria-label="Followers" className="records-pane__tablist">
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
          </PaneTabBar>

          <TabPanel value="followers">
            <div className="records-pane__tab-body">
              <FollowersList actor={actor} followers={followers} following={following} writer={writer} />
            </div>
          </TabPanel>

          <TabPanel value="following">
            <div className="records-pane__tab-body">
              <FollowingList following={following} writer={writer} />
            </div>
          </TabPanel>
        </Tabs>
      </section>
    </WorkspaceFrame>
  )
}

/** How the people lists write: through `sessionDid`, into the group's
 *  repo with `targetDid` (`createFollow` / `deleteFollow`'s group path). */
interface PeopleWriter {
  sessionDid: string
  targetDid?: string
  /** False: no Follow buttons (a member acting as the group). */
  canWrite: boolean
  /** Acting as a group: its name, for the copy. */
  groupName?: string
}

function FollowingList({ following, writer }: { following: FollowingState; writer: PeopleWriter }) {
  const { groupName } = writer
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
      <EmptyState
        variant="inline"
        title={groupName ? `Couldn't load whom ${groupName} follows.` : "Couldn't load who you follow."}
      >
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
        title={groupName ? `${groupName} isn't following anyone yet` : "You're not following anyone yet"}
        description={
          groupName
            ? "Accounts it follows show here, and what they publish shows in its feed."
            : "Follow accounts to see what they publish in your feed. Find them with Find accounts."
        }
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
              action={(name) =>
                writer.canWrite ? (
                  // Unfollow finds the follow record in the acting repo
                  // (the group's, with `targetDid`) and deletes that one.
                  <FollowButton
                    viewerDid={writer.sessionDid}
                    targetDid={writer.targetDid}
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
                ) : null
              }
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
  actor,
  followers,
  following,
  writer,
}: {
  actor: string
  followers: ReturnType<typeof useFollowers>
  following: FollowingState
  writer: PeopleWriter
}) {
  const [shown, setShown] = useState(PEOPLE_PAGE)
  const { groupName } = writer

  if (followers.isLoading && followers.entries.length === 0) return <RowsSkeleton shape="circle" />
  if (followers.error && followers.entries.length === 0) {
    return (
      <EmptyState
        variant="inline"
        title={groupName ? `Couldn't load ${groupName}'s followers.` : "Couldn't load your followers."}
      >
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
        description={
          groupName
            ? `When another account follows ${groupName}, it shows here.`
            : "When another account follows yours, it shows here."
        }
      >
        <Button href={profileUrl(actor)} variant="secondary" size="sm">
          {groupName ? "View its profile" : "View your profile"}
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
            action={(name) =>
              writer.canWrite ? (
                <FollowButton
                  viewerDid={writer.sessionDid}
                  targetDid={writer.targetDid}
                  subjectDid={f.followerDid}
                  subjectName={name}
                  isFollowing={following.subjects.has(f.followerDid)}
                  isLoading={following.isLoading}
                  onFollowed={(uri, cid) => following.addFollow(f.followerDid, uri, cid)}
                  onUnfollowed={() => following.removeFollow(f.followerDid)}
                />
              ) : null
            }
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
export type ListTab = (typeof LIST_TABS)[number]

function parseListTab(value: string | null): ListTab | null {
  return (LIST_TABS as readonly string[]).includes(value ?? "") ? (value as ListTab) : null
}

/**
 * The tab Lists opens on when the URL names none (the Overview's "N
 * Lists" lands here): the first one, in tab order, that has lists. A tab
 * still loading stops the walk (its own loading state shows); with no
 * lists anywhere, Activities.
 */
export function defaultListTab(counts: Record<ListTab, number | undefined>): ListTab {
  for (const t of LIST_TABS) {
    const n = counts[t]
    if (n === undefined || n > 0) return t
  }
  return "activities"
}

/** The typed-list tabs: the kind each one shows. */
const TYPED_LIST_TABS: Partial<Record<ListTab, TypedListType>> = {
  activities: LIST_CERTS_TYPE,
  projects: LIST_PROJECTS_TYPE,
  accounts: LIST_ACCOUNTS_TYPE,
}

/**
 * Lists, one tab per kind: activities, projects, accounts and endorsement
 * lists (which also stay under Endorsements), each with its count. The
 * tab lives in the URL (`?kind=lists&tab=projects`); with none there the
 * pane opens on the first tab that has lists (`defaultListTab`).
 * Switching tabs closes an open list (`?list=`).
 *
 * Each tab's "New … list" (and the endorsement lists' sort) sits on the
 * tab line, over the list of lists once there is one; with none, the
 * empty state carries it. So the pane holds the lists and the "New …
 * list" state the tabs show.
 */
export function ListsPane({ did }: { did: string }) {
  const titleId = useId()
  // "Try again" on a failed load remounts the tabs, which loads again.
  const [attempt, setAttempt] = useState(0)
  return (
    <WorkspaceFrame titleId={titleId}>
      <section className="records-pane" aria-labelledby={titleId}>
        <ListsTabs key={attempt} did={did} onRetry={() => setAttempt((n) => n + 1)} />
      </section>
    </WorkspaceFrame>
  )
}

function ListsTabs({ did, onRetry }: { did: string; onRetry: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const typed = useTypedLists(did)
  const [creating, setCreating] = useState<TypedListType | null>(null)
  const endorsementLists = useEndorsementListsState(did)
  // Left out while their lists load, as the other panes' counts are.
  const typedLoading = typed.isLoading && typed.lists.length === 0
  const endorsementData = endorsementLists.data
  const counts: Record<ListTab, number | undefined> = {
    activities: typedLoading ? undefined : typed.byType[LIST_CERTS_TYPE].length,
    projects: typedLoading ? undefined : typed.byType[LIST_PROJECTS_TYPE].length,
    accounts: typedLoading ? undefined : typed.byType[LIST_ACCOUNTS_TYPE].length,
    endorsements:
      endorsementData.isLoading && endorsementData.lists.length === 0
        ? undefined
        : endorsementData.lists.length,
  }
  const tab = parseListTab(params.get("tab")) ?? defaultListTab(counts)
  // Always written to the URL, so a picked tab stays picked whatever the
  // default would be.
  const selectTab = (next: string) => {
    const qs = new URLSearchParams(params.toString())
    qs.set("tab", next)
    qs.delete("list")
    endorsementLists.setOpenUri(null)
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
  }

  const typedType = TYPED_LIST_TABS[tab]
  const typedSection = LIST_SECTIONS.find((s) => s.type === typedType)
  const actions =
    tab === "endorsements" ? (
      hasEndorsementListsToolbar(endorsementLists) ? (
        <EndorsementListsToolbar state={endorsementLists} viewerIsOwner />
      ) : null
    ) : typedType && typedSection && !params.get("list") && typed.byType[typedType].length > 0 ? (
      <Button variant="secondary" size="sm" onClick={() => setCreating(typedType)}>
        <Plus size={16} strokeWidth={1.75} aria-hidden />
        New {typedSection.noun} list
      </Button>
    ) : null

  // The profile's list manager, one kind per tab, on the pane's lists; it
  // carries edit and delete, and "New … list" when there is none yet.
  const typedLists = (type: TypedListType) => (
    <ProfileLists
      did={did}
      viewerIsOwner
      only={type}
      source={typed}
      onRetry={onRetry}
      creating={creating}
      onCreatingChange={setCreating}
    />
  )

  return (
    <Tabs value={tab} onChange={selectTab}>
      <PaneTabBar actions={actions}>
        <TabList aria-label="Lists" className="records-pane__tablist">
          <Tab value="activities" count={counts.activities}>
            Activities
          </Tab>
          <Tab value="projects" count={counts.projects}>
            Projects
          </Tab>
          <Tab value="accounts" count={counts.accounts}>
            Accounts
          </Tab>
          <Tab value="endorsements" count={counts.endorsements}>
            Endorsements
          </Tab>
        </TabList>
      </PaneTabBar>

      <TabPanel value="activities">
        <div className="records-pane__tab-body">{typedLists(LIST_CERTS_TYPE)}</div>
      </TabPanel>
      <TabPanel value="projects">
        <div className="records-pane__tab-body">{typedLists(LIST_PROJECTS_TYPE)}</div>
      </TabPanel>
      <TabPanel value="accounts">
        <div className="records-pane__tab-body">{typedLists(LIST_ACCOUNTS_TYPE)}</div>
      </TabPanel>
      <TabPanel value="endorsements">
        <div className="records-pane__tab-body">
          <EndorsementLists state={endorsementLists} viewerIsOwner />
        </div>
      </TabPanel>
    </Tabs>
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
  const newGroup = (
    <Button href="/groups/create" variant="secondary" size="sm">
      <Plus size={16} strokeWidth={1.75} aria-hidden />
      New group
    </Button>
  )
  return (
    <WorkspaceFrame titleId={titleId}>
      <section className="records-pane" aria-labelledby={titleId}>
        {isLoading && groups.length === 0 ? (
          <RowsSkeleton shape="square" rows={3} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            headingLevel={2}
            title="You're not in any groups yet"
            description="A group is an account that several people manage together, like an organization or a team. Create one, or ask a group's admin to add you."
          >
            {newGroup}
          </EmptyState>
        ) : (
          <>
            {/* No tabs here: the count and New group make the pane's first
                row, on the line the other panes' tabs sit on. */}
            <div className="records-pane__headrow">
              <p className="records-pane__count">
                {groups.length === 1 ? "1 group" : `${groups.length} groups`}
              </p>
              {newGroup}
            </div>
            <GroupRows groups={groups} size="md" />
          </>
        )}
      </section>
    </WorkspaceFrame>
  )
}
