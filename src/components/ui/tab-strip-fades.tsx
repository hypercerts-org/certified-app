/**
 * The fades over a sideways-scrolling tab strip's edges, where more tabs
 * are (`useOverflowEdges`): a cut-off tab then reads as "scroll for more".
 * Render inside the strip's positioned frame, beside its scroller.
 */
export default function TabStripFades({ start, end }: { start: boolean; end: boolean }) {
  return (
    <>
      {start ? <span className="tab-strip-fade tab-strip-fade--start" aria-hidden="true" /> : null}
      {end ? <span className="tab-strip-fade tab-strip-fade--end" aria-hidden="true" /> : null}
    </>
  )
}

/**
 * Scrolls `strip` sideways just enough to show its selected tab, leaving a
 * little room past it. A no-op when the tab is already in view or when
 * everything fits.
 */
export function revealActiveTab(strip: HTMLElement, smooth: boolean) {
  const tab = strip.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
  if (!tab || strip.scrollWidth <= strip.clientWidth) return
  const tabLeft =
    tab.getBoundingClientRect().left -
    strip.getBoundingClientRect().left +
    strip.scrollLeft
  const tabRight = tabLeft + tab.offsetWidth
  const viewLeft = strip.scrollLeft
  const viewRight = viewLeft + strip.clientWidth
  if (tabLeft >= viewLeft && tabRight <= viewRight) return
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  strip.scrollTo({
    left: tabLeft < viewLeft ? tabLeft - 24 : tabRight - strip.clientWidth + 32,
    behavior: smooth && !reduceMotion ? "smooth" : "auto",
  })
}
