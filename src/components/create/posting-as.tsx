"use client"

import { ChevronDown } from "lucide-react"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import IdentityRow from "@/components/ui/identity-row"
import Badge from "@/components/ui/badge"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import type { PostingIdentity } from "@/lib/groups/posting-identity"

/**
 * Per-action "Posting as ▾" write picker.
 *
 * The org-identity write model is per-action: every create/award/endorse
 * chooses which repo it lands in at the moment of writing. This control
 * surfaces that choice. It is presentation-only — the chosen
 * {@link PostingIdentity} carries the target `did`, which a caller feeds
 * to the `writeToRepo({ targetDid })` seam.
 *
 * Two shapes:
 *  - When the only option is You (the viewer admins no groups), it
 *    renders a STATIC "Posting as You" label — no menu, nothing to pick.
 *  - Otherwise it renders a dropdown trigger ("Posting as <name> ▾")
 *    over a single-select menu of You + each writable group. Each row is
 *    an {@link IdentityRow} (avatar + name + @handle) tagged with a
 *    role {@link Badge} for group rows. The menu items are
 *    `role="menuitemradio"` (via <PopoverContent>'s native menu chrome)
 *    so the picker reads as "pick exactly one identity".
 *
 * The default is always You; the picker never seeds from the active org.
 */

export interface PostingAsProps {
  value: PostingIdentity
  onChange: (next: PostingIdentity) => void
  options: PostingIdentity[]
  /** Trigger/label sizing. @default "md" */
  size?: "sm" | "md"
  className?: string
  /** Accessible name for the trigger / static label. */
  "aria-label"?: string
}

const ROLE_LABEL: Record<NonNullable<PostingIdentity["role"]>, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

/** Tiny presentational row shared by the trigger summary + each menu item. */
function IdentitySummary({
  identity,
  size,
}: {
  identity: PostingIdentity
  size: "sm" | "md"
}) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <IdentityRow
        did={identity.did}
        handle={identity.handle}
        displayName={identity.label}
        avatarUrl={identity.avatarUrl}
        size={size === "sm" ? "sm" : "md"}
      />
      {identity.kind === "group" && identity.role ? (
        <Badge variant="role">{ROLE_LABEL[identity.role]}</Badge>
      ) : null}
    </span>
  )
}

export default function PostingAs({
  value,
  onChange,
  options,
  size = "md",
  className = "",
  "aria-label": ariaLabel = "Posting as",
}: PostingAsProps) {
  const labelTextClass =
    size === "sm" ? "text-body-sm" : "text-body"

  // Single option (You only) → static label, no menu. There is nothing
  // to choose, so don't surface an interactive trigger.
  if (options.length <= 1) {
    return (
      <span
        className={`inline-flex items-center gap-2 ${labelTextClass} text-[var(--fg-muted)] ${className}`}
        aria-label={ariaLabel}
      >
        <span className="shrink-0">Posting as</span>
        <IdentitySummary identity={value} size={size} />
      </span>
    )
  }

  return (
    <Popover>
      <PopoverTrigger>
        <button
          type="button"
          aria-label={ariaLabel}
          className={`inline-flex items-center gap-2 ${labelTextClass} text-[var(--fg-primary)] rounded px-2 py-1 border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 ${className}`}
        >
          <span className="shrink-0 text-[var(--fg-muted)]">Posting as</span>
          <IdentitySummary identity={value} size={size} />
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[var(--fg-muted)]"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" minWidth={240}>
        {options.map((opt) => {
          const selected = opt.did === value.did
          return (
            <button
              key={`${opt.kind}:${opt.did}`}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              tabIndex={-1}
              onClick={() => onChange(opt)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left rounded hover:bg-[var(--overlay-weak)] focus:bg-[var(--overlay-weak)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 focus:outline-none"
            >
              <IdentitySummary identity={opt} size="sm" />
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

export interface PostingAsConfirmProps {
  /** The chosen group identity that will author the high-stakes record. */
  endorser: PostingIdentity
  /** The operating viewer (you), plus the role you hold on the group. */
  operator: { label: string; handle?: string; role?: PostingIdentity["role"] }
  /** Human label for the subject of the action (who is being endorsed /
   *  awarded). Free text — callers resolve it (handle / display name). */
  subject: string
  /** Verb for the action, e.g. "endorse" or "award a badge to". */
  actionLabel?: string
  confirmLabel?: string
  isConfirming?: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}

/**
 * Confirmation gate for a HIGH-STAKES group-authored write (see
 * `HIGH_STAKES_COLLECTIONS`). Spells out the three parties so the
 * operator can't fat-finger a reputation-bearing record under the wrong
 * identity:
 *
 *   - ENDORSER — the group the record is authored AS
 *   - OPERATOR — you, and the role you hold on that group
 *   - SUBJECT  — who the action names
 *
 * Wraps the shared {@link ConfirmDialog} chrome; the body is built from
 * the named parties. Callers show this before committing the write.
 */
export function PostingAsConfirm({
  endorser,
  operator,
  subject,
  actionLabel = "endorse",
  confirmLabel = "Confirm",
  isConfirming = false,
  onCancel,
  onConfirm,
}: PostingAsConfirmProps) {
  const operatorRole = operator.role ? ROLE_LABEL[operator.role] : null
  const operatorWho = operator.handle
    ? `${operator.label} (@${operator.handle})`
    : operator.label
  const message =
    `You are about to ${actionLabel} ${subject} as ${endorser.label}` +
    `${endorser.handle ? ` (@${endorser.handle})` : ""}. ` +
    `This record is authored by the group, not by you. ` +
    `Operating as ${operatorWho}${operatorRole ? ` — ${operatorRole}` : ""}.`

  return (
    <ConfirmDialog
      title={`Post as ${endorser.label}?`}
      message={message}
      confirmLabel={confirmLabel}
      confirmVariant="primary"
      isConfirming={isConfirming}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
