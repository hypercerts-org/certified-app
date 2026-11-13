import { useEffect, type RefObject } from "react"

/**
 * Attribute that keeps a direct child of `<body>` out of `useInertOutside`.
 * For page-wide live surfaces that must stay usable while a sheet is open:
 * the toast region (an Undo stays tappable, and a toast raised meanwhile is
 * still announced).
 */
export const INERT_EXEMPT_ATTR = "data-inert-exempt"

/**
 * While `active`, make everything on the page except the given nodes
 * `inert`: unreachable by Tab, by click and by assistive tech. For a modal
 * surface that isn't a native `<dialog>` (the bottom sheet), so the page
 * behind its scrim behaves as if it weren't there.
 *
 * Works on the direct children of `<body>`: the app root and any portals.
 * The kept nodes must be direct children of `<body>` too (portalled
 * overlays are). Children that are already inert, that hold an open
 * `<dialog>`, that carry `data-inert-exempt` (the toast region), or that
 * aren't content (scripts, styles) are left alone, and only the attributes
 * this hook added are removed again.
 *
 * Declare it before `useFocusTrap` in the same component: cleanups run in
 * declaration order, so the page is interactive again by the time the trap
 * returns focus to the trigger.
 */
export function useInertOutside(
  active: boolean,
  keep: ReadonlyArray<RefObject<HTMLElement | null>>,
) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return
    const kept = keep.map((r) => r.current).filter((n): n is HTMLElement => !!n)
    if (kept.length === 0) return
    const made: Element[] = []
    for (const el of Array.from(document.body.children)) {
      if (kept.includes(el as HTMLElement)) continue
      if (kept.some((k) => el.contains(k))) continue
      if (/^(SCRIPT|STYLE|TEMPLATE|LINK|NOSCRIPT)$/.test(el.tagName)) continue
      if (el.hasAttribute(INERT_EXEMPT_ATTR)) continue
      if (el.hasAttribute("inert")) continue
      if (el.querySelector("dialog[open]")) continue
      el.setAttribute("inert", "")
      made.push(el)
    }
    return () => {
      for (const el of made) el.removeAttribute("inert")
    }
    // `keep` holds refs (stable objects); re-running per render would flap
    // the attribute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
