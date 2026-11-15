"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { FactCard } from "@/components/ui/fact-card"
import Skeleton from "@/components/ui/skeleton"
import {
  headlineAmount,
  unconfirmedLabel,
  useRecordFundingView,
} from "@/components/funding/record-funding"
import { parseAtUri, recordUrl } from "@/lib/urls"
import {
  projectActivityUris,
  projectTitle,
  type CollectionRecord,
} from "@/lib/atproto/collection"
import { fundingByline } from "@/lib/funding/record-funding"

/** Activities whose funding a project's total takes in (the project page
 *  reads the same number, so the two totals agree). */
export const MAX_FUNDED_ACTIVITIES = 25

/** The funding URIs of a project: its own receipts and its activities',
 *  the first {@link MAX_FUNDED_ACTIVITIES} of them. */
export function projectFundingUris(project: CollectionRecord): string[] {
  return [project.uri, ...projectActivityUris(project.value.items).slice(0, MAX_FUNDED_ACTIVITIES)]
}

/**
 * The activity page's "Project" card: the project the activity is part
 * of, its funding total (a project's gifts are often recorded on the
 * project, not the activity, so this is where a donor finds the money),
 * and a link to it: "Funding, updates and the full story". The project's
 * name is left out when it is the activity's own title. Other projects the
 * activity is in follow as links.
 */
export default function ProjectFactCard({
  projects,
  activityTitle,
  ownGifts = 0,
}: {
  /** The projects the activity is in; the first one leads. */
  projects: readonly CollectionRecord[]
  activityTitle: string
  /** How many gifts the activity's own Funding card counts. When the
   *  project has no more than these, its figures would only repeat them. */
  ownGifts?: number
}) {
  const lead = projects[0]
  const funding = useRecordFundingView(lead ? projectFundingUris(lead) : [], lead?.uri ?? null)
  if (!lead) return null

  const parts = parseAtUri(lead.uri)
  const href = parts ? recordUrl(parts.did, "project", parts.rkey) : null
  const title = projectTitle(lead.value)
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase()
  const showName = norm(title) !== norm(activityTitle)
  const { summary, all, isLoading, onlyUnconfirmed } = funding
  // The project's gifts are the activity's own plus its siblings'; when
  // there are no others, the activity's Funding card already said it.
  const adds = all.length > ownGifts
  const others = projects.slice(1)

  return (
    <FactCard title="Project">
      {showName ? (
        href ? (
          <Link href={href} className="record-project__name">
            {title}
          </Link>
        ) : (
          <p className="record-project__name m-0">{title}</p>
        )
      ) : null}
      {isLoading && all.length === 0 ? (
        <div className="flex flex-col gap-1.5" aria-hidden="true">
          <Skeleton variant="line" width="6rem" height="1.25rem" />
          <Skeleton variant="line" width="10rem" height="0.875rem" />
        </div>
      ) : !adds ? null : summary.gifts > 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="record-project__total m-0">{headlineAmount(summary)} raised</p>
          <p className="m-0 text-body-sm text-[var(--fg-secondary)]">{fundingByline(summary)}</p>
        </div>
      ) : onlyUnconfirmed ? (
        <p className="m-0 text-body-sm text-[var(--fg-secondary)]">
          {unconfirmedLabel(all.length)}
        </p>
      ) : null}
      {href ? (
        <Link href={href} className="record-link record-link--arrow">
          Funding, updates and the full story
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
        </Link>
      ) : null}
      {others.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-caption text-[var(--fg-muted)]">Also part of</p>
          <ul className="record-plain-list">
            {others.map((p) => {
              const op = parseAtUri(p.uri)
              return (
                <li key={p.uri}>
                  {op ? (
                    <Link href={recordUrl(op.did, "project", op.rkey)} className="record-link">
                      {projectTitle(p.value)}
                    </Link>
                  ) : (
                    projectTitle(p.value)
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </FactCard>
  )
}
