"use client"

import { useId, useMemo, useState } from "react"
import { Compass, Plus, Users } from "lucide-react"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import IdentityRow from "@/components/ui/identity-row"
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs"
import NewEndorsementPanel from "@/components/endorsements/new-endorsement-panel"
import { GivenList } from "@/components/profile/profile-endorsement-views"
import ProfileLists from "@/components/profile/profile-lists"
import EndorsementLists from "@/components/profile/endorsement-lists"
import { FollowButton } from "@/components/profile/profile-follow-endorse"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useFollowers } from "@/hooks/use-followers"
import type { useFollowing } from "@/hooks/use-following"
import type { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useUrlParam } from "@/hooks/use-url-param"
import type { FollowRecord } from "@/lib/atproto/follow"
import { profileUrl } from "@/lib/urls"
import { formatShortDate } from "@/lib/utils/format-date"
import ReceivedEndorsements from "@/components/records/received-endorsements"
import { PaneHead, RowsSkeleton } from "@/components/records/records-shared"

type FollowingState = ReturnType<typeof useFollowing>
type GivenState = ReturnType<typeof useGivenEndorsements>

/** People lists render in steps of this many rows. */
const PEOPLE_PAGE = 50
const EMPTY_SET: Set<string> = new Set()

// ------------------------------ Endorsements --------------------------------

const ENDORSEMENT_TABS = ["given", "received", "lists"] as const
type EndorsementsTab = (typeof ENDORSEMENT_TABS)[number]

function parseTab(value: string | null): EndorsementsTab {
  return (ENDORSEMENT_TABS as readonly string[]).includes(value ?? "")
    ? (value as EndorsementsTab)
    : "given"
}

/** A tab's count as quiet text (the Tab's `count` chip reads as a
 *  notification badge). Nothing while loading. */
function TabCount({ n }: { n: number | null }) {
  if (n === null) return null
  return <span className="records-tab-count">{n}</span>
}

/**
 * Endorsements given and received, and the lists of endorsed accounts.
 * The open tab lives in the URL (`?kind=endorsements&tab=received`).
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
  const [tabParam, setTabParam] = useUrlParam("tab", { defaultValue: "given" })
  const tab = parseTab(tabParam)
  const [panelOpen, setPanelOpen] = useState(false)
  // Hidden ones included: this is where you can show them again.
  const received = useReceivedEndorsements(did, { includeRejected: true })
  const ownStates = useOwnResponseStates()
  const existing = useMemo(
    () => new Set(given.endorsements.map((e) => e.subjectDid)),
    [given.endorsements],
  )

  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHead
        titleId={titleId}
        title="Endorsements"
        description="Endorsements you gave and received, and your lists of endorsed accounts."
        action={
          tab === "given" ? (
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen((v) => !v)}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              Endorse someone
            </Button>
          ) : null
        }
      />
      <Tabs value={tab} onChange={(v) => setTabParam(v)}>
        <TabList aria-label="Endorsements">
          <Tab value="given">
            Given
            <TabCount
              n={given.isLoading && given.endorsements.length === 0 ? null : given.endorsements.length}
            />
          </Tab>
          <Tab value="received">
            Received
            <TabCount
              n={received.isLoading && received.endorsements.length === 0 ? null : received.endorsements.length}
            />
          </Tab>
          <Tab value="lists">Lists</Tab>
        </TabList>

        <TabPanel value="given">
          <div className="records-pane__tab-body">
            {panelOpen ? (
              <NewEndorsementPanel
                ownDid={did}
                existingSubjectDids={existing}
                onClose={() => setPanelOpen(false)}
                onCreated={given.refetch}
              />
            ) : null}
            {given.isLoading && given.endorsements.length === 0 ? (
              <RowsSkeleton shape="circle" rows={4} />
            ) : (
              /* The profile's list view, with its remove action per row. */
              <GivenList
                visible={given.endorsements}
                total={given.endorsements.length}
                isLoading={false}
                error={given.error}
                onRetry={given.refetch}
                viewerIsOwner
                viewerDid={did}
                selectable={false}
                selected={EMPTY_SET}
                onToggleOne={() => {}}
                onAfterRevoke={given.refetch}
              />
            )}
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
            <EndorsementLists did={did} viewerIsOwner />
          </div>
        </TabPanel>
      </Tabs>
    </section>
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

export function FollowingPane({ did, following }: { did: string; following: FollowingState }) {
  const titleId = useId()
  const [shown, setShown] = useState(PEOPLE_PAGE)
  // Accounts unfollowed on this page keep their row (with a Follow button)
  // until the pane closes, so an accidental unfollow can be undone.
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

  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHead
        titleId={titleId}
        title="Following"
        description="Accounts you follow. What they publish shows in your feed."
        action={
          rows.length > 0 ? (
            <Button href="/explore" variant="secondary" size="sm">
              <Compass size={16} strokeWidth={1.75} aria-hidden />
              Find accounts
            </Button>
          ) : null
        }
      />
      {following.isLoading && rows.length === 0 ? (
        <RowsSkeleton shape="circle" />
      ) : following.error && rows.length === 0 ? (
        <EmptyState
          variant="inline"
          title="Couldn't load who you follow."
          description="Try again in a moment."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Compass}
          headingLevel={3}
          title="You're not following anyone yet"
          description="Follow accounts to see what they publish in your feed."
        >
          <Button href="/explore" variant="secondary" size="sm">
            Find accounts
          </Button>
        </EmptyState>
      ) : (
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
      )}
      {rows.length > shown ? <ShowMore onClick={() => setShown((n) => n + PEOPLE_PAGE)} /> : null}
    </section>
  )
}

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
  const followers = useFollowers(did)
  const [shown, setShown] = useState(PEOPLE_PAGE)

  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHead
        titleId={titleId}
        title="Followers"
        description="Accounts that follow you. A follow is the follower's record, so it can't be removed here; you can follow them back."
      />
      {followers.isLoading && followers.entries.length === 0 ? (
        <RowsSkeleton shape="circle" />
      ) : followers.error && followers.entries.length === 0 ? (
        <EmptyState
          variant="inline"
          title="Couldn't load your followers."
          description="Try again in a moment."
        >
          <button type="button" className="records-link" onClick={() => void followers.refetch()}>
            Try again
          </button>
        </EmptyState>
      ) : followers.entries.length === 0 ? (
        <EmptyState
          icon={Users}
          headingLevel={3}
          title="No followers yet"
          description="When another account follows yours, it shows here."
        >
          <Button href={profileUrl(actor)} variant="secondary" size="sm">
            View your profile
          </Button>
        </EmptyState>
      ) : (
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
      )}
      {followers.entries.length > shown ? (
        <ShowMore onClick={() => setShown((n) => n + PEOPLE_PAGE)} />
      ) : null}
    </section>
  )
}

// --------------------------------- Lists ------------------------------------

/** Lists of activities, projects and accounts (endorsement lists live
 *  under Endorsements). */
export function ListsPane({ did }: { did: string }) {
  const titleId = useId()
  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHead
        titleId={titleId}
        title="Lists"
        description="Your lists of activities, projects and accounts. Open a list to rename it, add to it or delete it."
      />
      {/* The profile's list manager, which carries create, edit and delete. */}
      <ProfileLists did={did} viewerIsOwner />
    </section>
  )
}
