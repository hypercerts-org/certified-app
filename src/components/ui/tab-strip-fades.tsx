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
