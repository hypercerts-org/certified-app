"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MoreHorizontal, EyeOff, Eye, RotateCcw } from "lucide-react"
import {
  createResponse,
  deleteAllResponsesForAward,
  type BadgeResponseRecord,
  type ResponseState,
} from "@/lib/atproto/badges"

interface ResponseMenuProps {
  readonly awardUri: string
  readonly awardCid: string
  /** Used in the trigger's aria-label so SR users get per-row context. */
  readonly issuerDisplayName: string
  readonly ownerDid: string | null
  readonly state: ResponseState
  /** All of the owner's response records — needed for "Reset to default"
   *  which sweeps every vestigial response targeting this award. */
  readonly allResponses: BadgeResponseRecord[]
  /** Invoked after a write so the parent can refresh state + drop
   *  the row from the visible list when the action was Hide. */
  readonly onAfterWrite?: () => void | Promise<void>
}

/**
 * Quiet kebab-menu control rendered on profile / endorsements
 * audit-surface rows (the row's owner is viewing their own wall).
 *
 * Menu items vary by state:
 *
 *   - default / unknown  → "Hide from profile"
 *   - accepted           → "Hide from profile" + "Reset to default"
 *   - rejected           → "Show on profile" + "Reset to default"
 *
 * No "Show on profile" when state is already default-show — clicking
 * would be a no-op from the viewer's perspective (the award is
 * already visible). Adding an explicit Accept option here was
 * deliberately removed in the round-1 review (R2 C2): the profile
 * surface is for *cleanup*, not affirmation.
 *
 * The trigger is a 28x28 icon button; the menu floats below-right
 * using a portal so it isn't clipped by the row's overflow. Esc /
 * outside-click close the menu and return focus to the trigger.
 */
export default function ResponseMenu({
  awardUri,
  awardCid,
  issuerDisplayName,
  ownerDid,
  state,
  allResponses,
  onAfterWrite,
}: ResponseMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isWriting, setIsWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Outside-click + Esc close. Focus returns to the trigger so
  // keyboard users don't lose context.
  useEffect(() => {
    if (!isOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current || !triggerRef.current) return
      if (
        menuRef.current.contains(e.target as Node) ||
        triggerRef.current.contains(e.target as Node)
      ) {
        return
      }
      setIsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [isOpen])

  const writeResponse = useCallback(
    async (resp: "accepted" | "rejected") => {
      if (!ownerDid) return
      setIsWriting(true)
      setError(null)
      try {
        await createResponse(
          ownerDid,
          { uri: awardUri, cid: awardCid },
          resp,
        )
        setIsOpen(false)
        await onAfterWrite?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update")
      } finally {
        setIsWriting(false)
      }
    },
    [ownerDid, awardUri, awardCid, onAfterWrite],
  )

  const resetToDefault = useCallback(async () => {
    if (!ownerDid) return
    setIsWriting(true)
    setError(null)
    try {
      await deleteAllResponsesForAward(ownerDid, awardUri, allResponses)
      setIsOpen(false)
      await onAfterWrite?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset")
    } finally {
      setIsWriting(false)
    }
  }, [ownerDid, awardUri, allResponses, onAfterWrite])

  const hasResponse = state === "accepted" || state === "rejected"

  return (
    <div className="response-menu">
      <button
        ref={triggerRef}
        type="button"
        className="response-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Manage endorsement from ${issuerDisplayName}`}
        onClick={() => setIsOpen((v) => !v)}
        disabled={!ownerDid || isWriting}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Endorsement from ${issuerDisplayName}`}
          className="response-menu__menu"
        >
          {state === "rejected" ? (
            <button
              type="button"
              role="menuitem"
              className="response-menu__item"
              onClick={() => writeResponse("accepted")}
              disabled={isWriting}
            >
              <Eye size={14} aria-hidden="true" />
              <span>Show on profile</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="response-menu__item"
              onClick={() => writeResponse("rejected")}
              disabled={isWriting}
            >
              <EyeOff size={14} aria-hidden="true" />
              <span>Hide from profile</span>
            </button>
          )}
          {hasResponse ? (
            <button
              type="button"
              role="menuitem"
              className="response-menu__item"
              onClick={resetToDefault}
              disabled={isWriting}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Reset to default</span>
            </button>
          ) : null}
          {error ? (
            <p className="response-menu__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
