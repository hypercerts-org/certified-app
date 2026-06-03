"use client"

import { useMemo } from "react"
import Link from "next/link"
import { FolderGit2, Plus } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import SegmentedControl from "@/components/ui/segmented-control"
import Select from "@/components/ui/select"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { usePageTitle } from "@/lib/navbar-context"
import { useManagedAuthors } from "@/hooks/use-managed-authors"
import { useIdentityFocus } from "@/hooks/use-identity-focus"
import { useManagedRecords, type ManagedItem } from "@/hooks/use-managed-records"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import type { OwnerTag } from "@/lib/atproto/owner-tag"
import type { OrgRole } from "@/lib/groups/types"

/**
 * The dedicated /managed hub: a single place that aggregates everything
 * the viewer is responsible for — records authored by their personal
 * account and by every group they own or admin — behind one focus
 * filter.
 *
 * The focus selection lives in `?focus=` so a refresh / shared link
 * keeps the same view. "Everything" is the default and stays bare in
 * the URL; "You" selects the personal identity; any other value is a
 * group DID. When a single group is focused, every row already shares
 * the same owner, so the per-row "via {group}" provenance line is
 * suppressed (it would be noise).
 *
 * Switch between a <SegmentedControl> (<=5 identities, fits a strip) and
 * a <Select> dropdown (more than 5) so the filter never overflows — both
 * driven by the shared `useIdentityFocus` hook.
 */

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

/** Title for a merged row — projects carry title/name, activities title. */
function itemTitle(item: ManagedItem): string {
  if (item.kind === "project") {
    return (
      asString(item.record.value.title) ||
      asString(item.record.value.name) ||
      "Untitled project"
    )
  }
  return item.record.value.title || "Untitled activity"
}

/** Detail href for a merged row, by kind. Falls back to "#" on a bad URI. */
function itemHref(item: ManagedItem): string {
  const parsed = parseAtUri(item.uri)
  if (!parsed) return "#"
  const seg = item.kind === "project" ? "project" : "activity"
  return `/${seg}/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
}

/** Thumbnail URL for a merged row, or null when the record has no image. */
function itemImageUrl(item: ManagedItem): string | null {
  const parsed = parseAtUri(item.uri)
  const did = parsed?.did ?? item.owner.ownerDid
  if (item.kind === "project") {
    const raw =
      (item.record.value as Record<string, unknown>).banner ??
      item.record.value.image
    return raw && did
      ? resolveActivityImageUrl(
          raw as Parameters<typeof resolveActivityImageUrl>[0],
          did,
        )
      : null
  }
  return item.record.value.image
    ? resolveActivityImageUrl(item.record.value.image, did)
    : null
}

export default function Managed() {
  usePageTitle("Managed")

  const { identities, isLoading: identitiesLoading } = useManagedAuthors()
  const { items, isLoading, isLoadingMore, hasMore, loadMore } =
    useManagedRecords()

  const {
    focus,
    setFocus,
    focusedDid,
    singleGroupFocused,
    filterOptions,
    useDropdown,
  } = useIdentityFocus(identities)

  const visibleItems = useMemo<ManagedItem[]>(() => {
    if (!focusedDid) return items
    return items.filter((item) => item.owner.ownerDid === focusedDid)
  }, [items, focusedDid])

  const showInitialSpinner = isLoading && items.length === 0

  return (
    <div className="managed-page">
      <div className="managed-page__inner">
        <header className="managed-page__head">
          <div className="managed-page__heading">
            <h1 className="managed-page__title">Managed</h1>
            <p className="managed-page__sub">
              Everything you&apos;re responsible for — yours and your groups&apos; —
              in one place
            </p>
          </div>
          <Link href="/create" className="managed-page__new">
            <Plus size={16} aria-hidden="true" />
            <span>New</span>
          </Link>
        </header>

        <div className="managed-page__filter">
          {identitiesLoading && identities.length === 0 ? null : useDropdown ? (
            <Select
              size="sm"
              aria-label="Focus"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              className="managed-page__filter-select"
            >
              {filterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          ) : (
            <SegmentedControl
              aria-label="Focus"
              size="md"
              value={focus}
              onValueChange={setFocus}
              options={filterOptions.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
            />
          )}
        </div>

        {showInitialSpinner ? (
          <div className="managed-page__loading">
            <LoadingSpinner size="md" />
          </div>
        ) : visibleItems.length === 0 ? (
          <EmptyState
            icon={FolderGit2}
            title="Nothing here yet"
            description="Projects and activities you and your groups create will collect here."
          >
            <Link href="/create" className="managed-page__new">
              <Plus size={16} aria-hidden="true" />
              <span>New</span>
            </Link>
          </EmptyState>
        ) : (
          <>
            <ul className="managed-list">
              {visibleItems.map((item) => (
                <ManagedRow
                  key={item.uri}
                  item={item}
                  suppressVia={singleGroupFocused}
                />
              ))}
            </ul>
            {hasMore ? (
              <div className="managed-page__more">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function ManagedRow({
  item,
  suppressVia,
}: {
  item: ManagedItem
  suppressVia: boolean
}) {
  const title = itemTitle(item)
  const href = itemHref(item)
  const imageUrl = itemImageUrl(item)
  const Icon = item.kind === "project" ? FolderGit2 : CertIcon
  const owner: OwnerTag = item.owner

  // The "via {group}" provenance line only appears for group-owned rows
  // in a mixed view. Personal rows ("You") and single-group-focused
  // views never show it.
  const showVia = !suppressVia && owner.kind === "group"
  const roleLabel = owner.role ? ROLE_LABEL[owner.role] : null

  return (
    <li className="managed-list__item">
      <Link href={href} className="managed-row">
        <span className="managed-row__thumb">
          {imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={imageUrl} alt="" loading="lazy" />
          ) : (
            <Icon
              size={16}
              strokeWidth={1.5}
              aria-hidden
              className="managed-row__thumb-icon"
            />
          )}
        </span>
        <span className="managed-row__body">
          <span className="managed-row__title">{title}</span>
          {showVia ? (
            <span className="managed-row__via">
              <span className="managed-row__via-label">via {owner.label}</span>
              {roleLabel ? (
                <span className="managed-row__via-role"> · {roleLabel}</span>
              ) : null}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}
