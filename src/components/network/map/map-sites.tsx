"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { geoContains } from "d3-geo"
import SegmentedControl from "@/components/ui/segmented-control"
import Button from "@/components/ui/button"
import Avatar from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils/initials"
import type { Account, Activity, LayerCounts, Org, Project } from "@/lib/map/model"
import { REGION_KM2, buildSites, inPitches, tileShape, type Site, type SiteKind, type SiteUse, type TileShape } from "@/lib/map/sites"
import WorldMap, { type MapApi, type WorldMapHandle } from "./world-map"
import type { MapViewProps } from "./view-props"
import type { MapColors } from "./map-colors"
import { formatArea, formatDate } from "./map-browse"
import { MARK_R, dot, hollow, pill, ring, ringDot, selectRing, square } from "./marks"

/**
 * The Sites view: the boundaries people drew around the land they work on,
 * as a gallery of outlines beside the map.
 *
 *  - Each tile draws one outline at its own scale, with a scale bar. The
 *    same outline saved several times is one tile, marked ×n.
 *  - Regions (over 10,000 km²) and test shapes are hidden until asked for.
 *  - Picking a tile flies the map to the site and opens its details under
 *    the tile's row. On the map a site is a mark until its outline is big
 *    enough to see; close in, satellite imagery shows the ground.
 */

type Sort = "size" | "name" | "country"
type Filter = "all" | "used" | "unused"

/** A drawn area shows its outline once it is this wide on screen (as on Places). */
const OUTLINE_PX = 12
/** How close (in pixels) marks must be to share a pill. */
const CLUSTER_W = 64
const CLUSTER_H = 26
/** Uses listed in the details before "and n more". */
const USES_SHOWN = 6

const detailId = "map-sites-detail"

const SORT_LABEL: Record<Sort, string> = { size: "largest first", name: "by name", country: "by country" }

interface Drawn {
  marks: { x: number; y: number; r: number; site: Site }[]
  pills: { x: number; y: number; w: number; h: number; sites: Site[] }[]
  /** Sites drawn as outlines, smallest first (they win a hit test). */
  outlines: Site[]
}

interface Tip {
  x: number
  y: number
  title: string
  detail: string
}

export default function MapSites({ model, kind, height, resize }: MapViewProps) {
  const [sort, setSort] = useState<Sort>("size")
  const [filter, setFilter] = useState<Filter>("all")
  const [showHidden, setShowHidden] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const [cols, setCols] = useState(3)
  const mapRef = useRef<WorldMapHandle>(null)
  const mapBoxRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const drawn = useRef<Drawn>({ marks: [], pills: [], outlines: [] })

  const sites = useMemo(() => buildSites(model), [model])
  const shapes = useMemo(() => new Map(sites.map((s) => [s.key, tileShape(s.feature)])), [sites])
  const byKey = useMemo(() => new Map(sites.map((s) => [s.key, s])), [sites])

  const passes = useCallback((s: Site) => filter === "all" || (filter === "used") === s.used, [filter])
  const shown = useMemo(() => sortSites(sites.filter((s) => passes(s) && (showHidden || !s.hidden)), sort), [sites, passes, showHidden, sort])
  const selected = selectedKey ? (shown.find((s) => s.key === selectedKey) ?? null) : null

  const counts = useMemo(() => {
    const pool = sites.filter((s) => showHidden || !s.hidden)
    return { all: pool.length, used: pool.filter((s) => s.used).length, unused: pool.filter((s) => !s.used).length }
  }, [sites, showHidden])
  const hidden = useMemo(() => {
    const h = sites.filter((s) => s.hidden && passes(s))
    return { total: h.length, regions: h.filter((s) => !s.test).length, tests: h.filter((s) => s.test).length }
  }, [sites, passes])
  const copies = shown.reduce((t, s) => t + s.places.length - 1, 0)

  // --- Drawing ---
  const draw = useCallback(
    (a: MapApi) => {
      const { ctx, colors: c } = a
      const outlines: { site: Site; w: number; h: number }[] = []
      const points: { site: Site; x: number; y: number }[] = []
      for (const s of shown) {
        const [[x0, y0], [x1, y1]] = a.path.bounds(s.feature)
        const w = x1 - x0
        const h = y1 - y0
        if (Number.isFinite(w) && Math.max(w, h) >= OUTLINE_PX) {
          outlines.push({ site: s, w, h })
          continue
        }
        const p = a.project(s.lng, s.lat)
        if (p && p[0] > -20 && p[0] < a.width + 20 && p[1] > -20 && p[1] < a.height + 20) points.push({ site: s, x: p[0], y: p[1] })
      }

      // Outlines, largest first so the small ones stay on top; the one
      // picked or pointed at last.
      const on = (s: Site) => s.key === selectedKey || s.key === hoverKey
      outlines.sort((p, q) => Number(on(p.site)) - Number(on(q.site)) || q.site.km2 - p.site.km2)
      for (const { site: s, w, h } of outlines) {
        const lit = on(s)
        // A region, or bigger than the view: an edge only, no fill.
        const huge = s.region || w > a.width * 1.5 || h > a.height * 1.5
        const color = kindColor(c, s.kind)
        ctx.save()
        ctx.beginPath()
        a.path(s.feature)
        if (!huge || lit) {
          // Fainter as it grows on screen, so the ground inside shows.
          ctx.globalAlpha = (lit ? 0.24 : 0.16) * Math.max(0.35, Math.min(1, 160 / Math.max(w, h)))
          ctx.fillStyle = color
          ctx.fill()
        }
        // A halo first, so the edge reads on satellite imagery too.
        ctx.lineJoin = "round"
        ctx.globalAlpha = 0.75
        ctx.lineWidth = lit ? 5 : 3.5
        ctx.strokeStyle = c.halo
        ctx.stroke()
        ctx.globalAlpha = huge && !lit ? 0.6 : 1
        ctx.lineWidth = lit ? 2.5 : 1.5
        if (s.kind === "unused" && !lit) ctx.setLineDash([4, 3])
        ctx.strokeStyle = lit ? c.fg : color
        ctx.stroke()
        // Parts too small to see (plots far apart in one outline): a ring each.
        if (s.feature.coordinates.length > 1) {
          ctx.setLineDash([])
          ctx.globalAlpha = 1
          ctx.lineWidth = 1.5
          for (const polygon of s.feature.coordinates) {
            const [[px0, py0], [px1, py1]] = a.path.bounds({ type: "Polygon", coordinates: polygon })
            if (!Number.isFinite(px0) || Math.max(px1 - px0, py1 - py0) >= 6) continue
            ctx.beginPath()
            ctx.arc((px0 + px1) / 2, (py0 + py1) / 2, 5, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
        ctx.restore()
      }

      // Sites too small to see: marks, and pills where they crowd.
      const cells: { cx: number; cy: number; x: number; y: number; items: { site: Site; x: number; y: number }[] }[] = []
      for (const pt of points.sort((p, q) => q.site.km2 - p.site.km2)) {
        let cell = cells.find((k) => Math.abs(k.cx - pt.x) < CLUSTER_W && Math.abs(k.cy - pt.y) < CLUSTER_H)
        if (!cell) cells.push((cell = { cx: pt.x, cy: pt.y, x: 0, y: 0, items: [] }))
        cell.x += pt.x
        cell.y += pt.y
        cell.items.push(pt)
      }
      // Cells whose pills would still overlap join up.
      for (let merged = true; merged; ) {
        merged = false
        for (let i = 0; i < cells.length && !merged; i++) {
          for (let j = i + 1; j < cells.length && !merged; j++) {
            const p = cells[i]
            const q = cells[j]
            if (
              Math.abs(p.x / p.items.length - q.x / q.items.length) < CLUSTER_W &&
              Math.abs(p.y / p.items.length - q.y / q.items.length) < CLUSTER_H
            ) {
              p.x += q.x
              p.y += q.y
              p.items.push(...q.items)
              cells.splice(j, 1)
              merged = true
            }
          }
        }
      }
      const marks: Drawn["marks"] = []
      const pills: Drawn["pills"] = []
      for (const cell of cells) {
        if (cell.items.length === 1) continue
        const n: LayerCounts = { activity: 0, project: 0, org: 0, unused: 0 }
        for (const it of cell.items) n[it.site.kind]++
        const box = pill(ctx, c, cell.x / cell.items.length, cell.y / cell.items.length, n)
        pills.push({ ...box, sites: cell.items.map((it) => it.site) })
      }
      for (const cell of cells) {
        if (cell.items.length !== 1) continue
        const { site: s, x, y } = cell.items[0]
        const r = siteMark(ctx, c, x, y, s.counts)
        if (on(s)) selectRing(ctx, c, x, y, r)
        marks.push({ x, y, r, site: s })
      }
      // The picked site inside a pill: still show where it is.
      for (const key of [selectedKey, hoverKey]) {
        const pt = key ? points.find((p) => p.site.key === key) : undefined
        if (!pt || marks.some((m) => m.site.key === key)) continue
        const r = siteMark(ctx, c, pt.x, pt.y, pt.site.counts)
        selectRing(ctx, c, pt.x, pt.y, r)
        marks.push({ x: pt.x, y: pt.y, r, site: pt.site })
      }
      drawn.current = {
        marks,
        pills,
        outlines: outlines.map((o) => o.site).sort((p, q) => p.km2 - q.km2),
      }
    },
    [shown, selectedKey, hoverKey],
  )

  // --- Pointer on the map ---
  const hitAt = (x: number, y: number, a: MapApi): { site: Site } | { sites: Site[] } | null => {
    const d = drawn.current
    for (let i = d.marks.length - 1; i >= 0; i--) {
      const m = d.marks[i]
      if (Math.hypot(m.x - x, m.y - y) <= m.r + 5) return { site: m.site }
    }
    for (let i = d.pills.length - 1; i >= 0; i--) {
      const p = d.pills[i]
      if (x >= p.x - 3 && x <= p.x + p.w + 3 && y >= p.y - 3 && y <= p.y + p.h + 3) return { sites: p.sites }
    }
    const ll = a.invert(x, y)
    if (ll) for (const s of d.outlines) if (geoContains(s.feature, ll)) return { site: s }
    return null
  }

  const onHover = (x: number, y: number, a: MapApi) => {
    const h = hitAt(x, y, a)
    if (!h) {
      setTip(null)
      setHoverKey(null)
      return false
    }
    if ("site" in h) {
      const s = h.site
      setHoverKey(s.key)
      setTip({ x, y, title: titleOf(s), detail: `${siteArea(s.km2)}${s.name && s.country ? ` · ${s.country}` : ""} · ${usageSummary(s)}` })
    } else {
      setHoverKey(null)
      setTip({ x, y, title: `${h.sites.length} sites close together`, detail: "Click to zoom in." })
    }
    return true
  }

  const motion = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth")

  /** Scroll the gallery (only the gallery) so a tile is in view, and as
   *  much of its details under it as fits. */
  const reveal = useCallback((key: string) => {
    requestAnimationFrame(() => {
      const box = scrollRef.current
      const el = box?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
      if (!box || !el) return
      const b = box.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const detail = box.querySelector<HTMLElement>(".map-sites__detail")?.getBoundingClientRect()
      let by = 0
      if (r.top < b.top || r.bottom > b.bottom) by = r.top - b.top - 10
      else if (detail && detail.bottom > b.bottom) by = Math.min(detail.bottom - b.bottom + 10, r.top - b.top - 10)
      if (by !== 0) box.scrollTo({ top: box.scrollTop + by, behavior: motion() })
    })
  }, [])

  const pick = useCallback(
    (key: string, from: "gallery" | "map") => {
      const s = byKey.get(key)
      if (!s) return
      setSelectedKey(key)
      setTip(null)
      mapRef.current?.fitBounds(s.bounds, 56)
      reveal(key)
      if (from === "gallery") {
        // Below desktop the map sits above the gallery: bring it back into view.
        const m = mapBoxRef.current?.getBoundingClientRect()
        if (m && (m.bottom < 80 || m.top > window.innerHeight - 80)) mapBoxRef.current?.scrollIntoView({ block: "start", behavior: motion() })
      }
    },
    [byKey, reveal],
  )

  const onTap = (x: number, y: number, a: MapApi) => {
    const h = hitAt(x, y, a)
    if (!h) return
    if ("site" in h) pick(h.site.key, "map")
    else mapRef.current?.fitBounds(unionBounds(h.sites), 48)
  }

  const close = useCallback(() => {
    setSelectedKey(null)
    mapRef.current?.reset()
  }, [])

  const step = (d: number) => {
    if (!selected) return
    const next = shown[shown.indexOf(selected) + d]
    if (!next) return
    pick(next.key, "map")
    // The details move with the pick: keep focus on the button pressed.
    const label = d < 0 ? "Previous outline" : "Next outline"
    requestAnimationFrame(() => {
      const btn = document.querySelector<HTMLButtonElement>(`#${detailId} button[aria-label="${label}"]`)
      if (btn && document.activeElement !== btn) (btn.disabled ? document.querySelector<HTMLElement>(`[data-key="${CSS.escape(next.key)}"]`) : btn)?.focus()
    })
  }

  /** Change what the gallery shows; a picked site it no longer shows is let go. */
  const changeShown = (nextFilter: Filter, nextHidden: boolean) => {
    setFilter(nextFilter)
    setShowHidden(nextHidden)
    const s = selectedKey ? byKey.get(selectedKey) : undefined
    if (s && ((nextFilter !== "all" && (nextFilter === "used") !== s.used) || (s.hidden && !nextHidden))) setSelectedKey(null)
  }

  // --- The gallery's column count, to open details under the picked row. ---
  const gridRef = useRef<HTMLDivElement>(null)
  const hasTiles = shown.length > 0
  useEffect(() => {
    if (!hasTiles) return
    const el = gridRef.current
    if (!el) return
    const measure = () => {
      const grid = el.querySelector("ul")
      if (!grid) return
      const n = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length
      setCols((prev) => (n > 0 && n !== prev ? n : prev))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasTiles])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [sort, filter])

  const sections = useMemo(() => {
    if (sort !== "country") return [{ key: "all", label: null as string | null, sites: shown }]
    const out: { key: string; label: string | null; sites: Site[] }[] = []
    for (const s of shown) {
      const label = s.country ?? "No country found"
      const last = out[out.length - 1]
      if (last && last.label === label) last.sites.push(s)
      else out.push({ key: label, label, sites: [s] })
    }
    return out
  }, [shown, sort])

  const onTileHover = useCallback((key: string | null) => setHoverKey(key), [])
  const onTilePick = useCallback((key: string) => pick(key, "gallery"), [pick])

  const onGalleryKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && selectedKey) {
      e.preventDefault()
      const key = selectedKey
      close()
      scrollRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus()
    }
  }

  const filterOption = (value: Filter, label: string, icon?: ReactNode) => ({
    value,
    icon,
    label: (
      <>
        {label}
        <span className="map-sites__count">{counts[value].toLocaleString("en-US")}</span>
      </>
    ),
  })

  return (
    <div className="map-sites">
      <div className="map-sites__tools">
        <div className="map-sites__sort">
          <span className="map-sites__label" aria-hidden>
            Sort
          </span>
          <SegmentedControl
            aria-label="Sort the outlines"
            size="sm"
            value={sort}
            onValueChange={(v) => setSort(v as Sort)}
            options={[
              { value: "size", label: "Size" },
              { value: "name", label: "Name" },
              { value: "country", label: "Country" },
            ]}
          />
        </div>
        <div className="map-sites__filter-scroll">
          <SegmentedControl
            aria-label="Show"
            className="map-sites__filter"
            joined={false}
            shape="pill"
            value={filter}
            onValueChange={(v) => changeShown(v as Filter, showHidden)}
            options={[
              filterOption("all", "All"),
              filterOption("used", "Used by work", <span className="map-sites__sw map-sites__sw--used" aria-hidden />),
              filterOption("unused", "Saved, not used yet", <span className="map-sites__sw map-sites__sw--unused" aria-hidden />),
            ]}
          />
        </div>
      </div>

      <p className="map-sites__read" aria-live="polite">
        <span>
          <b>{shown.length.toLocaleString("en-US")}</b> {shown.length === 1 ? "outline" : "outlines"}, {SORT_LABEL[sort]}.
          {copies > 0 ? ` ${copies.toLocaleString("en-US")} more ${copies === 1 ? "copy" : "copies"} of the same outlines share their tile (×n).` : ""}
        </span>
        {hidden.total > 0 ? (
          <span className="map-sites__hidden">
            {showHidden ? `Showing ${hidden.total} usually hidden.` : `${hidden.total} hidden: ${hiddenText(hidden.regions, hidden.tests)}.`}
            <Button variant="secondary" size="sm" onClick={() => changeShown(filter, !showHidden)}>
              {showHidden ? "Hide them" : `Show ${hidden.total} more`}
            </Button>
          </span>
        ) : null}
      </p>

      <div className="map-sites__body">
        <div className="map-sites__gallery" ref={gridRef}>
          <div className="map-sites__scroll" ref={scrollRef} role="region" aria-label="Drawn areas" tabIndex={-1} onKeyDown={onGalleryKey}>
            {shown.length === 0 ? (
              <p className="map-sites__empty">
                {filter === "unused" ? "Every drawn area here is used by work." : filter === "used" ? "No drawn area here is used by work yet." : "No drawn areas yet."}
                {hidden.total > 0 && !showHidden ? " Some are hidden; show them above." : ""}
              </p>
            ) : (
              sections.map((sec) => (
                <div className="map-sites__section" key={sec.key} role={sec.label ? "group" : undefined} aria-label={sec.label ? `${sec.label}, ${sec.sites.length}` : undefined}>
                  {sec.label ? (
                    <p className="map-sites__country" aria-hidden>
                      <span>{sec.label}</span>
                      <span>{sec.sites.length}</span>
                    </p>
                  ) : null}
                  <ul className="map-sites__grid">
                    {withDetail(sec.sites, selected, cols).map((entry) =>
                      entry.type === "tile" ? (
                        <SiteTile
                          key={entry.site.key}
                          site={entry.site}
                          shape={shapes.get(entry.site.key)!}
                          open={entry.site === selected}
                          hot={entry.site.key === hoverKey}
                          detailId={detailId}
                          onPick={onTilePick}
                          onHover={onTileHover}
                        />
                      ) : (
                        <li key="detail" className="map-sites__detail" id={detailId}>
                          <SiteDetail
                            site={entry.site}
                            index={shown.indexOf(entry.site)}
                            total={shown.length}
                            onStep={step}
                            onClose={close}
                          />
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ))
            )}
            {hidden.total > 0 && !showHidden && shown.length > 0 ? (
              <div className="map-sites__more">
                <p>
                  {hidden.total} more {hidden.total === 1 ? "is" : "are"} hidden: {hiddenText(hidden.regions, hidden.tests)}.
                </p>
                <Button variant="secondary" size="sm" onClick={() => changeShown(filter, true)}>
                  Show {hidden.total} more
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="map-sites__map" ref={mapBoxRef}>
          <WorldMap
            ref={mapRef}
            kind={kind}
            height={height}
            label="Map of the areas people drew"
            draw={draw}
            drawKey={draw}
            onHover={onHover}
            onLeave={() => {
              setTip(null)
              setHoverKey(null)
            }}
            onTap={onTap}
            resize={resize}
          >
            {tip ? (
              <div className="map-tip" style={{ left: tip.x, top: tip.y }} role="presentation">
                <b>{tip.title}</b>
                <span>{tip.detail}</span>
              </div>
            ) : null}
          </WorldMap>
          <div className="map-legend" aria-label="Legend">
            <span>
              <span className="map-sites__sw map-sites__sw--used" aria-hidden /> Used by work
            </span>
            <span>
              <span className="map-sites__sw map-sites__sw--unused" aria-hidden /> Saved, not used yet
            </span>
            <span>
              <span className="map-sites__x map-sites__x--inline" aria-hidden>
                ×3
              </span>{" "}
              Same outline saved 3 times
            </span>
            <span>Each tile has its own scale. Check the scale bar before comparing two.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Tiles ---

type Entry = { type: "tile"; site: Site } | { type: "detail"; site: Site }

/** The tiles, with the picked one's details after the end of its row. */
function withDetail(sites: Site[], selected: Site | null, cols: number): Entry[] {
  const out: Entry[] = sites.map((site) => ({ type: "tile", site }))
  const at = selected ? sites.indexOf(selected) : -1
  if (at < 0) return out
  const rowEnd = Math.min(sites.length - 1, (Math.floor(at / cols) + 1) * cols - 1)
  out.splice(rowEnd + 1, 0, { type: "detail", site: selected! })
  return out
}

const SiteTile = memo(function SiteTile({
  site: s,
  shape,
  open,
  hot,
  detailId,
  onPick,
  onHover,
}: {
  site: Site
  shape: TileShape
  open: boolean
  hot: boolean
  detailId: string
  onPick: (key: string) => void
  onHover: (key: string | null) => void
}) {
  const n = s.places.length
  const firstUse = s.uses[0]
  const label = [titleOf(s), siteArea(s.km2), s.name ? s.country : null, usageSummary(s), n > 1 ? `saved ${n} times` : null]
    .filter(Boolean)
    .join(", ")
  return (
    <li className="map-sites__cell" onMouseEnter={() => onHover(s.key)} onMouseLeave={() => onHover(null)}>
      <button
        type="button"
        className={`map-sites__tile${open ? " map-sites__tile--open" : ""}${hot ? " map-sites__tile--hot" : ""}${s.hidden ? " map-sites__tile--hidden" : ""}`}
        data-key={s.key}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        onClick={() => onPick(s.key)}
        onFocus={() => onHover(s.key)}
        onBlur={() => onHover(null)}
      >
        <span className="map-sites__fig">
          <svg viewBox="0 0 120 120" aria-hidden focusable="false">
            <path className={`map-sites__shape map-sites__shape--${s.kind}`} d={shape.d} />
            {shape.dots.map(([x, y], i) => (
              <circle key={i} className={`map-sites__dot map-sites__shape--${s.kind}`} cx={x} cy={y} r={4} />
            ))}
          </svg>
          {shape.barLabel ? (
            <span className="map-sites__bar">
              <span className="map-sites__bar-line" style={{ width: `${shape.barPct}%` }} />
              <span>{shape.barLabel}</span>
            </span>
          ) : null}
          {n > 1 ? (
            <span className="map-sites__x" title={`Same outline saved ${n} times`}>
              ×{n}
            </span>
          ) : null}
          {s.hidden ? <span className="map-sites__why">{s.test ? "Test" : "Region"}</span> : null}
        </span>
        <span className="map-sites__cap">
          <span className={`map-sites__name${s.name ? "" : " map-sites__name--none"}`}>{titleOf(s)}</span>
          <span className="map-sites__meta">
            {siteArea(s.km2)}
            {s.name && s.country ? ` · ${s.country}` : ""}
          </span>
          <span className="map-sites__use">
            <span className={`map-swatch map-swatch--${s.kind}`} aria-hidden />
            <span>{firstUse ? usageTitle(firstUse) : s.used ? "Named by an activity" : "Not used yet"}</span>
            {s.uses.length > 1 ? <span className="map-sites__plus">+{s.uses.length - 1}</span> : null}
          </span>
          <span className="map-sites__who">{firstUse ? `by ${accountName(usageAccount(firstUse))}` : `Saved by ${accountName(s.savedBy[0])}`}</span>
        </span>
      </button>
    </li>
  )
})

// --- Details ---

function SiteDetail({
  site: s,
  index,
  total,
  onStep,
  onClose,
}: {
  site: Site
  index: number
  total: number
  onStep: (d: number) => void
  onClose: () => void
}) {
  const pitches = inPitches(s.km2)
  const n = s.places.length
  const chain = chainOfUses(s.uses)
  const top = chain.length
  const otherNames = [...new Set(s.places.map((p) => p.name?.trim()).filter((x): x is string => !!x && x !== s.name))]
  return (
    <div className="map-sites__card">
      <div className="map-sites__card-head">
        <span className="map-sites__label">
          Drawn area{s.country ? ` · ${s.country}` : ""}
          {s.hidden ? ` · usually hidden` : ""}
        </span>
        <span className="map-sites__nav">
          <Button size="icon-sm" variant="ghost" aria-label="Previous outline" disabled={index <= 0} onClick={() => onStep(-1)}>
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next outline" disabled={index < 0 || index >= total - 1} onClick={() => onStep(1)}>
            <ChevronRight size={16} aria-hidden />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Close and show all sites" onClick={onClose}>
            <X size={16} aria-hidden />
          </Button>
        </span>
      </div>
      <h2 className={`font-headline text-h4 map-sites__title${s.name ? "" : " map-sites__name--none"}`}>{titleOf(s)}</h2>
      <p className="map-sites__size">
        <b>{siteArea(s.km2)}</b>
        {pitches ? `, ${pitches}` : ""}
        {s.region ? `. Larger than ${REGION_KM2.toLocaleString("en-US")} km², so usually hidden` : ""}
      </p>
      <div className="map-sites__by">
        Saved by <Who account={s.savedBy[0]} />
        {s.savedBy.length > 1 ? ` and ${s.savedBy.length - 1} other ${s.savedBy.length === 2 ? "account" : "accounts"}` : ""}
      </div>

      {s.uses.length > 0 ? (
        <>
          <p className="map-sites__label">Used by {usageCount(s.uses)}</p>
          <div className="map-chain">
            {chain.slice(0, USES_SHOWN).map((link) => (
              <ChainLink key={link.key} link={link} />
            ))}
            {top > USES_SHOWN ? <p className="map-sites__note">And {top - USES_SHOWN} more.</p> : null}
          </div>
        </>
      ) : s.used ? (
        <p className="map-sites__note">An activity names this place among several of its places.</p>
      ) : (
        <p className="map-sites__note">Not used yet. No activity, project or organization points to this place.</p>
      )}

      {n > 1 ? (
        <p className="map-sites__note">
          Saved {n} times with this exact outline
          {otherNames.length > 0 ? `, also as ${listText(otherNames.slice(0, 4).map((x) => `“${x}”`), otherNames.length - 4)}` : ""}.
        </p>
      ) : null}
    </div>
  )
}

type ActivityHere = { activity: Activity; how: "own" | "more" | "project" }
type Link =
  | { key: string; kind: "project"; project: Project; activities: ActivityHere[] }
  | ({ key: string; kind: "activity" } & ActivityHere)
  | { key: string; kind: "org"; org: Org }

/** What uses a site, as a chain: each project with its activities here
 *  nested under it, then other activities, then organizations based here. */
function chainOfUses(uses: readonly SiteUse[]): Link[] {
  const projects = new Map<number, Extract<Link, { kind: "project" }>>()
  for (const u of uses) {
    if (u.kind !== "project") continue
    projects.set(u.project.i, {
      key: `p${u.project.i}`,
      kind: "project",
      project: u.project,
      activities: u.activities.map((activity) => ({ activity, how: "project" as const })),
    })
  }
  const loose: Link[] = []
  const orgs: Link[] = []
  for (const u of uses) {
    if (u.kind === "activity") {
      const home = u.activity.project ? projects.get(u.activity.project.i) : undefined
      if (home) home.activities.push({ activity: u.activity, how: u.how })
      else loose.push({ key: `a${u.activity.i}`, kind: "activity", activity: u.activity, how: u.how })
    } else if (u.kind === "org") orgs.push({ key: `o${u.org.i}`, kind: "org", org: u.org })
  }
  return [...projects.values(), ...loose, ...orgs]
}

function activityNote(a: Activity, how: ActivityHere["how"], nested: boolean): string {
  return [
    how === "project" ? "Placed by its project" : how === "more" ? "One of several places it names" : "Activity",
    !nested && a.project ? `in ${a.project.title}` : null,
    a.date ? formatDate(a.date) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

function ChainLink({ link }: { link: Link }) {
  if (link.kind === "project") {
    const extra = link.activities.length - 3
    return (
      <div className="map-chain__group">
        <ChainItem kind="project" href={link.project.href} title={link.project.title} who={link.project.account} note="Project" />
        {link.activities.length > 0 ? (
          <ul className="map-chain__nested">
            {link.activities.slice(0, 3).map(({ activity: a, how }) => (
              <li key={a.i}>
                <ChainItem kind="activity" href={a.href} title={a.title} note={activityNote(a, how, true)} />
              </li>
            ))}
            {extra > 0 ? (
              <li className="map-sites__note">
                And {extra} more {extra === 1 ? "activity" : "activities"}.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    )
  }
  if (link.kind === "org") {
    return <ChainItem kind="org" href={link.org.href} title={accountName(link.org.account)} who={link.org.account} note="Based here" />
  }
  const a = link.activity
  return <ChainItem kind="activity" href={a.href} title={a.title} who={a.account} note={activityNote(a, link.how, false)} />
}

function ChainItem({ kind, href, title, who, note }: { kind: SiteKind; href: string; title: string; who?: Account; note: string }) {
  return (
    <div className="map-chain__item">
      <span className={`map-swatch map-swatch--${kind}`} aria-hidden />
      <span className="map-chain__text">
        <Link href={href} className="map-chain__title">
          {title}
        </Link>
        <span className="map-chain__note">
          {who ? (
            <span className="map-chain__who">
              <Avatar src={who.avatar ?? undefined} fallbackInitials={getInitials(who.name)} seed={who.did} size="xs" />
              {accountName(who)}
            </span>
          ) : null}
          <span>{note}</span>
        </span>
      </span>
    </div>
  )
}

function Who({ account }: { account: Account }) {
  return (
    <Link href={account.href} className="map-sites__who-link">
      <Avatar src={account.avatar ?? undefined} fallbackInitials={getInitials(account.name)} seed={account.did} size="xs" />
      {accountName(account)}
    </Link>
  )
}

// --- Marks on the map ---

/** One site too small to see: the layer's mark for what uses it. */
function siteMark(ctx: CanvasRenderingContext2D, c: MapColors, x: number, y: number, n: LayerCounts): number {
  if (n.project > 0 && n.activity > 0) {
    ringDot(ctx, c, x, y)
    return MARK_R + 3.5
  }
  if (n.project > 0) {
    ring(ctx, c, x, y)
    return MARK_R + 2.5
  }
  if (n.activity > 0) dot(ctx, c, x, y)
  else if (n.org > 0) square(ctx, c, x, y)
  else hollow(ctx, c, x, y)
  return MARK_R
}

function kindColor(c: MapColors, k: SiteKind): string {
  return k === "activity" ? c.activity : k === "project" ? c.project : k === "org" ? c.org : c.unused
}

// --- Words ---

function sortSites(list: Site[], sort: Sort): Site[] {
  const out = [...list]
  if (sort === "size") out.sort((a, b) => b.km2 - a.km2)
  else if (sort === "name")
    out.sort((a, b) => Number(!a.name) - Number(!b.name) || (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" }) || b.km2 - a.km2)
  else
    out.sort(
      (a, b) => Number(!a.country) - Number(!b.country) || (a.country ?? "").localeCompare(b.country ?? "") || b.km2 - a.km2,
    )
  return out
}

function titleOf(s: Site): string {
  return s.name ?? (s.country ? `An area in ${s.country}` : "An area without a name")
}

/** Sizes down to a few square metres (formatArea stops at tenths of a hectare). */
function siteArea(km2: number): string {
  if (km2 >= 0.001) return formatArea(km2)
  const m2 = km2 * 1e6
  return `${Math.max(1, m2 < 100 ? Math.round(m2) : Math.round(m2 / 10) * 10).toLocaleString("en-US")} m²`
}

function accountName(a: Account | undefined): string {
  return a?.name ?? "an unnamed account"
}

function usageAccount(u: SiteUse): Account {
  return u.kind === "activity" ? u.activity.account : u.kind === "project" ? u.project.account : u.org.account
}

function usageTitle(u: SiteUse): string {
  return u.kind === "activity" ? u.activity.title : u.kind === "project" ? u.project.title : `${accountName(u.org.account)} is based here`
}

function usageCount(uses: readonly SiteUse[]): string {
  const n = { activity: 0, project: 0, org: 0 }
  for (const u of uses) n[u.kind]++
  const parts: string[] = []
  if (n.activity) parts.push(`${n.activity} ${n.activity === 1 ? "activity" : "activities"}`)
  if (n.project) parts.push(`${n.project} ${n.project === 1 ? "project" : "projects"}`)
  if (n.org) parts.push(`${n.org} ${n.org === 1 ? "organization" : "organizations"}`)
  return listText(parts, 0)
}

function usageSummary(s: Site): string {
  if (s.uses.length > 0) return `Used by ${usageCount(s.uses)}`
  return s.used ? "Named by an activity" : "Saved, not used yet"
}

function hiddenText(regions: number, tests: number): string {
  const parts: string[] = []
  if (regions) parts.push(`${regions} ${regions === 1 ? "region" : "regions"} larger than ${REGION_KM2.toLocaleString("en-US")} km²`)
  if (tests) parts.push(`${tests} named like a test`)
  return parts.join(" and ")
}

/** "a, b and c", or "a, b, c and 3 more". */
function listText(items: string[], more: number): string {
  if (more > 0) return `${items.join(", ")} and ${more} more`
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

function unionBounds(sites: readonly Site[]): [[number, number], [number, number]] {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const x of sites) {
    w = Math.min(w, x.bounds[0][0])
    s = Math.min(s, x.bounds[0][1])
    e = Math.max(e, x.bounds[1][0])
    n = Math.max(n, x.bounds[1][1])
  }
  return [
    [w, s],
    [e, n],
  ]
}
