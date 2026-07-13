"use client"

import { useCallback, useMemo } from "react"
import { FolderGit2, HandCoins, Users } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import ActivityCard from "@/components/feed/activity-card"
import CertListRow from "./cert-list-row"
import ExploreUserCard from "./explore-user-card"
import ExploreProjectCard from "./explore-project-card"
import ProjectListRow from "./project-list-row"
import AccountListRow from "./account-list-row"
import FundingReceiptRow, { FundingReceiptHeader } from "./funding-receipt-row"
import {
  matchesConfirmedBy,
  type ConfirmRole,
} from "@/lib/atproto/funding-provenance"
import {
  EMPTY_DID_SET,
  type Degree,
  type ExploreKind,
  type ListGalleryView,
  type SortOrder,
} from "./explore-types"
import type { useExploreData } from "@/hooks/use-explore"
import { useMergedFunding } from "@/hooks/use-merged-funding"

/** Render whatever the data hook returned, applying client-side sort
 *  and routing through the right card. */
export function ResultsArea({
  kind,
  data,
  sort,
  view,
  degrees,
  confirmRoles,
  confirmThirdParties,
}: {
  kind: ExploreKind
  data: ReturnType<typeof useExploreData>
  sort: SortOrder
  view: ListGalleryView
  /** Non-null only when the active filter is endorsement-based.
   *  When present, rows whose author's degree isn't in the set are
   *  filtered out — the loader fetched the full closure up to
   *  `max(degrees)`, this trims the subset the user actually wants
   *  to see. */
  degrees: Set<Degree> | null
  /** Funding only — the selected "Confirmed by" role buckets + third-party
   *  attestor DIDs. Receipts are filtered to the union; with both empty,
   *  nothing shows. */
  confirmRoles?: ReadonlySet<ConfirmRole>
  confirmThirdParties?: ReadonlySet<string>
}) {
  const closure = data.endorsementClosure
  const degreeMatches = useCallback(
    (did: string | null | undefined): boolean => {
      if (!degrees || !closure) return true
      if (!did) return false
      const meta = closure.closureByDid.get(did)
      if (!meta) return false
      return degrees.has(meta.degree)
    },
    [degrees, closure],
  )

  // Funding "Confirmed by" filter — memoized so an unrelated re-render (a
  // keystroke in search, a view toggle) doesn't re-run the O(n) attestation
  // filter over the whole receipt list. Recomputes only when the loaded
  // receipts or either selection changes.
  // Merge optimistic confirmations + collapse matchingReceipt pairs (issue
  // #186) before applying the "Confirmed by" filter.
  const mergedFundingReceipts = useMergedFunding(data.fundingReceipts)
  const filteredFundingReceipts = useMemo(
    () =>
      confirmRoles
        ? mergedFundingReceipts.filter((r) =>
            matchesConfirmedBy(
              r.attestations,
              confirmRoles,
              confirmThirdParties ?? EMPTY_DID_SET,
            ),
          )
        : mergedFundingReceipts,
    [mergedFundingReceipts, confirmRoles, confirmThirdParties],
  )

  // Degree-filtered + sorted lists, memoized so a keystroke in the search
  // box (local state on the parent) doesn't re-allocate and re-sort the
  // whole list each render. The underlying arrays are stable references
  // between keystrokes (they live in useExploreData's state), so these
  // recompute only when the loaded data, the active degree set, or the
  // sort order actually changes.
  const sortedUsers = useMemo(() => {
    const actors = degrees
      ? data.users.filter((a) => degreeMatches(a.did))
      : data.users
    return sortUsers(actors, sort)
  }, [data.users, degrees, degreeMatches, sort])
  const sortedProjects = useMemo(() => {
    const list = degrees
      ? data.projects.filter((p) => degreeMatches(projectAuthorDid(p)))
      : data.projects
    return sortProjects(list, sort)
  }, [data.projects, degrees, degreeMatches, sort])
  const sortedCerts = useMemo(() => {
    const list = degrees
      ? data.certs.filter((c) => degreeMatches(data.certDids.get(c.uri) ?? null))
      : data.certs
    return sortCerts(list, sort)
  }, [data.certs, data.certDids, degrees, degreeMatches, sort])

  if (
    data.isLoading &&
    data.users.length === 0 &&
    data.projects.length === 0 &&
    data.certs.length === 0 &&
    data.fundingReceipts.length === 0
  ) {
    return (
      <div className="explore__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }

  if (kind === "funding") {
    const receipts = filteredFundingReceipts
    if (receipts.length === 0) return <EmptyResults kind={kind} />
    return (
      <ul className="explore__list explore__list--funding">
        <li>
          <FundingReceiptHeader />
        </li>
        {receipts.map((r) => (
          <li key={r.uri}>
            <FundingReceiptRow receipt={r} showTextParties />
          </li>
        ))}
      </ul>
    )
  }

  if (kind === "accounts") {
    const actors = sortedUsers
    if (actors.length === 0) return <EmptyResults kind={kind} />
    if (view === "list") {
      return (
        <ul className="explore__list explore__list--accounts">
          {actors.map((a) => (
            <li key={a.did}>
              <AccountListRow
                actor={a}
                endorsementMeta={closure?.closureByDid.get(a.did)}
              />
            </li>
          ))}
        </ul>
      )
    }
    return (
      <ul className="explore__grid explore__grid--users">
        {actors.map((a) => (
          <li key={a.did}>
            <ExploreUserCard actor={a} />
          </li>
        ))}
      </ul>
    )
  }

  if (kind === "projects") {
    const projects = sortedProjects
    if (projects.length === 0) return <EmptyResults kind={kind} />
    if (view === "list") {
      return (
        <ul className="explore__list explore__list--projects">
          {projects.map((p) => {
            const authorDid = projectAuthorDid(p)
            const meta = closure && authorDid
              ? closure.closureByDid.get(authorDid)
              : undefined
            return (
              <li key={p.uri}>
                <ProjectListRow
                  project={p}
                  endorsementMeta={meta}
                />
              </li>
            )
          })}
        </ul>
      )
    }
    return (
      <ul className="explore__grid explore__grid--projects">
        {projects.map((p) => (
          <li key={p.uri}>
            <ExploreProjectCard project={p} />
          </li>
        ))}
      </ul>
    )
  }

  // certs
  const certs = sortedCerts
  const certDids = data.certDids
  if (certs.length === 0) return <EmptyResults kind={kind} />

  if (view === "list") {
    return (
      <ul className="explore__list explore__list--certs">
        {certs.map((rec) => {
          const did = certDids.get(rec.uri) ?? ""
          return (
            <li key={rec.uri}>
              <CertListRow record={rec} did={did} showByline />
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <ul className="explore__grid explore__grid--certs">
      {certs.map((rec) => {
        const did = certDids.get(rec.uri) ?? ""
        return (
          <li key={rec.uri}>
            <ActivityCard record={rec} did={did} />
          </li>
        )
      })}
    </ul>
  )
}

export function EmptyResults({ kind }: { kind: ExploreKind }) {
  const label =
    kind === "accounts"
      ? "accounts"
      : kind === "projects"
        ? "projects"
        : kind === "funding"
          ? "funding receipts"
          : "activities"
  const icon =
    kind === "accounts"
      ? Users
      : kind === "projects"
        ? FolderGit2
        : kind === "funding"
          ? HandCoins
          : CertIcon
  return (
    <EmptyState
      icon={icon}
      title={`No ${label} match`}
      description="Try a different filter, clear the search, or pick a broader scope."
    />
  )
}

export function sortUsers<T extends { displayName: string | null; did: string }>(
  list: T[],
  sort: SortOrder,
): T[] {
  if (sort === "alphabetical") {
    return [...list].sort((a, b) =>
      (a.displayName ?? a.did).localeCompare(b.displayName ?? b.did),
    )
  }
  // newest/oldest don't map cleanly to actors (no createdAt on profile
  // record here); keep insertion order which is roughly recently-indexed.
  if (sort === "oldest") return [...list].reverse()
  return list
}

export function sortProjects<
  T extends { value: { createdAt?: string; title?: string } },
>(list: T[], sort: SortOrder): T[] {
  if (sort === "alphabetical") {
    return [...list].sort((a, b) =>
      (a.value.title ?? "").localeCompare(b.value.title ?? ""),
    )
  }
  return [...list].sort((a, b) => {
    const ac = a.value.createdAt ?? ""
    const bc = b.value.createdAt ?? ""
    return sort === "oldest" ? ac.localeCompare(bc) : bc.localeCompare(ac)
  })
}

export function sortCerts<
  T extends { value: { createdAt?: string; title?: string } },
>(list: T[], sort: SortOrder): T[] {
  if (sort === "alphabetical") {
    return [...list].sort((a, b) =>
      (a.value.title ?? "").localeCompare(b.value.title ?? ""),
    )
  }
  return [...list].sort((a, b) => {
    const ac = a.value.createdAt ?? ""
    const bc = b.value.createdAt ?? ""
    return sort === "oldest" ? ac.localeCompare(bc) : bc.localeCompare(ac)
  })
}

/**
 * Extract the author DID from an AT-URI of the form
 * `at://<did>/<collection>/<rkey>`. Returns null on a malformed
 * URI so callers can skip the row's endorsement decoration
 * silently rather than crashing the render.
 */
function projectAuthorDid(p: { uri: string }): string | null {
  if (!p.uri.startsWith("at://")) return null
  const tail = p.uri.slice("at://".length)
  const slash = tail.indexOf("/")
  return slash >= 0 ? tail.slice(0, slash) : null
}
