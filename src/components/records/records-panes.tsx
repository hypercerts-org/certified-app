"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import Button from "@/components/ui/button"
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs"
import NewEndorsementPanel from "@/components/endorsements/new-endorsement-panel"
import ProfileLists, { LIST_SECTIONS } from "@/components/profile/profile-lists"
import EndorsementLists, {
  EndorsementListsToolbar,
  hasEndorsementListsToolbar,
  useEndorsementListsState,
} from "@/components/profile/endorsement-lists"
import type { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useUrlParam } from "@/hooks/use-url-param"
import {
  LIST_ACCOUNTS_TYPE,
  LIST_CERTS_TYPE,
  LIST_PROJECTS_TYPE,
  type TypedListType,
} from "@/lib/atproto/typed-lists"
import { useTypedLists } from "@/hooks/use-typed-lists"
import { profileUrl } from "@/lib/urls"
import ReceivedEndorsements, { isHiddenEndorsement } from "@/components/records/received-endorsements"
import GivenEndorsements from "@/components/records/given-endorsements"
import { PaneTabBar } from "@/components/records/records-shared"
import { WorkspaceFrame } from "@/components/layout/workspace-shell"

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
