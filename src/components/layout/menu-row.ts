/**
 * Shared row styling for the shell's menus: the account menu and the New
 * menu. Each renders as a `<Popover>` menu on desktop ("menu" mode) and as
 * a list inside a `<BottomSheet>` on phones ("sheet" mode).
 *
 * - "menu": compact rows (36px) for a pointer; items are `role="menuitem"`
 *   with `tabIndex={-1}` so the Popover's arrow-key roving moves focus.
 * - "sheet": 44px rows (the touch minimum), ordinary tabbable links and
 *   buttons inside the sheet's dialog.
 *
 * Hover styles only apply on hover-capable devices (Tailwind
 * `hoverOnlyWhenSupported`); keyboard focus shows the same tint plus the
 * focus ring.
 */
export type MenuMode = "menu" | "sheet"

const ROW_BASE =
  "flex w-full items-center gap-3 rounded px-3 text-left text-body-sm font-medium text-[var(--fg-primary)] no-underline bg-transparent border-0 cursor-pointer transition-colors duration-fast motion-reduce:transition-none select-none [-webkit-touch-callout:none] hover:bg-[var(--overlay-weak)] focus-visible:bg-[var(--overlay-weak)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-[-2px]"

export function menuRowClass(mode: MenuMode, extra = ""): string {
  const size = mode === "menu" ? "min-h-9 py-1.5" : "min-h-control-md py-2"
  return `${ROW_BASE} ${size} ${extra}`.trim()
}

/** Leading icon colour for menu rows (16px, muted; DESIGN.md §8). */
export const MENU_ICON_CLASS = "shrink-0 text-[var(--fg-muted)]"

/** Props that make an element a roving menu item in "menu" mode. */
export function menuItemProps(mode: MenuMode): { role?: "menuitem"; tabIndex?: number } {
  return mode === "menu" ? { role: "menuitem", tabIndex: -1 } : {}
}

/** A hairline between groups of rows. */
export const MENU_SEPARATOR_CLASS = "my-1 h-px border-0 bg-[var(--border-subtle)]"
