"use client"

import { useMemo, useRef, useState } from "react"
import { profileUrl, recordUrl, recordUrlFromAtUri } from "@/lib/urls"
import { usePageTitle, useRegisterPageHeader } from "@/lib/navbar-context"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import DeleteRecordDialog from "@/components/ui/delete-record-dialog"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { authFetch } from "@/lib/auth/fetch"
import { toUserErrorMessage } from "@/lib/utils/api"
import { Inbox, Pencil } from "lucide-react"
import CertLocationsMap from "@/components/feed/cert-locations-map"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import { FactCard, FactList, type Fact } from "@/components/ui/fact-card"
import SectionHeader, { SeeAllLink } from "@/components/ui/section-header"
import ShareLinkButton from "@/components/ui/share-link-button"
import Skeleton from "@/components/ui/skeleton"
import { TabPanelTransition } from "@/components/ui/tab-panel-transition"
import { PROJECT_DETAIL_TABS, visibleDetailTabs } from "@/lib/detail-tabs"
import { isRenderableDescription } from "@/components/leaflet/leaflet-document"
import AddToListMenu from "@/components/lists/add-to-list-menu"
import { LIST_PROJECTS_TYPE } from "@/lib/atproto/typed-lists"
import ContextUpdates from "@/components/context/context-updates"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useProjectItems } from "@/hooks/use-project-items"
import { useContextUpdates } from "@/hooks/use-context-updates"
import { useLocations } from "@/hooks/use-location"
import { useFitsViewport } from "@/hooks/use-fits-viewport"
import { useMediaQuery, WIDE_RECORD_LAYOUT } from "@/hooks/use-media-query"
import {
  RecordByline,
  RecordDescription,
  RecordHeader,
  RecordImage,
  RecordOwnerCard,
  RecordSectionTabs,
} from "@/components/feed/cert-detail-parts"
import ProjectActivityCard from "@/components/project/project-activity-card"
import {
  FundingFactCard,
  RecordFundingSection,
  useRecordFundingFlow,
  useRecordFundingView,
} from "@/components/funding/record-funding"
import { useScrollTopOnTabChange } from "@/hooks/use-scroll-top-on-tab-change"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { locationLabel } from "@/lib/atproto/location-label"
import { withoutLeadParagraph } from "@/lib/leaflet/strip-lead"
import { formatPeriodShort, formatShortDate } from "@/lib/utils/format-date"
import {
  asString,
  projectImage,
  projectTitle,
  type CollectionValue,
} from "@/lib/atproto/collection"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

/** Activities shown on Overview; "See all" opens the Activities tab. */
const OVERVIEW_ACTIVITY_PREVIEW = 4
/** Activities whose funding a project's total takes in. */
const MAX_FUNDED_ACTIVITIES = 25

const ACTIVITY_NSID = "org.hypercerts.claim.activity"

interface ProjectDetailProps {
  did: string
  rkey: string
  value: CollectionValue
  /** CID of the record at read time (the list strongRef). */
  cid: string
  /** Resolved handle of the author. */
  handle: string | null
}

type ProjectTab = "overview" | "activities" | "funding" | "updates"

/** The activity URIs in a project's `items`, in order, read from the
 *  record itself (no fetch), so the funding read can start at once. */
function activityUris(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  const out: string[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const obj = item as { uri?: unknown; itemIdentifier?: { uri?: unknown } }
    const uri =
      typeof obj.itemIdentifier?.uri === "string"
        ? obj.itemIdentifier.uri
        : typeof obj.uri === "string"
          ? obj.uri
          : null
    if (uri && uri.includes(`/${ACTIVITY_NSID}/`) && !out.includes(uri)) out.push(uri)
  }
  return out
}

/**
 * Detail view for a single `org.hypercerts.collection` project record,
 * laid out like the activity page (one record layout, cert-detail.css):
 *
 *   - the header: the banner (or the first activity's photo), "Project",
 *     the title as the page's h1 with Share and ⋯ at its right, a byline
 *     (who, when, where) and the summary as the lead;
 *   - the rail of facts (from 1100px beside the content, sticky when it
 *     fits; on phones under the header, on Overview): funding, who's
 *     behind it, the location, details;
 *   - the tabs, only those with something in them: Overview (the
 *     description in place, the activities as cards, the latest update),
 *     Activities, Funding and Updates.
 *
 * The project's funding is every receipt for the project and for its
 * activities (each receipt has one `for`, so nothing is counted twice).
 * Editing happens on the edit page (`/{actor}/project/{rkey}/edit`).
 */
export default function ProjectDetail({
  did,
  rkey,
  value,
  cid,
}: ProjectDetailProps) {
  // Edit eligibility mirrors the activity page.
  const { did: sessionDid } = useAuth()
  const { activeOrg, groups, switchOrg } = useOrg()
  const canEditAsActiveOrg =
    !!activeOrg &&
    activeOrg.groupDid === did &&
    (activeOrg.role === "owner" || activeOrg.role === "admin")
  // When acting as a group, only group-owned projects are editable; the
  // personal-edit branch only fires when no group is active.
  const isOwner = activeOrg
    ? canEditAsActiveOrg
    : !!sessionDid && sessionDid === did
  // Group-edit affordance: the viewer is NOT a direct owner, but they ARE
  // an owner/admin of the group that owns this project while signed in
  // under a different identity. Their Edit button, on confirm, switches
  // them into the owning group before opening the editor.
  const editAsGroup = isOwner
    ? null
    : groups.find(
        (g) =>
          g.groupDid === did &&
          (g.role === "owner" || g.role === "admin"),
      ) ?? null
  const editAsGroupLabel = editAsGroup
    ? editAsGroup.displayName || editAsGroup.handle
    : null
  const canManage = isOwner || !!editAsGroup
  const [groupEditOpen, setGroupEditOpen] = useState(false)
  const editHref = `${recordUrl(did, "project", rkey ?? "")}/edit`
  const recordUri = `at://${did}/org.hypercerts.collection/${rkey}`

  const title = projectTitle(value)
  const shortDesc = asString(value.shortDescription)
  // The description, less a first paragraph that repeats the lead.
  const description = useMemo(
    () => withoutLeadParagraph(value.description, shortDesc),
    [value.description, shortDesc],
  )
  const showFullDescription = isRenderableDescription(description)

  // Section tabs write `?tab=`; read it here and render that slice.
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get("tab") ?? "overview"
  // Old links keep working: ?tab=certs opens Activities, and
  // ?tab=description (the former Description tab) opens Overview.
  const normalizedTab = tabParam === "certs" ? "activities" : tabParam
  const activeTab: ProjectTab =
    normalizedTab === "activities" ||
    normalizedTab === "funding" ||
    normalizedTab === "updates"
      ? normalizedTab
      : "overview"

  // On mobile, reset to the top when switching sub-tabs so the tab's
  // first rows aren't left hidden behind the fixed navbar.
  useScrollTopOnTabChange(activeTab)

  // The project title is the page's h1 on every tab (the record header),
  // so the page registers its header and the chrome renders no h1 of its
  // own. The navbar (document) title stays the project's name.
  useRegisterPageHeader()
  usePageTitle(title || "Project")

  /** A URL to another tab on this page, keeping any other query params. */
  const tabHref = (tab: ProjectTab): string | null => {
    if (!pathname) return null
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (tab === "overview") params.delete("tab")
    else params.set("tab", tab)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  // ----- Activities -----
  const { resolutions, isLoading: itemsLoading } = useProjectItems(value.items)
  const resolvedActivities = useMemo<ActivityRecord[]>(
    () =>
      resolutions
        .map((r) => r.record)
        .filter((r): r is ActivityRecord => r != null),
    [resolutions],
  )
  const didByUri = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>()
    for (const r of resolutions) {
      if (r.record && r.did) m.set(r.record.uri, r.did)
    }
    return m
  }, [resolutions])
  const itemCount = Array.isArray(value.items) ? value.items.length : 0
  const activityCount = Math.max(resolutions.length, itemCount)

  // ----- Picture: the banner, else the first activity's photo -----
  const rawBanner = projectImage(value, "banner")
  const bannerUrl = rawBanner ? resolveActivityImageUrl(rawBanner, did) : null
  const firstWithImage = resolvedActivities.find((a) => a.value.image)
  const fallbackImage = firstWithImage
    ? resolveActivityImageUrl(
        firstWithImage.value.image,
        didByUri.get(firstWithImage.uri) ?? did,
      )
    : null
  const imageUrl = bannerUrl ?? fallbackImage

  // ----- When: the project's own dates (legacy records), else the span
  // of its activities' -----
  const raw = value as Record<string, unknown>
  const ownStart = asString(raw.startDate as unknown)
  const ownEnd = asString(raw.endDate as unknown)
  const span = useMemo(() => {
    let start: string | null = null
    let end: string | null = null
    for (const a of resolvedActivities) {
      const s = a.value.startDate
      const e = a.value.endDate
      if (s && (!start || s < start)) start = s
      if (e && (!end || e > end)) end = e
    }
    return { start, end }
  }, [resolvedActivities])
  const period =
    ownStart || ownEnd
      ? formatPeriodShort(ownStart, ownEnd)
      : formatPeriodShort(span.start, span.end)

  // ----- Where: `location` persists as a strongRef to an
  // `app.certified.location` record; a legacy inline string is a name. -----
  const rawLocation = raw.location
  const inlineLocation = asString(rawLocation)
  const locationRef =
    rawLocation && typeof rawLocation === "object"
      ? (rawLocation as { uri?: unknown; cid?: unknown })
      : null
  const locationRefUri =
    typeof locationRef?.uri === "string" ? locationRef.uri : null
  const locationRefCid =
    typeof locationRef?.cid === "string" ? locationRef.cid : ""
  const locationStrongRefs = useMemo(
    () => (locationRefUri ? [{ uri: locationRefUri, cid: locationRefCid }] : []),
    [locationRefUri, locationRefCid],
  )
  const { locations: locationRecords, isLoading: placeLoading } = useLocations(
    locationRefUri ? [locationRefUri] : [],
  )
  const place = locationRefUri
    ? placeLoading
      ? undefined
      : locationLabel(locationRecords[0])
    : inlineLocation || null

  // ----- Funding: the project's receipts and its activities' -----
  const fundingUris = useMemo(
    () => [recordUri, ...activityUris(value.items).slice(0, MAX_FUNDED_ACTIVITIES)],
    [recordUri, value.items],
  )
  const funding = useRecordFundingView(fundingUris, recordUri)
  const fundingFlow = useRecordFundingFlow({
    recordDid: did,
    uri: recordUri,
    cid,
    title: title || undefined,
    receipts: funding.all,
    refetch: funding.refetch,
    isLoading: funding.isLoading,
    kind: "project",
  })
  const fundingMixed = funding.all.some((r) => r.forUri && r.forUri !== recordUri)

  // ----- Updates -----
  const { updates } = useContextUpdates(recordUri)

  // Tabs a visitor would find something on; an owner also gets the empty
  // ones they can fill.
  const tabs = visibleDetailTabs(
    PROJECT_DETAIL_TABS,
    {
      activities: activityCount > 0 || canManage,
      funding: funding.all.length > 0 || fundingFlow.canRecord,
      updates: updates.length > 0 || canManage,
    },
    activeTab,
  )

  // ----- Destructive delete -----
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const handleDeleteConfirm = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const useGroupRoute = canEditAsActiveOrg
      const res = await authFetch(
        useGroupRoute
          ? `/api/groups/${encodeURIComponent(did)}/project`
          : "/api/xrpc/com/atproto/repo/deleteRecord",
        {
          method: useGroupRoute ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            useGroupRoute
              ? { rkey }
              : {
                  repo: did,
                  collection: "org.hypercerts.collection",
                  rkey,
                },
          ),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          toUserErrorMessage(
            res.status,
            (data as { error?: string }).error,
            "Couldn't delete this project. Try again",
          ),
        )
      }
      // Hard navigation (window.location) instead of router.push so
      // client-side caches on the destination page don't leave the
      // just-deleted project in its lists.
      if (typeof window !== "undefined") {
        window.location.href = profileUrl(did)
      } else {
        router.push(profileUrl(did))
      }
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Couldn't delete this project. Try again.",
      )
      setIsDeleting(false)
    }
  }

  // The record's actions at the header's top-right: Share for everyone
  // (deep-linking the open tab), the owner's Edit, then the ⋯ menu.
  const sharePath = (() => {
    const base = recordUrlFromAtUri(recordUri) ?? recordUrl(did, "project", rkey)
    return activeTab === "overview" ? base : `${base}?tab=${activeTab}`
  })()
  const recordActions = (
    <>
      <ShareLinkButton path={sharePath} what="Project link" />
      {isOwner ? (
        <Button href={editHref} variant="secondary" size="sm" aria-label="Edit project">
          <Pencil size={14} strokeWidth={1.75} aria-hidden />
          Edit
        </Button>
      ) : editAsGroup ? (
        <Button
          variant="secondary"
          size="sm"
          aria-label="Edit project"
          tooltip={`Edit as ${editAsGroupLabel}`}
          onClick={() => setGroupEditOpen(true)}
        >
          <Pencil size={14} strokeWidth={1.75} aria-hidden />
          Edit
        </Button>
      ) : null}
      <AddToListMenu
        targetUri={recordUri}
        targetCid={cid}
        targetType={LIST_PROJECTS_TYPE}
        showShare={false}
        editActions={
          isOwner
            ? {
                isCreator: true,
                editHref,
                editAsGroupLabel: null,
                onEditAsGroup: () => setGroupEditOpen(true),
                onDelete: () => {
                  setDeleteError(null)
                  setDeleteOpen(true)
                },
              }
            : null
        }
      />
    </>
  )

  // ----- The rail -----
  const createdAt = asString(value.createdAt)
  const details: Fact[] = []
  if (period) details.push({ label: "Time period", value: period })
  if (activityCount > 0) {
    details.push({
      label: "Activities",
      value: activityCount.toLocaleString("en-US"),
    })
  }
  if (createdAt) {
    details.push({
      label: "Published",
      value: <time dateTime={createdAt}>{formatShortDate(createdAt)}</time>,
    })
  }
  // From 1100px every card is in the rail. Below, the funding card leads
  // (under the header, on Overview) and the rest follow the Overview's
  // content, so the tabs aren't pushed below a screen of facts.
  const wide = useMediaQuery(WIDE_RECORD_LAYOUT)
  const railRef = useRef<HTMLElement | null>(null)
  const railFits = useFitsViewport(railRef, 96)
  // The Funding tab leads with the same figures, so the card steps aside.
  const leadCards =
    activeTab === "funding" ? null : (
      <FundingFactCard view={funding} href={tabHref("funding")} />
    )
  const moreCards = (
    <>
      <RecordOwnerCard did={did} />
      {locationRefUri ? (
        <FactCard title="Location">
          <CertLocationsMap locations={locationStrongRefs} height={200} />
        </FactCard>
      ) : null}
      {details.length > 0 ? (
        <FactCard title="Details">
          <FactList facts={details} />
        </FactCard>
      ) : null}
    </>
  )
  const rail = wide ? (
    <aside
      ref={railRef}
      className="record-layout__rail"
      aria-label="About this project"
      data-sticky={railFits ? "true" : undefined}
    >
      {leadCards}
      {moreCards}
    </aside>
  ) : activeTab === "overview" ? (
    <div className="record-layout__lead">{leadCards}</div>
  ) : null
  const moreAfter =
    !wide && activeTab === "overview" ? (
      <aside className="record-layout__more" aria-label="About this project">
        {moreCards}
      </aside>
    ) : null

  // ----- The activities, as cards -----
  const activitiesLoading = (
    <div className="record-work-grid" role="status" aria-label="Loading activities">
      <Skeleton variant="box" width="100%" height="14rem" />
      <Skeleton variant="box" width="100%" height="14rem" />
    </div>
  )
  const activityCards = (list: ActivityRecord[]) =>
    list.length === 1 ? (
      <ProjectActivityCard
        record={list[0]}
        did={didByUri.get(list[0].uri) ?? did}
        layout="wide"
      />
    ) : (
      <ul className="record-work-grid">
        {list.map((rec) => (
          <li key={rec.uri}>
            <ProjectActivityCard record={rec} did={didByUri.get(rec.uri) ?? did} />
          </li>
        ))}
      </ul>
    )
  const activitiesHref = tabHref("activities")

  return (
    <>
      <article className={`record-page record-layout record-layout--tab-${activeTab}`}>
        <RecordHeader
          image={<RecordImage src={imageUrl} ratio="3 / 1" />}
          eyebrow="Project"
          title={title}
          actions={recordActions}
          byline={<RecordByline did={did} period={period} place={place} />}
          lead={shortDesc}
        />

        {rail}

        {/* A strip of one tab says nothing: Overview alone has none. */}
        {tabs.length > 1 ? (
          <RecordSectionTabs
            tabs={tabs}
            activeKey={activeTab}
            ariaLabel="Project sections"
            counts={{
              activities: activityCount,
              funding: funding.summary.gifts,
              updates: updates.length,
            }}
          />
        ) : null}

        <TabPanelTransition
          className="record-layout__main"
          activeKey={activeTab}
          order={PROJECT_DETAIL_TABS.map((t) => t.key)}
        >
          {activeTab === "overview" ? (
            <>
              {showFullDescription ? (
                <RecordDescription value={description} did={did} />
              ) : null}

              {activityCount > 0 ? (
                <section className="record-section" aria-labelledby="project-activities">
                  <SectionHeader
                    id="project-activities"
                    title={activityCount === 1 ? "Activity" : "Activities"}
                    action={
                      activitiesHref && resolvedActivities.length > OVERVIEW_ACTIVITY_PREVIEW ? (
                        <SeeAllLink href={activitiesHref} label="All activities" />
                      ) : null
                    }
                  />
                  {itemsLoading && resolvedActivities.length === 0
                    ? activitiesLoading
                    : activityCards(resolvedActivities.slice(0, OVERVIEW_ACTIVITY_PREVIEW))}
                </section>
              ) : null}

              <ContextUpdates
                subjectUri={recordUri}
                variant="overview"
                maxItems={1}
                seeAllHref={tabHref("updates")}
              />
            </>
          ) : null}

          {activeTab === "activities" ? (
            <section className="record-section" aria-label="Activities">
              {itemsLoading && resolvedActivities.length === 0 ? (
                activitiesLoading
              ) : resolvedActivities.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No activities in this project yet"
                  description="When activities are added to this project, they'll appear here."
                >
                  {isOwner ? (
                    <Button href={editHref} variant="secondary" size="sm">
                      Add activities
                    </Button>
                  ) : null}
                </EmptyState>
              ) : (
                activityCards(resolvedActivities)
              )}
            </section>
          ) : null}

          {activeTab === "funding" ? (
            <RecordFundingSection
              view={funding}
              recipientDid={did}
              actions={fundingFlow.control}
              note={fundingFlow.note}
              showFor={fundingMixed}
              recordInFlight={fundingFlow.inFlight}
            />
          ) : null}

          {activeTab === "updates" ? (
            <ContextUpdates
              subjectUri={recordUri}
              variant="full"
              canEdit={canManage}
              viewerDid={sessionDid}
            />
          ) : null}
        </TabPanelTransition>

        {moreAfter}
      </article>
      {fundingFlow.dialogs}
      {deleteOpen ? (
        <DeleteRecordDialog
          title="Delete project?"
          recordName={asString(value.title) || ""}
          recordTypeLabel="project"
          isDeleting={isDeleting}
          errorMessage={deleteError}
          onCancel={() => {
            if (!isDeleting) setDeleteOpen(false)
          }}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
      {groupEditOpen && editAsGroup ? (
        <ConfirmDialog
          title="Edit as group"
          message={`This project is published by ${editAsGroupLabel}. You'll switch to acting as that group to edit it — your changes are saved as the group, not your personal account.`}
          confirmLabel="Continue as group"
          confirmVariant="primary"
          onCancel={() => setGroupEditOpen(false)}
          onConfirm={() => {
            switchOrg(editAsGroup)
            setGroupEditOpen(false)
            router.push(editHref)
          }}
        />
      ) : null}
    </>
  )
}
