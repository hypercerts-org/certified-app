"use client"

import { MoreHorizontal, MoreVertical, type LucideIcon } from "lucide-react"
import Button from "@/components/ui/button"
import BottomSheet from "@/components/ui/bottom-sheet"
import {
  Popover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  MENU_ICON_CLASS,
  MENU_SEPARATOR_CLASS,
  menuRowClass,
} from "@/components/layout/menu-row"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"

/** One entry in a record's or a profile's "More actions" menu. */
export type MoreActionsEntry =
  | {
      kind?: "action"
      key: string
      label: string
      icon: LucideIcon
      onSelect: () => void
      /** Keeps the menu open after the click: a copy that says "Copied"
       *  in place, for the caller to close a moment later. */
      keepOpen?: boolean
      /** A red icon, after a separator (Delete), as in the Records rows. */
      destructive?: boolean
    }
  | { kind: "separator"; key: string }

const DESTRUCTIVE = "text-[var(--color-error)]"

/**
 * The "More actions" menu of a record page and a profile: a popover menu
 * from 800px and the same entries in a bottom sheet titled with the
 * record's or account's name below it, as the Records rows' menu
 * (`RowMenu` in records-shared.tsx) does (DESIGN.md §9.7). The trigger
 * keeps its place in the page's action row: a bordered button with
 * horizontal dots ("header") or quiet vertical dots ("quiet").
 *
 * Open state is the caller's, so a copy entry can keep the menu open a
 * moment to show "Copied" and close it after.
 */
export default function MoreActionsMenu({
  open,
  onOpenChange,
  title,
  entries,
  trigger = "header",
  label = "More actions",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The sheet's title on phones: the record's or account's name. */
  title: string
  entries: MoreActionsEntry[]
  trigger?: "header" | "quiet"
  /** The trigger's accessible name. */
  label?: string
}) {
  const { isDesktop } = useLayoutBreakpoints()
  const variant = trigger === "header" ? "secondary" : "ghost"
  const dots =
    trigger === "header" ? (
      <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
    ) : (
      <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
    )

  const select = (entry: Extract<MoreActionsEntry, { onSelect: () => void }>) => {
    if (!entry.keepOpen) onOpenChange(false)
    entry.onSelect()
  }

  if (!isDesktop) {
    return (
      <>
        <Button
          size="icon"
          variant={variant}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => onOpenChange(true)}
        >
          {dots}
        </Button>
        <BottomSheet open={open} onClose={() => onOpenChange(false)} title={title}>
          <div className="flex flex-col gap-0.5 px-2 pb-4">
            {entries.map((entry) => {
              if (entry.kind === "separator") {
                return <hr key={entry.key} className={MENU_SEPARATOR_CLASS} />
              }
              const Icon = entry.icon
              const tone = entry.destructive ? DESTRUCTIVE : ""
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={menuRowClass("sheet", tone)}
                  onClick={() => select(entry)}
                >
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    className={tone ? `shrink-0 ${tone}` : MENU_ICON_CLASS}
                    aria-hidden
                  />
                  <span>{entry.label}</span>
                </button>
              )
            })}
          </div>
        </BottomSheet>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger>
        <Button size="icon" variant={variant} aria-label={label}>
          {dots}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        {entries.map((entry) => {
          if (entry.kind === "separator") {
            return <hr key={entry.key} className={MENU_SEPARATOR_CLASS} />
          }
          const Icon = entry.icon
          return (
            <PopoverItem key={entry.key} onClick={() => select(entry)}>
              <Icon
                size={14}
                strokeWidth={1.75}
                className={entry.destructive ? `shrink-0 ${DESTRUCTIVE}` : undefined}
                aria-hidden
              />
              {entry.label}
            </PopoverItem>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
