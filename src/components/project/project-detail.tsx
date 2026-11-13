"use client"

import { useEffect, useMemo, useState } from "react"
import { profileUrl, recordUrl } from "@/lib/urls"
import { usePageTitle, useRegisterPageHeader } from "@/lib/navbar-context"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import DeleteRecordDialog from "@/components/ui/delete-record-dialog"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { authFetch } from "@/lib/auth/fetch"
import { toUserErrorMessage } from "@/lib/utils/api"
import { Inbox, Pencil } from "lucide-react"
import ActivityContributor from "@/components/feed/activity-contributor"
import CertLocationsMap from "@/components/feed/cert-locations-map"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import SectionHeader, { SeeAllLink } from "@/components/ui/section-header"
import Skeleton from "@/components/ui/skeleton"
import { TabPanelTransition } from "@/components/ui/tab-panel-transition"
import { PROJECT_DETAIL_TABS } from "@/lib/detail-tabs"
import { isRenderableDescription } from "@/components/leaflet/leaflet-document"
import AddToListMenu from "@/components/lists/add-to-list-menu"
import { LIST_PROJECTS_TYPE } from "@/lib/atproto/typed-lists"
import ContextUpdates from "@/components/context/context-updates"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useProjectItems } from "@/hooks/use-project-items"
import { useContextUpdates } from "@/hooks/use-context-updates"
import {
  RecordByline,
  RecordDescription,
  RecordHeader,
  RecordSectionTabs,
} from "@/components/feed/cert-detail-parts"
import { SectionTitleCount } from "@/components/create/form-action-bar"
import { useScrollTopOnTabChange } from "@/hooks/use-scroll-top-on-tab-change"
import CertListRow from "@/components/explore-page/cert-list-row"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import {
  contributorKey,
  contributionRoleText,
} from "@/lib/atproto/contributor-display"
import { formatTimePeriod } from "@/lib/utils/format-date"
import {
  asString,
  projectImage,
  projectTitle,
  type CollectionValue,
} from "@/lib/atproto/collection"
import type {
  ActivityContributor as ActivityContributorType,
  ActivityRecord,
} from "@/lib/atproto/activity-types"

/** Activities previewed on the Overview; "See all" opens the Activities
 *  tab when the project has more. */
const OVERVIEW_CERT_PREVIEW = 10

interface ProjectDetailProps {
  did: string
  rkey: string
  value: CollectionValue
  /** CID of the record at read time (the list strongRef). */
  cid: string
  /** Resolved handle of the author. */
  handle: string | null
}

/**
 * Detail view for a single `org.hypercerts.collection` project record.
 *
 * Laid out like the activity page, the same at every width: the record
 * header ("Project" eyebrow, the title as the page's h1 with the owner's
 * Edit button and the ⋯ record menu beside it, the byline), the section
 * tabs (Overview / Activities / Updates), then the tab's content in one
 * column: the banner, summary, the full description (behind "Read full
 * description"), details, location, the activities in the project and the
 * latest update on Overview. The
 * activities are compact rows (thumbnail, title, period and scope) at
 * every width, like Records and Home.
 *
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
  // Group-edit affordance — the viewer is NOT a direct owner, but they ARE
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
  const [groupEditOpen, setGroupEditOpen] = useState(false)
  const editHref = `${recordUrl(did, "project", rkey ?? "")}/edit`
  const recordUri = `at://${did}/org.hypercerts.collection/${rkey}`

  const title = projectTitle(value)
  const shortDesc = asString(value.shortDescription)
  const showFullDescription = isRenderableDescription(value.description)

  // Section tabs write `?tab=`; read it here and render that slice.
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get("tab") ?? "overview"
  // Old links keep working: ?tab=certs opens Activities, and
  // ?tab=description (the former Description tab, now part of Overview)
  // opens Overview with the description showing.
  const normalizedTab = tabParam === "certs" ? "activities" : tabParam
  const activeTab: "overview" | "activities" | "updates" =
    normalizedTab === "activities" || normalizedTab === "updates"
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
  const buildTabHref = (
    tab: "overview" | "activities" | "updates",
  ): string | null => {
    if (!pathname) return null
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (tab === "overview") params.delete("tab")
    else params.set("tab", tab)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }
  const certsHref = buildTabHref("activities")
  const updatesHref = buildTabHref("updates")

  const rawImage = projectImage(value, "banner")
  const imageUrl = rawImage ? resolveActivityImageUrl(rawImage, did) : null
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  const createdAt = asString(value.createdAt)
  // `startDate` / `endDate` and `contributors` are activity-only meta: the
  // project forms never write them, so for records authored in-app these
  // reads are always empty. They are rendered when present to tolerate
  // legacy and foreign records that do carry them.
  const startDate = asString(
    (value as Record<string, unknown>).startDate as unknown,
  )
  const endDate = asString((value as Record<string, unknown>).endDate as unknown)
  // `location` persists as a `com.atproto.repo.strongRef` ({ uri, cid })
  // pointing at an `app.certified.location` record. A resolvable location
  // renders the same interactive map the activity page uses; a legacy
  // inline string has no record to map, so it shows as plain text.
  const rawLocation = (value as Record<string, unknown>).location
  const inlineLocation = asString(rawLocation)
  const locationRef =
    rawLocation && typeof rawLocation === "object"
      ? (rawLocation as { uri?: unknown; cid?: unknown })
      : null
  const locationRefUri =
    typeof locationRef?.uri === "string" ? locationRef.uri : null
  const locationCid =
    typeof locationRef?.cid === "string" ? locationRef.cid : ""
  const locationStrongRefs = locationRefUri
    ? [{ uri: locationRefUri, cid: locationCid }]
    : []

  const contributors = Array.isArray(
    (value as Record<string, unknown>).contributors,
  )
    ? ((value as Record<string, unknown>).contributors as ActivityContributorType[])
    : []

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

  const timePeriodLabel = formatTimePeriod(startDate, endDate)
  const certCount = resolutions.length
  const itemCount = Array.isArray(value.items) ? value.items.length : 0
  // Updates count for the Updates tab (the same shared fetch the updates
  // sections read).
  const { updates } = useContextUpdates(recordUri)
  const updatesCount = updates.length
  const hasAnyMeta = !!timePeriodLabel || contributors.length > 0
  const hasLocation = !!locationRefUri || !!inlineLocation

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

  // The record's actions, beside the title at every width — the same
  // cluster as the activity page: the owner's Edit, then the ⋯ menu with
  // Delete, Share, Add to list and Copy AT URI.
  const recordActions = (
    <>
      {isOwner ? (
        <Button
          href={editHref}
          variant="secondary"
          size="sm"
          aria-label="Edit project"
        >
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
        shareTab={activeTab === "overview" ? null : activeTab}
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

  const activitiesLoading = (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading activities">
      <Skeleton variant="line" width="100%" height="3rem" />
      <Skeleton variant="line" width="100%" height="3rem" />
    </div>
  )

  return (
    <>
      <article className="record-page">
        <RecordHeader kind="Project" title={title} actions={recordActions}>
          <RecordByline did={did} createdAt={createdAt} />
        </RecordHeader>

        <RecordSectionTabs
          tabs={PROJECT_DETAIL_TABS}
          activeKey={activeTab}
          ariaLabel="Project sections"
          counts={{ activities: itemCount, updates: updatesCount }}
        />

        <TabPanelTransition
          className="project-detail__body"
          activeKey={activeTab}
          order={PROJECT_DETAIL_TABS.map((t) => t.key)}
        >
          {activeTab === "overview" ? (
            <>
              {imageUrl && !imageFailed ? (
                <div className="project-detail__hero">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt=""
                    className="project-detail__hero-img"
                    onError={() => setImageFailed(true)}
                  />
                </div>
              ) : null}

              {shortDesc ? (
                <section className="project-detail__section">
                  <SectionHeader title="Summary" />
                  <p className="project-detail__lead" dir="auto">
                    {shortDesc}
                  </p>
                </section>
              ) : null}

              {/* The full description, behind "Read full description" as
                  on the activity page. */}
              {showFullDescription ? (
                <RecordDescription
                  value={value.description}
                  did={did}
                  defaultExpanded={tabParam === "description"}
                  sectionClassName="project-detail__section"
                />
              ) : null}

              {hasAnyMeta ? (
                <dl className="cert-detail__meta project-detail__details">
                  {timePeriodLabel ? (
                    <div className="cert-detail__meta-row">
                      <dt className="cert-detail__meta-label">Time period</dt>
                      <dd className="cert-detail__meta-value">{timePeriodLabel}</dd>
                    </div>
                  ) : null}
                  {contributors.length > 0 ? (
                    <div className="cert-detail__meta-row">
                      <dt className="cert-detail__meta-label">Contributors</dt>
                      <dd className="cert-detail__meta-value">
                        <ul className="project-detail__contributors">
                          {contributors.map((c, i) => (
                            <ActivityContributor
                              key={contributorKey(c, i)}
                              contributor={c}
                              role={contributionRoleText(c.contributionDetails)}
                              weight={c.contributionWeight ?? null}
                            />
                          ))}
                        </ul>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {hasLocation ? (
                <section className="project-detail__section">
                  <SectionHeader title="Location" />
                  {locationRefUri ? (
                    <CertLocationsMap locations={locationStrongRefs} />
                  ) : (
                    <p className="cert-detail__meta-value m-0">{inlineLocation}</p>
                  )}
                </section>
              ) : null}

              {certCount > 0 ? (
                <section className="project-detail__section">
                  <SectionHeader
                    title={<SectionTitleCount label="Activities" count={certCount} />}
                    action={
                      certsHref && certCount > OVERVIEW_CERT_PREVIEW ? (
                        <SeeAllLink href={certsHref} />
                      ) : null
                    }
                  />
                  <ul className="project-detail__certs-list">
                    {resolvedActivities
                      .slice(0, OVERVIEW_CERT_PREVIEW)
                      .map((rec) => (
                        <li key={rec.uri}>
                          <CertListRow
                            record={rec}
                            did={didByUri.get(rec.uri) ?? did}
                          />
                        </li>
                      ))}
                  </ul>
                </section>
              ) : null}

              <ContextUpdates
                subjectUri={recordUri}
                variant="overview"
                maxItems={1}
                seeAllHref={updatesHref}
              />
            </>
          ) : null}

          {activeTab === "activities" ? (
            <section className="project-detail__section">
              <SectionHeader
                title={<SectionTitleCount label="Activities" count={certCount} />}
              />
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
                <ul className="project-detail__certs-list">
                  {resolvedActivities.map((rec) => (
                    <li key={rec.uri}>
                      <CertListRow
                        record={rec}
                        did={didByUri.get(rec.uri) ?? did}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {activeTab === "updates" ? (
            <ContextUpdates
              subjectUri={recordUri}
              variant="full"
              canEdit={isOwner || !!editAsGroup}
              viewerDid={sessionDid}
            />
          ) : null}
        </TabPanelTransition>
      </article>
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
