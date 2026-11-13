"use client"

import Link from "next/link"
import {
  ExternalLink,
  FolderMinus,
  FolderPlus,
  Pencil,
  Trash2,
  Users,
} from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import CertIcon from "@/components/ui/cert-icon"
import Checkbox from "@/components/ui/checkbox"
import RowThumb from "@/components/ui/row-thumb"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useContributorInfo } from "@/hooks/use-contributor-info"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import type { ActivityContributor, ActivityRecord } from "@/lib/atproto/activity-types"
import { formatShortDate, formatTimePeriod } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"
import { parseAtUri, recordUrl, rkeyFromUri } from "@/lib/urls"
import { RowMenu, type RowMenuEntry } from "@/components/records/records-shared"

/** Avatars shown before "+N" (Primer's avatar stack caps at four). */
const MAX_AVATARS = 4

/** The identity string of a contributor, or null for a strong-ref one. */
function contributorIdentity(c: ActivityContributor): string | null {
  const id = c?.contributorIdentity as unknown
  if (typeof id === "string") return id.trim() || null
  if (id && typeof id === "object") {
    const identity = (id as { identity?: unknown }).identity
    if (typeof identity === "string") return identity.trim() || null
  }
  return null
}

function ContributorAvatar({ identity }: { identity: string }) {
  const { info, isAtproto } = useContributorInfo(identity)
  const name = isAtproto
    ? info?.displayName || (info?.handle ? `@${info.handle}` : identity)
    : identity
  return (
    <span className="records-contributors__item" title={name}>
      <Avatar
        size="xs"
        src={info?.avatarUrl ?? undefined}
        fallbackInitials={
          isAtproto ? getInitials(info?.displayName, info?.handle) : getInitials(identity)
        }
        seed={info?.did ?? identity}
        bordered
      />
      <span className="sr-only">{name}</span>
    </span>
  )
}

/**
 * Up to four contributor avatars, then "+N". Read straight from the
 * activity record's `contributors` (DIDs and handles resolve to profiles;
 * plain-text names show their initials). Strong-ref contributors count
 * toward "+N" but have no avatar.
 */
export function ContributorStack({ contributors }: { contributors: unknown }) {
  const list = Array.isArray(contributors) ? (contributors as ActivityContributor[]) : []
  if (list.length === 0) return null
  const identities = list.map(contributorIdentity).filter((v): v is string => !!v)
  const shown = identities.slice(0, MAX_AVATARS)
  const more = list.length - shown.length
  return (
    <span className="records-contributors">
      <span className="sr-only">Contributors: </span>
      {shown.map((identity, i) => (
        <ContributorAvatar key={`${identity}#${i}`} identity={identity} />
      ))}
      {more > 0 ? (
        <span className="records-contributors__more" title={`${more} more`}>
          <span aria-hidden>+{more}</span>
          <span className="sr-only">and {more} more</span>
        </span>
      ) : null}
    </span>
  )
}

/** The other projects an activity sits in: the first name, then "+N". */
export function ProjectChips({ titles }: { titles: string[] }) {
  if (titles.length === 0) return null
  const [first, ...rest] = titles
  return (
    <span className="records-chips" title={`Also in ${titles.join(", ")}`}>
      <span className="sr-only">Also in </span>
      <span className="records-chip" dir="auto">{first}</span>
      {rest.length > 0 ? (
        <span className="records-chip records-chip--count">
          <span aria-hidden>+{rest.length}</span>
          <span className="sr-only">and {rest.length} more</span>
        </span>
      ) : null}
    </span>
  )
}

function activityMeta(record: ActivityRecord): string {
  const period = formatTimePeriod(record.value.startDate ?? null, record.value.endDate ?? null)
  if (period) return period
  return record.value.createdAt ? `Created ${formatShortDate(record.value.createdAt)}` : "Activity"
}

export interface ActivityRowProps {
  record: ActivityRecord
  /** The viewer's DID: rows from other repos are read-only. */
  did: string
  /** Handle (preferred) or DID for the viewer's record URLs. */
  actor: string
  /** Names of the other projects this activity sits in. */
  otherProjects: string[]
  selected: boolean
  onToggleSelect: (uri: string) => void
  onDelete: (record: ActivityRecord) => void
  onAddToProject: (record: ActivityRecord) => void
  /** Set inside a project folder: removes it from that project. */
  onRemoveFromProject?: (record: ActivityRecord) => void
  /** The folder's project name, for the remove action's wording. */
  folderTitle?: string
  /** A write touching this row is in flight. */
  busy?: boolean
}

/**
 * One activity row. Left to right: a select checkbox (own activities;
 * shown on hover or focus with a pointer, always on touch), the thumbnail
 * and title over its dates (both open the activity), chips for the other
 * projects it sits in, contributor avatars, then Edit and Delete with a
 * "More actions" menu (Open, Edit, Contributors…, Add to project…, Remove
 * from project, Delete). On phones only the menu stays on the row.
 *
 * An activity another account published can sit in your project: it
 * reads "By @handle", can't be selected, and offers Open and Remove from
 * project only.
 */
export default function ActivityRow({
  record,
  did,
  actor,
  otherProjects,
  selected,
  onToggleSelect,
  onDelete,
  onAddToProject,
  onRemoveFromProject,
  folderTitle,
  busy = false,
}: ActivityRowProps) {
  const parsed = parseAtUri(record.uri)
  const ownerDid = parsed?.did ?? did
  const isOwn = ownerDid === did
  const rkey = parsed?.rkey ?? rkeyFromUri(record.uri)
  const href = recordUrl(isOwn ? actor : ownerDid, "activity", rkey)
  const title = record.value.title || "Untitled activity"
  const { info: owner } = useAuthorInfo(isOwn ? null : ownerDid)
  const meta = isOwn
    ? activityMeta(record)
    : `By ${owner?.handle ? `@${owner.handle}` : "another account"}`

  const removeEntry: RowMenuEntry[] = onRemoveFromProject
    ? [
        {
          kind: "action",
          key: "remove",
          label: folderTitle ? `Remove from ${folderTitle}` : "Remove from project",
          hint: "The activity itself is kept",
          icon: FolderMinus,
          onSelect: () => onRemoveFromProject(record),
        },
      ]
    : []
  const entries: RowMenuEntry[] = isOwn
    ? [
        { kind: "link", key: "open", label: "Open", href, icon: ExternalLink },
        { kind: "link", key: "edit", label: "Edit", href: `${href}/edit`, icon: Pencil },
        {
          kind: "link",
          key: "contributors",
          label: "Contributors…",
          href: `${href}/edit#contributors`,
          icon: Users,
        },
        {
          kind: "action",
          key: "add",
          label: "Add to project…",
          icon: FolderPlus,
          onSelect: () => onAddToProject(record),
        },
        ...removeEntry,
        { kind: "separator", key: "sep" },
        {
          kind: "action",
          key: "delete",
          label: "Delete",
          icon: Trash2,
          destructive: true,
          onSelect: () => onDelete(record),
        },
      ]
    : [{ kind: "link", key: "open", label: "Open", href, icon: ExternalLink }, ...removeEntry]

  return (
    <li
      className="records-row records-row--activity"
      data-selected={selected || undefined}
      aria-busy={busy || undefined}
    >
      {isOwn ? (
        <label className="records-row__check">
          <Checkbox
            checked={selected}
            onChange={() => onToggleSelect(record.uri)}
            aria-label={`Select ${title}`}
          />
        </label>
      ) : (
        <span className="records-row__check" aria-hidden />
      )}
      <Link href={href} className="records-row__main">
        <RowThumb
          className="records-row__thumb"
          src={record.value.image ? resolveActivityImageUrl(record.value.image, ownerDid) : null}
          icon={<CertIcon size={16} strokeWidth={1.5} aria-hidden />}
        />
        <span className="records-row__text">
          <span className="records-row__title" dir="auto">{title}</span>
          <span className="records-row__meta">
            <span className="records-row__meta-text">{meta}</span>
            <ProjectChips titles={otherProjects} />
          </span>
        </span>
      </Link>
      <ContributorStack contributors={record.value.contributors} />
      <div className="records-row__actions">
        {isOwn ? (
          <span className="records-row__inline-actions">
            <Button
              href={`${href}/edit`}
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${title}`}
              tooltip="Edit"
            >
              <Pencil size={16} strokeWidth={1.75} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${title}`}
              tooltip="Delete"
              onClick={() => onDelete(record)}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden />
            </Button>
          </span>
        ) : null}
        <RowMenu label={`More actions for ${title}`} title={title} entries={entries} />
      </div>
    </li>
  )
}
