"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpDown, Search } from "lucide-react"
import Button from "@/components/ui/button"
import CertIcon from "@/components/ui/cert-icon"
import Input from "@/components/ui/input"
import RowThumb from "@/components/ui/row-thumb"
import Skeleton from "@/components/ui/skeleton"
import {
  Popover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { activityDetailHref } from "@/lib/atproto/activity-uri"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { deriveIdentity } from "@/lib/utils/identity"
import { formatShortDate } from "@/lib/utils/format-date"

// The building blocks every profile tab panel shares, so the tabs read
// like the Overview: a section header, a search field and a sort menu when
// the list is long, and rows on hairlines (`.profile-rows` / `.profile-row`
// in profile.css).

/** A list longer than this gets a search field and a sort menu. */
export const PANEL_SEARCH_MIN = 6

export interface SortOption<K extends string> {
  key: K
  label: string
}

/** The quiet count after a section title: muted tabular digits. Nothing
 *  while loading, and nothing for zero (the empty state says so). */
export function PanelCount({ n }: { n: number | null | undefined }) {
  if (n === null || n === undefined || n === 0) return null
  return <span className="profile-panel__count">{n.toLocaleString()}</span>
}

/**
 * The search field and the sort menu under a panel's header. Render it
 * only when the list is long (`PANEL_SEARCH_MIN`); `extra` holds more
 * menus (e.g. the owner's response filter).
 */
export function PanelTools<K extends string>({
  query,
  onQueryChange,
  searchLabel,
  sort,
  sortOptions,
  onSortChange,
  sortLabel,
  extra,
}: {
  query: string
  onQueryChange: (next: string) => void
  /** Placeholder and accessible name, e.g. "Search activities". */
  searchLabel: string
  sort: K
  sortOptions: SortOption<K>[]
  onSortChange: (next: K) => void
  /** Accessible name of the sort menu, e.g. "Sort activities". */
  sortLabel: string
  extra?: React.ReactNode
}) {
  return (
    <div className="profile-panel__tools">
      <div className="profile-panel__search">
        <Input
          type="search"
          size="sm"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          leadingIcon={<Search size={16} strokeWidth={1.75} aria-hidden />}
          // 44px and 16px text on phones (no iOS zoom on focus).
          className="max-[799px]:h-control-md max-[799px]:text-base"
        />
      </div>
      <div className="profile-panel__menus">
        {extra}
        <PanelMenu
          label={sortLabel}
          value={sort}
          options={sortOptions}
          onChange={onSortChange}
        />
      </div>
    </div>
  )
}

/**
 * A single-choice menu behind a quiet button that names the current
 * choice ("Newest first"). Used for sort and for the owner's filters.
 */
export function PanelMenu<K extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** Accessible name, e.g. "Sort activities". */
  label: string
  value: K
  options: SortOption<K>[]
  onChange: (next: K) => void
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.key === value) ?? options[0]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${label}: ${current?.label ?? ""}`}
          className="profile-panel__menu-btn"
        >
          <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
          {current?.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={label}>
        {options.map((opt) => (
          <PopoverItem
            key={opt.key}
            selected={opt.key === value}
            onClick={() => {
              onChange(opt.key)
              setOpen(false)
            }}
          >
            {opt.label}
          </PopoverItem>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** Loading rows shaped like the rows they stand in for. */
export function ProfileRowsSkeleton({
  rows = 3,
  shape = "square",
}: {
  rows?: number
  /** `square` for records (48px thumb), `circle` for accounts (32px). */
  shape?: "square" | "circle"
}) {
  return (
    <div className="profile-rows profile-rows--skeleton" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="profile-row">
          {shape === "circle" ? (
            <Skeleton circle width={32} />
          ) : (
            <Skeleton variant="box" width={48} height={48} />
          )}
          <div className="profile-row__text">
            <Skeleton variant="line" width={`${60 - (i % 3) * 10}%`} height={14} />
            <Skeleton variant="line" width={`${40 - (i % 2) * 10}%`} height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}

function uriToRkey(uri: string): string {
  const parts = uri.split("/")
  return parts[parts.length - 1] || ""
}

/**
 * One activity as a row: thumbnail, title, short description, and the
 * date. `authorDid` names the account that published it; pass it with
 * `showAuthor` when that isn't the profile being viewed (contributions,
 * or a group's activity on its admin's profile).
 */
export function ProfileActivityRow({
  activity,
  authorDid,
  showAuthor = false,
}: {
  activity: ActivityRecord
  authorDid: string
  showAuthor?: boolean
}) {
  const { value } = activity
  const imageUrl = value.image ? resolveActivityImageUrl(value.image, authorDid) : null
  return (
    <li>
      <Link
        href={activityDetailHref(authorDid, uriToRkey(activity.uri))}
        className="profile-row profile-row--link"
      >
        <RowThumb
          src={imageUrl}
          icon={<CertIcon size={20} strokeWidth={1.25} />}
          className="profile-row__thumb"
        />
        <span className="profile-row__text">
          <span className="profile-row__title" dir="auto">
            {value.title || "Untitled activity"}
          </span>
          {value.shortDescription ? (
            <span className="profile-row__desc" dir="auto">
              {value.shortDescription}
            </span>
          ) : null}
          {showAuthor ? <AuthorLine did={authorDid} /> : null}
        </span>
        {value.createdAt ? (
          <time className="profile-row__date" dateTime={value.createdAt}>
            {formatShortDate(value.createdAt)}
          </time>
        ) : null}
      </Link>
    </li>
  )
}

/** "by {name}" under a row's text, resolved from the author's DID. */
function AuthorLine({ did }: { did: string }) {
  const { info } = useAuthorInfo(did)
  const { displayName } = deriveIdentity(info, did)
  return (
    <span className="profile-row__meta" dir="auto">
      by {displayName}
    </span>
  )
}
