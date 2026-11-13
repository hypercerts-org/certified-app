"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { MoreHorizontal, type LucideIcon } from "lucide-react"
import Button from "@/components/ui/button"
import BottomSheet from "@/components/ui/bottom-sheet"
import Input from "@/components/ui/input"
import PageHeader from "@/components/ui/page-header"
import Skeleton from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  MENU_ICON_CLASS,
  MENU_SEPARATOR_CLASS,
  menuItemProps,
  menuRowClass,
  type MenuMode,
} from "@/components/layout/menu-row"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"

/** "1 activity" / "3 activities". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Case-insensitive substring match; an empty query matches everything. */
export function matches(text: string, q: string): boolean {
  return !q || text.toLowerCase().includes(q)
}

/**
 * The head of a pane: each Workspace section is a page of its own, so its
 * name is the page's `<h1>` (a `<PageHeader>`), with one line of
 * description and an optional action on the right.
 */
export function PaneHead({
  titleId,
  title,
  description,
  action,
}: {
  titleId: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <PageHeader
      titleId={titleId}
      title={title}
      description={description}
      actions={action}
      className="records-pane__head !mb-0"
    />
  )
}

export function SearchField({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label: string
}) {
  return (
    <div className="records-pane__search">
      <Input
        type="search"
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </div>
  )
}

/**
 * Loading rows shaped like the rows they stand in for: a 40px square
 * (records) or a 32px circle (people), a title line and a meta line.
 */
export function RowsSkeleton({
  rows = 5,
  shape = "square",
}: {
  rows?: number
  shape?: "square" | "circle"
}) {
  return (
    <ul className="records-list" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="records-row records-row--skeleton">
          {shape === "circle" ? (
            <Skeleton circle width={32} />
          ) : (
            <Skeleton variant="box" width={40} height={40} />
          )}
          <span className="records-row__text">
            <Skeleton variant="line" width={`${55 - (i % 3) * 10}%`} height={14} />
            <Skeleton variant="line" width={`${30 - (i % 2) * 8}%`} height={12} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** One entry in a row's "More actions" menu. */
export type RowMenuEntry =
  | {
      kind: "link"
      key: string
      label: string
      href: string
      icon: LucideIcon
      /** Only in the phone sheet: for an action the row shows as its own
       *  button from 800px (Edit) and leaves to the menu on phones. */
      phoneOnly?: boolean
    }
  | {
      kind: "action"
      key: string
      label: string
      /** Gets the menu's trigger, which stays mounted after the menu
       *  closes: pass it as a dialog's `returnFocusRef` so focus goes back
       *  to the row, not to `<body>`, when the dialog closes. */
      onSelect: (trigger: HTMLElement | null) => void
      icon: LucideIcon
      /** Shown under the label, muted, e.g. what an action keeps. */
      hint?: string
      destructive?: boolean
    }
  | { kind: "separator"; key: string }

function RowMenuItems({
  entries,
  mode,
  onDone,
  trigger,
}: {
  entries: RowMenuEntry[]
  mode: MenuMode
  onDone: () => void
  trigger: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <>
      {entries.map((e) => {
        if (e.kind === "separator") {
          return <hr key={e.key} className={MENU_SEPARATOR_CLASS} />
        }
        const Icon = e.icon
        const tone = e.kind === "action" && e.destructive ? "text-[var(--color-error)]" : ""
        const icon = (
          <Icon
            size={16}
            strokeWidth={1.75}
            className={tone ? `shrink-0 ${tone}` : MENU_ICON_CLASS}
            aria-hidden
          />
        )
        if (e.kind === "link") {
          return (
            <Link
              key={e.key}
              href={e.href}
              {...menuItemProps(mode)}
              className={menuRowClass(mode)}
              onClick={onDone}
            >
              {icon}
              <span>{e.label}</span>
            </Link>
          )
        }
        return (
          <button
            key={e.key}
            type="button"
            {...menuItemProps(mode)}
            className={menuRowClass(mode, tone)}
            onClick={() => {
              onDone()
              e.onSelect(trigger.current)
            }}
          >
            {icon}
            <span className="flex min-w-0 flex-col">
              <span>{e.label}</span>
              {e.hint ? (
                <span className="text-caption font-normal text-[var(--fg-muted)]">{e.hint}</span>
              ) : null}
            </span>
          </button>
        )
      })}
    </>
  )
}

/**
 * A row's "More actions" menu: a popover menu on desktop and the same
 * entries in a bottom sheet on phones (DESIGN.md §9.7). Entries marked
 * `phoneOnly` show in the sheet only.
 */
export function RowMenu({
  label,
  title,
  entries,
}: {
  /** Accessible name of the trigger, e.g. "More actions for River survey". */
  label: string
  /** The sheet's title on phones (the record's name). */
  title: string
  entries: RowMenuEntry[]
}) {
  const { isDesktop } = useLayoutBreakpoints()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const shown = isDesktop
    ? entries.filter((e) => !(e.kind === "link" && e.phoneOnly))
    : entries
  const trigger = (
    <Button
      ref={triggerRef}
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      tooltip="More actions"
      onClick={isDesktop ? undefined : () => setOpen(true)}
      aria-haspopup={isDesktop ? undefined : "dialog"}
      aria-expanded={isDesktop ? undefined : open}
    >
      <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
    </Button>
  )
  if (!isDesktop) {
    return (
      <>
        {trigger}
        <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
          <div className="flex flex-col gap-0.5 px-2 pb-4">
            <RowMenuItems
              entries={shown}
              mode="sheet"
              onDone={() => setOpen(false)}
              trigger={triggerRef}
            />
          </div>
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>{trigger}</PopoverTrigger>
      <PopoverContent portal side="bottom" align="end" offset={4} minWidth={220} aria-label={label}>
        <RowMenuItems
          entries={shown}
          mode="menu"
          onDone={() => setOpen(false)}
          trigger={triggerRef}
        />
      </PopoverContent>
    </Popover>
  )
}
