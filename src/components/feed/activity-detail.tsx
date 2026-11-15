"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { parseAtUri, profileUrl, recordUrl, recordUrlFromAtUri } from "@/lib/urls"
import { usePageTitle, useRegisterPageHeader } from "@/lib/navbar-context"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import DeleteRecordDialog from "@/components/ui/delete-record-dialog"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { authFetch } from "@/lib/auth/fetch"
import { toUserErrorMessage } from "@/lib/utils/api"
import { Pencil } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import {
  resolveActivityImageUrl,
  workScopeTags,
} from "@/lib/atproto/activity"
import { useScrollTopOnTabChange } from "@/hooks/use-scroll-top-on-tab-change"
import { useRights } from "@/hooks/use-rights"
import { useCertProjects } from "@/hooks/use-cert-projects"
import { useLocations } from "@/hooks/use-location"
import { useFitsViewport } from "@/hooks/use-fits-viewport"
import { useMediaQuery, WIDE_RECORD_LAYOUT } from "@/hooks/use-media-query"
import { formatShortDate, formatPeriodShort } from "@/lib/utils/format-date"
import EmptyState from "@/components/ui/empty-state"
import { FactCard, FactList, type Fact } from "@/components/ui/fact-card"
import SectionHeader, { SeeAllLink } from "@/components/ui/section-header"
import ShareLinkButton from "@/components/ui/share-link-button"
import Skeleton from "@/components/ui/skeleton"
import { TabPanelTransition } from "@/components/ui/tab-panel-transition"
import { CERT_DETAIL_TABS, visibleDetailTabs } from "@/lib/detail-tabs"
import { useContextUpdates } from "@/hooks/use-context-updates"
import RightsDetailModal from "@/components/feed/rights-detail-modal"
import Button from "@/components/ui/button"
import { isRenderableDescription } from "@/components/leaflet/leaflet-document"
import RecordLocationCard from "./cert-locations-map"
import {
  ContributorRow,
  ContributorStack,
  RecordByline,
  RecordDescription,
  RecordHeader,
  RecordImage,
  RecordSectionTabs,
  WorkScopeTags,
} from "./cert-detail-parts"
import { sameTitle } from "./work-cards"
import {
  FundingFactCard,
  RecordFundingSection,
  useRecordFundingFlow,
  useRecordFundingView,
} from "@/components/funding/record-funding"
import ProjectFactCard from "@/components/funding/project-fact-card"
import {
  contributorKey,
  contributionRoleText,
  buildWeightPercents,
} from "@/lib/atproto/contributor-display"
import ContextUpdates from "@/components/context/context-updates"
import type { ActivityContributor, ClaimActivity } from "@/lib/atproto/activity-types"
import { locationLabel } from "@/lib/atproto/location-label"
import { leadText, withoutLeadParagraph } from "@/lib/leaflet/strip-lead"
import { projectTitle } from "@/lib/atproto/collection"
import AddToListMenu from "@/components/lists/add-to-list-menu"
import { LIST_CERTS_TYPE } from "@/lib/atproto/typed-lists"

interface ActivityDetailProps {
  did: string
  value: ClaimActivity
  /** CID of the record at read time (the list / funding strongRefs). */
  cid: string
  /** Resolved handle of the author. */
  handle: string | null
}

type ActivityTab = "overview" | "contributors" | "funding" | "updates"

/** Whether a contributor entry names the record's own account. */
function isAccount(c: ActivityContributor, did: string): boolean {
  const id = c.contributorIdentity as unknown
  if (typeof id === "string") return id === did
  if (id && typeof id === "object") {
    return (id as { identity?: unknown }).identity === did
  }
  return false
}

/**
 * Detail view of a single activity claim, laid out like the project page
 * (one record layout, record-page.css):
 *
 *   - the header: the work's photo, "Activity · Part of <project>" (the
 *     project part hidden when it has the activity's own title), the title
 *     as the page's h1 with the owner's Edit, Share and More at its right,
 *     a byline (who, when, where) and the summary as the lead;
 *   - the rail of facts (from 1100px beside the content, sticky when it
 *     fits; on phones under the header, on Overview): funding, details
 *     (what the byline doesn't say: work scope, rights, published), the
 *     location, contributors, the project (with its funding);
 *   - the tabs, only those with something in them: Overview (the
 *     description in place, the latest update; with no description, the
 *     details, so the column is never empty), Contributors, Funding and
 *     Updates.
 *
 * Editing happens on the edit page (`/{actor}/activity/{rkey}/edit`).
 */
export default function ActivityDetail({
  did,
  value,
  cid,
}: ActivityDetailProps) {
  const imageUrl = value.image ? resolveActivityImageUrl(value.image, did) : null
  const title = value.title?.trim() || "Untitled activity"
  const period = formatPeriodShort(value.startDate ?? null, value.endDate ?? null)
  const scopeTags = workScopeTags(value.workScope)

  const contributors = useMemo(
    () => value.contributors ?? [],
    [value.contributors],
  )
  const contributorCount = contributors.length
  // Percentages are a full pass over the contributor list; keyed on
  // `contributors` so unrelated re-renders reuse them.
  const weightPercents = useMemo(
    () => buildWeightPercents(contributors),
    [contributors],
  )
  // A list of one, the account itself, says nothing a visitor doesn't
  // already see in the byline.
  const hasContributors =
    contributorCount > 1 || (contributorCount === 1 && !isAccount(contributors[0], did))

  const locations = useMemo(() => value.locations ?? [], [value.locations])
  const locationUris = useMemo(() => locations.map((l) => l.uri), [locations])
  const { locations: locationRecords, isLoading: placesLoading } = useLocations(locationUris)
  const placeNames = locationRecords
    .map((r) => locationLabel(r))
    .filter((n): n is string => !!n)
  const place =
    locationUris.length === 0
      ? null
      : placesLoading
        ? undefined
        : placeNames.length === 0
          ? null
          : placeNames.length === 1
            ? placeNames[0]
            : `${placeNames[0]} and ${placeNames.length - 1} more`
  // The summary, read whole from the description when it was stored cut.
  const lead = leadText(value.shortDescription, value.description)
  // The description, less a first paragraph that repeats the lead.
  const description = useMemo(
    () => withoutLeadParagraph(value.description, lead),
    [value.description, lead],
  )
  const showFullDescription = isRenderableDescription(description)

  // ClaimActivity doesn't carry its own rkey; the route at
  // /[actor]/[type]/[rkey] does. Derived from the trailing pathname
  // segment during render (not in a mount effect) so rkey is available on
  // the first commit and the funding / updates / projects fetches start
  // immediately.
  const pathname = usePathname()
  const rkey = useMemo(() => {
    const segments = (pathname ?? "").split("/").filter(Boolean)
    const last = segments[segments.length - 1]
    if (!last) return null
    try {
      return decodeURIComponent(last)
    } catch {
      return last
    }
  }, [pathname])
  const recordUri = rkey
    ? `at://${did}/org.hypercerts.claim.activity/${rkey}`
    : null

  const { name: rightsName, isLoading: rightsLoading } = useRights(
    value.rights?.uri ?? null,
  )
  const [rightsModalOpen, setRightsModalOpen] = useState(false)

  // The projects this activity is in (curated by anyone).
  const { projects, isLoading: projectsLoading } = useCertProjects(did, rkey)

  // Funding: every receipt whose `for` is this activity.
  const fundingUris = useMemo(() => (recordUri ? [recordUri] : []), [recordUri])
  const funding = useRecordFundingView(fundingUris, recordUri)
  const fundingFlow = useRecordFundingFlow({
    recordDid: did,
    uri: recordUri,
    cid,
    title: value.title || undefined,
    receipts: funding.all,
    refetch: funding.refetch,
    isLoading: funding.isLoading,
  })

  const { updates } = useContextUpdates(recordUri)

  // The section tabs drive which slice of the record renders.
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get("tab") ?? "overview"
  const activeTab: ActivityTab =
    tabParam === "contributors" ||
    tabParam === "funding" ||
    tabParam === "updates"
      ? tabParam
      : "overview"

  // On mobile, reset to the top when switching sub-tabs so the tab's
  // first rows aren't left hidden behind the fixed navbar.
  useScrollTopOnTabChange(activeTab)

  // The record title is the page's h1 on every tab (the record header), so
  // the page registers its header and the chrome renders no h1 of its own.
  useRegisterPageHeader()
  usePageTitle(value.title || "Activity")

  // Edit affordance: the viewer can act on the activity when they're
  // signed in as its creator. Two paths:
  //   - Personal session DID === activity DID (own record), OR
  //   - Acting as the group that owns it, with the owner or admin role.
  //     Members can switch into a group but the BFF rejects their writes,
  //     so the affordance stays hidden for them.
  const { did: sessionDid } = useAuth()
  const { activeOrg, groups, switchOrg } = useOrg()
  const canEditAsActiveOrg =
    !!activeOrg &&
    activeOrg.groupDid === did &&
    (activeOrg.role === "owner" || activeOrg.role === "admin")
  // When acting as a group, the user can only edit records OWNED BY that
  // group, even though the session DID is still their personal identity.
  const isCreator = activeOrg
    ? canEditAsActiveOrg
    : !!sessionDid && sessionDid === did
  // Group-edit affordance: the viewer is NOT a direct editor, but they
  // ARE an owner/admin of the group that owns this activity while signed
  // in under a different identity. Their Edit button, on confirm,
  // switches them into the owning group before opening the editor.
  const editAsGroup = isCreator
    ? null
    : groups.find(
        (g) =>
          g.groupDid === did &&
          (g.role === "owner" || g.role === "admin"),
      ) ?? null
  const editAsGroupLabel = editAsGroup
    ? editAsGroup.displayName || editAsGroup.handle
    : null
  const canManage = isCreator || !!editAsGroup
  const [groupEditOpen, setGroupEditOpen] = useState(false)
  const editHref = `${recordUrl(did, "activity", rkey ?? "")}/edit`

  // A tab href that keeps the current query params (e.g. the funding
  // "Confirmed by" filter), like the tab strip's own links.
  const tabHref = (tab: ActivityTab): string | null => {
    if (!pathname) return null
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (tab === "overview") params.delete("tab")
    else params.set("tab", tab)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const tabs = visibleDetailTabs(
    CERT_DETAIL_TABS,
    {
      contributors: hasContributors,
      funding: funding.all.length > 0 || fundingFlow.canRecord,
      updates: updates.length > 0 || canManage,
    },
    activeTab,
  )
  const contributorsTabShown = tabs.some((t) => t.key === "contributors")

  // ----- Destructive delete -----
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDeleteConfirm = useCallback(async () => {
    if (!rkey) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      // Group BFF when acting as the owning group, the xrpc proxy on the
      // user's own repo otherwise. The group BFF takes DELETE; the xrpc
      // proxy expects POST for com.atproto.repo.deleteRecord.
      const useGroupRoute = canEditAsActiveOrg
      const res = await authFetch(
        useGroupRoute
          ? `/api/groups/${encodeURIComponent(did)}/activity`
          : "/api/xrpc/com/atproto/repo/deleteRecord",
        {
          method: useGroupRoute ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            useGroupRoute
              ? { rkey }
              : {
                  repo: did,
                  collection: "org.hypercerts.claim.activity",
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
            "Couldn't delete this activity. Try again",
          ),
        )
      }
      // Hard navigation (window.location) rather than router.push so every
      // client-side cache the destination page might keep (profile lists,
      // the indexer feed cache, module-level memoised fetches) is cleared
      // on the way; otherwise the just-deleted activity can linger.
      if (typeof window !== "undefined") {
        window.location.href = profileUrl(did)
      } else {
        router.push(profileUrl(did))
      }
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Couldn't delete this activity. Try again.",
      )
      setIsDeleting(false)
    }
  }, [rkey, did, canEditAsActiveOrg, router])

  // The record's actions at the header's top-right, in the profile's
  // order: the owner's Edit, Share for everyone (deep-linking the open
  // tab), then More.
  const sharePath = (() => {
    const base =
      (recordUri ? recordUrlFromAtUri(recordUri) : null) ??
      recordUrl(did, "activity", rkey ?? "")
    return activeTab === "overview" ? base : `${base}?tab=${activeTab}`
  })()
  const recordActions = (
    <>
      {isCreator ? (
        <Button href={editHref} variant="secondary" size="sm" aria-label="Edit activity">
          <Pencil size={14} strokeWidth={1.75} aria-hidden />
          Edit
        </Button>
      ) : editAsGroup ? (
        <Button
          variant="secondary"
          size="sm"
          aria-label="Edit activity"
          tooltip={`Edit as ${editAsGroupLabel}`}
          onClick={() => setGroupEditOpen(true)}
        >
          <Pencil size={14} strokeWidth={1.75} aria-hidden />
          Edit
        </Button>
      ) : null}
      <ShareLinkButton path={sharePath} what="Activity link" />
      {recordUri ? (
        <AddToListMenu
          targetUri={recordUri}
          targetCid={cid}
          targetType={LIST_CERTS_TYPE}
          showShare={false}
          trigger="header"
          editActions={
            isCreator
              ? {
                  isCreator,
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
      ) : null}
    </>
  )

  // ----- The eyebrow: "Activity · Part of <project>" -----
  const firstProject = projects[0] ?? null
  const firstProjectTitle = firstProject ? projectTitle(firstProject.value) : null
  const firstProjectParts = firstProject ? parseAtUri(firstProject.uri) : null
  const firstProjectHref = firstProjectParts
    ? recordUrl(firstProjectParts.did, "project", firstProjectParts.rkey)
    : null
  const eyebrow =
    firstProjectTitle && firstProjectHref && !sameTitle(firstProjectTitle, title) ? (
      <>
        Activity <span aria-hidden="true">·</span>{" "}
        <span className="record-head__kind-rest">
          Part of{" "}
          <Link href={firstProjectHref} className="record-head__kind-link">
            {firstProjectTitle}
          </Link>
        </span>
      </>
    ) : (
      "Activity"
    )

  // ----- The rail -----
  // Details holds only what the byline doesn't say: the period and the
  // place are there (and the place again on the Location card's map).
  const details: Fact[] = []
  if (scopeTags.length > 0) {
    details.push({ label: "Work scope", value: <WorkScopeTags tags={scopeTags} /> })
  }
  if (value.rights) {
    details.push({
      label: "Rights",
      value:
        rightsLoading && !rightsName ? (
          <Skeleton variant="line" width="8rem" height="0.875rem" />
        ) : (
          <button
            type="button"
            className="record-link record-link--button"
            onClick={() => setRightsModalOpen(true)}
          >
            {rightsName || "View the rights"}
          </button>
        ),
    })
  }
  if (value.createdAt) {
    details.push({
      label: "Published",
      value: <time dateTime={value.createdAt}>{formatShortDate(value.createdAt)}</time>,
    })
  }

  // From 1100px every card is in the rail. Below, the funding card leads
  // (under the header, on Overview) and the rest follow the Overview's
  // content, so the tabs aren't pushed below a screen of facts.
  const wide = useMediaQuery(WIDE_RECORD_LAYOUT)
  const railRef = useRef<HTMLElement | null>(null)
  const railFits = useFitsViewport(railRef, 96)
  const contributorsHref = contributorsTabShown ? tabHref("contributors") : null
  // The project, with its funding: an activity's gifts are often recorded
  // on its project, so this is where a donor finds the money.
  const projectCard =
    projects.length > 0 ? (
      <ProjectFactCard projects={projects} activityTitle={title} ownGifts={funding.all.length} />
    ) : !projectsLoading && isCreator ? (
      <FactCard title="Project">
        <p className="m-0 text-body-sm text-[var(--fg-secondary)]">
          Not in a project yet.
        </p>
        <Link href="/records" className="record-link">
          Add to a project
        </Link>
      </FactCard>
    ) : null
  // On a phone, an activity without gifts of its own leads with its
  // project's card instead (under the header, where the money goes).
  const projectLeads =
    !wide && projects.length > 0 && !funding.isLoading && funding.all.length === 0
  // The Funding tab leads with the same figures, so the card steps aside.
  const leadCards = (
    <>
      {activeTab === "funding" ? null : (
        <FundingFactCard view={funding} href={tabHref("funding")} />
      )}
      {wide || projectLeads ? projectCard : null}
    </>
  )
  // Without a description the Overview's column would be empty (the map
  // is in the rail now), so the details go there instead of the rail.
  const detailsInMain =
    activeTab === "overview" && !showFullDescription && details.length > 0
  const moreCards = (
    <>
      {!wide && !projectLeads ? projectCard : null}
      {/* The Contributors tab lists them, so the card steps aside there. */}
      {hasContributors && activeTab !== "contributors" ? (
        <FactCard
          title={
            <>
              Contributors{" "}
              <span className="font-normal tabular-nums text-[var(--fg-muted)]">
                {contributorCount}
              </span>
            </>
          }
          action={contributorsHref ? <SeeAllLink href={contributorsHref} /> : null}
        >
          <ContributorStack contributors={contributors} />
        </FactCard>
      ) : null}
      <RecordLocationCard locations={locations} headerPlace={place ?? null} />
      {details.length > 0 && !detailsInMain ? (
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
      aria-label="About this activity"
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
      <aside className="record-layout__more" aria-label="About this activity">
        {moreCards}
      </aside>
    ) : null

  return (
    <>
      <article className={`record-page record-layout record-layout--tab-${activeTab}`}>
        <RecordHeader
          image={<RecordImage src={imageUrl} />}
          eyebrow={eyebrow}
          title={title}
          actions={recordActions}
          byline={<RecordByline did={did} period={period} place={place} />}
          lead={lead}
          compact={activeTab !== "overview"}
        />

        {rail}

        {/* A strip of one tab says nothing: Overview alone has none. */}
        {tabs.length > 1 ? (
          <RecordSectionTabs
            tabs={tabs}
            activeKey={activeTab}
            ariaLabel="Activity sections"
            counts={{
              contributors: contributorCount,
              funding: funding.tabCount,
              updates: updates.length,
            }}
          />
        ) : null}

        <TabPanelTransition
          className="record-layout__main"
          activeKey={activeTab}
          order={CERT_DETAIL_TABS.map((t) => t.key)}
        >
          {activeTab === "overview" ? (
            <>
              {showFullDescription ? (
                <RecordDescription value={description} did={did} />
              ) : null}
              {detailsInMain ? (
                <section className="record-section" aria-labelledby="activity-details">
                  <SectionHeader id="activity-details" title="Details" />
                  <FactList facts={details} className="record-details" />
                </section>
              ) : null}
              {recordUri ? (
                <ContextUpdates
                  subjectUri={recordUri}
                  variant="overview"
                  maxItems={1}
                  seeAllHref={tabHref("updates")}
                />
              ) : null}
            </>
          ) : activeTab === "contributors" ? (
            // The list only: the "Contributor board" showed the same
            // people again, in tiles that cut their names.
            <section className="record-section" aria-labelledby="activity-contributors">
              <h2 id="activity-contributors" className="sr-only">
                Contributors
              </h2>
              {contributorCount > 0 ? (
                <ul className="cert-detail__contributors record-contributors">
                  {contributors.map((c, i) => (
                    <ContributorRow
                      key={contributorKey(c, i)}
                      contributor={c}
                      role={contributionRoleText(c.contributionDetails)}
                      weight={weightPercents.get(i) ?? c.contributionWeight ?? null}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState variant="inline" title="No contributors listed." />
              )}
            </section>
          ) : activeTab === "funding" ? (
            <RecordFundingSection
              view={funding}
              recipientDid={did}
              actions={fundingFlow.control}
              note={fundingFlow.note}
              recordInFlight={fundingFlow.inFlight}
            />
          ) : activeTab === "updates" && recordUri ? (
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
          title="Delete activity?"
          recordName={value.title || ""}
          recordTypeLabel="activity"
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
          message={`This activity is published by ${editAsGroupLabel}. You'll switch to acting as that group to edit it — your changes are saved as the group, not your personal account.`}
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
      {rightsModalOpen && value.rights ? (
        <RightsDetailModal
          uri={value.rights.uri}
          cid={value.rights.cid}
          onClose={() => setRightsModalOpen(false)}
        />
      ) : null}
    </>
  )
}
