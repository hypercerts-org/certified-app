"use client"

import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import Skeleton from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { getInitials } from "@/lib/utils/initials"

/**
 * "Publishing as [avatar] Name": who the record will be written as. While
 * acting as a group this names the group (square avatar), so a form never
 * submits without saying who is publishing (redesign plan §2, "acting as a
 * group must be impossible to miss").
 *
 * The group comes straight from the org context; the personal account is
 * resolved through the batched resolve-did coalescer (`useAuthorInfo`),
 * which never rejects, so a slow lookup degrades to the handle or DID.
 */
export function PublishingAs({ label = "Publishing as" }: { label?: string }) {
  const { did } = useAuth()
  const { activeOrg } = useOrg()
  // Only resolve the personal account; a group's name and avatar are
  // already on the org context.
  const { info, isLoading } = useAuthorInfo(activeOrg ? null : (did ?? null))

  const name = activeOrg
    ? activeOrg.displayName || activeOrg.handle
    : info?.displayName || (info?.handle && info.handle !== did ? `@${info.handle}` : null)
  const handle = activeOrg ? activeOrg.handle : info?.handle
  const avatarUrl = activeOrg ? activeOrg.avatarUrl : info?.avatarUrl
  const loading = !activeOrg && isLoading && !info

  // A div, not a <p>: the Skeleton and Avatar render block elements.
  return (
    <div className="flex min-w-0 items-center gap-2 text-ui text-[var(--fg-secondary)]">
      <span className="shrink-0">{label}</span>
      {loading ? (
        <Skeleton variant="line" width="8rem" height="1rem" />
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar
            size="xs"
            shape={activeOrg ? "square" : "circle"}
            src={avatarUrl || undefined}
            fallbackInitials={getInitials(name, handle)}
            seed={activeOrg?.groupDid ?? did ?? undefined}
          />
          <span className="truncate font-medium text-[var(--fg-primary)]">
            {name || "your account"}
          </span>
        </span>
      )}
    </div>
  )
}

/**
 * A `SectionHeader` title with a muted, tabular count beside it
 * ("Contributors 3"). The count is hidden at zero.
 */
export function SectionTitleCount({ label, count }: { label: string; count: number }) {
  return (
    <>
      {label}
      {count > 0 ? (
        <span className="ml-2 font-normal tabular-nums text-[var(--fg-muted)]">
          {count}
        </span>
      ) : null}
    </>
  )
}

export interface FormActionBarProps {
  /** The primary verb + noun, e.g. "Publish activity" or "Save changes". */
  submitLabel: string
  /** Label while the request is in flight. Defaults to `submitLabel`. */
  submittingLabel?: string
  isSubmitting: boolean
  onCancel: () => void
  cancelLabel?: string
  /** Disable the primary button beyond `isSubmitting` (form-level gate). */
  submitDisabled?: boolean
  /**
   * `"submit"` (default) submits the enclosing `<form>`; `"button"` calls
   * `onSubmit` instead, for forms that aren't wrapped in one.
   */
  submitType?: "submit" | "button"
  onSubmit?: () => void
  /** A form-level error. Shown in the bar so it is visible at any scroll. */
  error?: string | null
  /** Lead of the identity line. Pass `null` to hide the line. */
  identityLabel?: string | null
  /** Product-tour hook on the primary button. */
  submitTourId?: string
}

/**
 * The one action bar for create and edit forms: "Publishing as …" on the
 * left, Cancel (secondary) and the primary action on the right. It sticks
 * to the bottom of the viewport (above the phone tab bar) while the form
 * scrolls, and settles at the end of the form once you reach it.
 *
 * Render it as the last child of the `<form>` inside a `<PageContainer>`;
 * the bar bleeds into the container's gutters so its hairline spans the
 * page column. Styles: `.form-action-bar` in cert-detail.css.
 */
export default function FormActionBar({
  submitLabel,
  submittingLabel,
  isSubmitting,
  onCancel,
  cancelLabel = "Cancel",
  submitDisabled = false,
  submitType = "submit",
  onSubmit,
  error = null,
  identityLabel = "Publishing as",
  submitTourId,
}: FormActionBarProps) {
  return (
    <div className="form-action-bar" role="group" aria-label="Form actions">
      {error ? (
        <p className="form-action-bar__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="form-action-bar__row">
        {identityLabel !== null ? (
          <PublishingAs label={identityLabel} />
        ) : (
          <span aria-hidden />
        )}
        <div className="form-action-bar__buttons">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </Button>
          <Button
            type={submitType}
            variant="primary"
            onClick={submitType === "button" ? onSubmit : undefined}
            loading={isSubmitting}
            disabled={isSubmitting || submitDisabled}
            data-tour={submitTourId}
          >
            {isSubmitting ? (submittingLabel ?? submitLabel) : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
