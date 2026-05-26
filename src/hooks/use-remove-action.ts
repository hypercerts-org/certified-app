"use client"

import { useCallback, useState } from "react"

/**
 * Wrap an async "remove this row" handler in the standard
 * busy / re-entrancy / error-recovery dance every list-row uses:
 *
 *   - First click flips `removing` to true; concurrent clicks are
 *     swallowed (no double-fire).
 *   - On success the row typically unmounts — the hook leaves
 *     `removing` true so the disabled state holds through the
 *     unmount window.
 *   - On error `removing` flips back to false and the error is
 *     logged, so the user can retry without a stuck-disabled button.
 *
 * Used by both ItemRowShell (account + cert variants) and
 * ProjectItemRow in profile-lists.tsx; previously the same 12-line
 * pattern lived inline in both call sites.
 */
export function useRemoveAction(
  onRemove: () => Promise<unknown>,
): { removing: boolean; handleRemove: () => Promise<void> } {
  const [removing, setRemoving] = useState(false)
  const handleRemove = useCallback(async () => {
    if (removing) return
    setRemoving(true)
    try {
      await onRemove()
    } catch (err) {
      console.error("Failed to remove item:", err)
      setRemoving(false)
    }
  }, [removing, onRemove])
  return { removing, handleRemove }
}
