"use client"

import { useState, type ReactNode } from "react"
import { Filter as FilterIcon } from "lucide-react"
import Button from "@/components/ui/button"
import ResponsiveDialog from "@/components/ui/responsive-dialog"
import { AppDialogHeader } from "@/components/ui/app-dialog"

/**
 * The phone Filters control of the Network pages (Graph, Map, Funding):
 * a "Filters" button (with "· N" once N settings differ from the
 * defaults) that opens the page's filters in a bottom sheet with Reset
 * and Done, the same pattern and styles as /feed's and /explore's Filters
 * sheets. Changes apply as they are made; Done closes.
 *
 * The caller decides where it shows (phones; from 800px the filters stay
 * in the page, in the side column from 1100px) and passes the controls as
 * children.
 */
export default function NetworkFiltersSheet({
  changed = 0,
  onReset,
  resetDisabled,
  className = "",
  children,
}: {
  /** How many settings differ from the defaults. */
  changed?: number
  /** Back to the defaults. Without it the sheet has Done only. */
  onReset?: () => void
  /** Defaults to `changed === 0`. */
  resetDisabled?: boolean
  /** Extra class on the trigger button. */
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <>
      <Button
        variant="secondary"
        size="md"
        className={`network-filters__btn ${className}`.trim()}
        aria-label={changed > 0 ? `Filters, ${changed} changed` : "Filters"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <FilterIcon size={16} strokeWidth={1.75} aria-hidden />
        <span className="tabular-nums">
          {changed > 0 ? `Filters · ${changed}` : "Filters"}
        </span>
      </Button>
      <ResponsiveDialog
        open={open}
        onClose={close}
        ariaLabel="Filters"
        header={<AppDialogHeader title="Filters" onClose={close} />}
        className="feed-filter-dialog network-filters"
      >
        <div className="feed-filter-dialog__body network-filters__body">
          {children}
        </div>
        <div className="feed-filter-dialog__footer">
          {onReset ? (
            <Button
              variant="secondary"
              onClick={onReset}
              disabled={resetDisabled ?? changed === 0}
            >
              Reset
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  )
}
