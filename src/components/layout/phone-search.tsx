"use client"

import { useEffect, useRef } from "react"
import { Search } from "lucide-react"
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open"
import AppDialog from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import GlobalSearch from "@/components/search/global-search"

/**
 * The phone top bar's search (below 800px; navbar.tsx shows it on the
 * top-level pages): a Search icon that opens the global search as a
 * full-width panel at the top of the screen, over the dimmed page, with
 * the field focused and its results right under it (the same search as
 * the desktop sidebar's: activities, projects and accounts across the
 * network; Enter searches Explore).
 *
 * Closes on Cancel, a tap on the dimmed page, opening a result or Enter, a
 * change of page, and Escape (the first Escape closes the results when they
 * are open, as in the field anywhere else). Cancel is a word, not a second
 * X beside the field's own clear button (which empties the field). Focus
 * goes back to the Search button when the panel is dismissed, not when a
 * result or Enter left for another page.
 */
export default function PhoneSearch() {
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Set when a result or Enter closed the panel: the reader is on their way
  // to another page, so the Search button shouldn't take focus (and show a
  // ring) behind them.
  const navigatedRef = useRef(false)
  const close = () => setOpen(false)
  const closeForNavigation = () => {
    navigatedRef.current = true
    setOpen(false)
  }

  // The dialog hands focus back to the trigger as it unmounts (its effect
  // cleanup runs before this effect in the same commit); after a
  // navigation, let it go again.
  useEffect(() => {
    if (open || !navigatedRef.current) return
    navigatedRef.current = false
    if (document.activeElement === triggerRef.current) triggerRef.current?.blur()
  }, [open])

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Search size={20} strokeWidth={1.5} aria-hidden />
      </Button>
      {open ? (
        <AppDialog
          ariaLabel="Search"
          onClose={close}
          returnFocusRef={triggerRef}
          autoFocusFirst
          className="phone-search"
        >
          <div
            ref={panelRef}
            className="phone-search__bar"
            // The field keeps Escape for itself (it closes its results,
            // then clears), so the dialog's own Escape never comes: close
            // here once no results are open.
            onKeyDownCapture={(e) => {
              if (e.key !== "Escape") return
              if (panelRef.current?.querySelector('[role="listbox"]')) return
              e.preventDefault()
              e.stopPropagation()
              close()
            }}
          >
            <GlobalSearch
              placeholder="Search"
              className="phone-search__field"
              onNavigate={closeForNavigation}
            />
            <Button
              variant="ghost"
              size="sm"
              className="phone-search__cancel"
              onClick={close}
            >
              Cancel
            </Button>
          </div>
        </AppDialog>
      ) : null}
    </>
  )
}
