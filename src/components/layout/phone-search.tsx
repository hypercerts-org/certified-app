"use client"

import { useRef } from "react"
import { Search, X } from "lucide-react"
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
 * Closes on the close button, a tap on the dimmed page, opening a result
 * or Enter, a change of page, and Escape (the first Escape closes the
 * results when they are open, as in the field anywhere else).
 */
export default function PhoneSearch() {
  const [open, setOpen] = useRouteScopedOpen()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)

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
            <GlobalSearch placeholder="Search" className="phone-search__field" onNavigate={close} />
            {/* tooltip="": a body-portalled tooltip would sit under the
                top-layer dialog (and phones have none anyway). */}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              tooltip=""
              className="shrink-0"
              onClick={close}
            >
              <X size={20} strokeWidth={1.5} aria-hidden />
            </Button>
          </div>
        </AppDialog>
      ) : null}
    </>
  )
}
