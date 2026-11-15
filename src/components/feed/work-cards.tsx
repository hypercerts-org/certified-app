"use client"

import { memo, type ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, FolderGit2 } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import { FactList, type Fact } from "@/components/ui/fact-card"
import WorkCard, { type WorkCardLayout } from "@/components/ui/work-card"
import { ContributorStack, WorkScopeTags } from "@/components/feed/cert-detail-parts"
import { useLocations } from "@/hooks/use-location"
import { useProjectPicture } from "@/hooks/use-project-picture"
import { resolveActivityImageUrl, workScopeTags } from "@/lib/atproto/activity"
import { activityDetailHref, parseActivityUri, parseAtUri } from "@/lib/atproto/activity-uri"
import {
  asString,
  projectActivityUris,
  projectTitle,
  type CollectionRecord,
} from "@/lib/atproto/collection"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { shortPlaceName } from "@/lib/atproto/location"
import { locationLabel } from "@/lib/atproto/location-label"
import { leadText } from "@/lib/leaflet/strip-lead"
import { recordUrl } from "@/lib/urls"
import { formatPeriodShort } from "@/lib/utils/format-date"

/** "Same title", give or take case and spacing. */
export function sameTitle(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase()
  return !!a && !!b && norm(a) === norm(b)
}

/** An activity's short place for a meta line ("Hamilton, New Zealand"),
 *  from its first location; `undefined` while it loads. */
export function useActivityPlace(record: ActivityRecord): string | null | undefined {
  const first = record.value.locations?.[0]?.uri
  const { locations, isLoading } = useLocations(first ? [first] : [])
  if (!first) return null
  if (isLoading) return undefined
  return shortPlaceName(locationLabel(locations[0]))
}

/** "31 May – 31 Dec 2026 · Hamilton, New Zealand" */
export function activityMeta(record: ActivityRecord, place: string | null | undefined): string {
  const period = formatPeriodShort(record.value.startDate ?? null, record.value.endDate ?? null)
  return [period, place].filter(Boolean).join(" · ")
}

/**
 * An activity as a work card (photo, serif title, period and place, its
 * summary). `did` is the activity's repo, for the photo.
 */
export const ActivityWorkCard = memo(function ActivityWorkCard({
  record,
  did,
  layout = "grid",
  titleAs = "h3",
  hideSummary = false,
  children,
}: {
  record: ActivityRecord
  did: string
  layout?: WorkCardLayout
  titleAs?: "h2" | "h3"
  /** Leave the summary out (it repeats the page's own lead). */
  hideSummary?: boolean
  children?: ReactNode
}) {
  const { value } = record
  const parsed = parseActivityUri(record.uri)
  const place = useActivityPlace(record)
  return (
    <WorkCard
      href={parsed ? activityDetailHref(parsed.did, parsed.rkey) : null}
      image={value.image ? resolveActivityImageUrl(value.image, did) : null}
      title={value.title?.trim() || "Untitled activity"}
      titleAs={titleAs}
      meta={activityMeta(record, place)}
      summary={hideSummary ? null : leadText(value.shortDescription, value.description)}
      layout={layout}
      placeholder={<CertIcon size={32} strokeWidth={1.25} />}
    >
      {children}
    </WorkCard>
  )
})

/**
 * A project's activity that has the project's own title: a card of what
 * the activity adds instead of the title and summary again. Its period and
 * place when they differ from the project's, its work scope, its
 * contributors, and "Open the activity".
 */
export function ActivityFactsCard({
  record,
  accountDid,
  projectPeriod,
  projectPlace,
}: {
  record: ActivityRecord
  /** The project's account: a contributor list of just it says nothing. */
  accountDid: string
  projectPeriod: string | null
  projectPlace: string | null | undefined
}) {
  const { value } = record
  const parsed = parseActivityUri(record.uri)
  const place = useActivityPlace(record)
  const period = formatPeriodShort(value.startDate ?? null, value.endDate ?? null)
  const tags = workScopeTags(value.workScope)
  const contributors = value.contributors ?? []
  const onlyAccount =
    contributors.length === 1 &&
    (() => {
      const id = contributors[0].contributorIdentity as unknown
      if (typeof id === "string") return id === accountDid
      return !!id && typeof id === "object" && (id as { identity?: unknown }).identity === accountDid
    })()

  const facts: Fact[] = []
  if (period && period !== projectPeriod) facts.push({ label: "Time period", value: period })
  if (place && place !== shortPlaceName(projectPlace ?? null)) {
    facts.push({ label: "Place", value: place })
  }
  if (tags.length > 0) facts.push({ label: "Work scope", value: <WorkScopeTags tags={tags} /> })
  if (contributors.length > 0 && !onlyAccount) {
    facts.push({
      label: contributors.length === 1 ? "Contributor" : `Contributors (${contributors.length})`,
      value: <ContributorStack contributors={contributors} max={8} />,
    })
  }
  if (facts.length === 0 && period) facts.push({ label: "Time period", value: period })

  return (
    <div className="work-facts">
      <FactList facts={facts} className="work-facts__list" />
      {parsed ? (
        <Link
          href={activityDetailHref(parsed.did, parsed.rkey)}
          className="record-link record-link--arrow"
        >
          Open the activity
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
        </Link>
      ) : null}
    </div>
  )
}

/**
 * A project as a work card: its picture (the banner, else its first
 * activity's photo: the same rule as the project page), the title, how
 * many activities it holds and its summary. `known` are activities the
 * page already has, so the picture needs no extra read when it can.
 */
export const ProjectWorkCard = memo(function ProjectWorkCard({
  project,
  known,
  layout = "grid",
  titleAs = "h3",
}: {
  project: CollectionRecord
  known?: readonly ActivityRecord[]
  layout?: WorkCardLayout
  titleAs?: "h2" | "h3"
}) {
  const { value, uri } = project
  const parsed = parseAtUri(uri)
  const projectDid = parsed?.did ?? ""
  const picture = useProjectPicture(value, projectDid, known)
  const count = projectActivityUris(value.items).length
  return (
    <WorkCard
      href={parsed ? recordUrl(parsed.did, "project", parsed.rkey) : null}
      image={picture}
      title={projectTitle(value)}
      titleAs={titleAs}
      meta={count > 0 ? (count === 1 ? "1 activity" : `${count} activities`) : null}
      summary={leadText(asString(value.shortDescription), value.description)}
      layout={layout}
      placeholder={<FolderGit2 size={32} strokeWidth={1.25} />}
    />
  )
})
