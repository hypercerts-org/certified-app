"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import Link from "next/link"
import { Search, X } from "lucide-react"
import { geoBounds } from "d3-geo"
import type { MultiPolygon } from "geojson"
import { ToggleGroup } from "@/components/ui/segmented-control"
import Input from "@/components/ui/input"
import Switch from "@/components/ui/switch"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import { countryAt, countryBounds, countryCenter, countryFeatures } from "@/lib/map/countries"
import {
  LAYERS,
  LAYER_LABEL,
  PRECISION_LABEL,
  chainOf,
  distanceKm,
  emptyCounts,
  groupItems,
  itemsFor,
  matchesQuery,
  type CountryGroup,
  type Layer,
  type LayerCounts,
  type MapModel,
  type Org,
  type Spot,
} from "@/lib/map/model"
import { formatPlace } from "@/lib/funding/format"
import { getInitials } from "@/lib/utils/initials"
import WorldMap, { type MapApi, type WorldMapHandle } from "./world-map"
import type { MapViewProps } from "./view-props"
import { MARK_R, font, hatch, haloText, pill, selectRing, spotMark } from "./marks"
import { useMapLayers } from "./use-map-layers"

/**
 * The Map view: what the chosen layers hold, drawn as recorded, with a list
 * of what is in view beside it.
 *
 *  - Everything at one point is one spot: one mark on the map, one row in
 *    the list. A project with its activities there is a ringed dot.
 *  - Places are drawn as exactly as they were recorded: an exact point is a
 *    mark; a drawn area its outline once it is big enough to see; an
 *    approximate place a soft disc at its true radius; a place that only
 *    names a country shades that country instead of inventing a spot.
 *  - Spots too close to tell apart become a pill that counts each layer;
 *    clicking it zooms in.
 */

const LIST_PAGE = 40
/** How close (in pixels) spots must be to share a group's pill. */
const CLUSTER_W = 64
const CLUSTER_H = 26
/** Drawn areas larger than this are regions: an edge only, never a fill. */
const REGION_KM2 = 10_000
/** A drawn area shows its outline once it is this wide on screen. */
const OUTLINE_PX = 12

type Selection = { kind: "spot"; key: string } | { kind: "country"; key: string } | null

interface Drawn {
  /** Hit targets from the last frame, topmost last. */
  marks: { x: number; y: number; r: number; spot: Spot }[]
  pills: { x: number; y: number; w: number; h: number; spots: Spot[] }[]
}

interface Hover {
  x: number
  y: number
  title: string
  detail: string
}

export default function MapBrowse({ model, kind, height, resize }: MapViewProps) {
  const { layers, toggle } = useMapLayers()
  const [query, setQuery] = useState("")
  const [onlyInView, setOnlyInView] = useState(true)
  const [selected, setSelected] = useState<Selection>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [tip, setTip] = useState<Hover | null>(null)
  const [limit, setLimit] = useState(LIST_PAGE)
  const [inView, setInView] = useState<{ spots: Set<string>; countries: Set<string> } | null>(null)
  const mapRef = useRef<WorldMapHandle>(null)
  const drawn = useRef<Drawn>({ marks: [], pills: [] })
  const listRef = useRef<HTMLDivElement>(null)

  const all = useMemo(() => itemsFor(model, layers), [model, layers])
  const items = useMemo(() => (query ? all.filter((it) => matchesQuery(it, query)) : all), [all, query])
  const groups = useMemo(() => groupItems(items), [items])
  const spotByKey = useMemo(() => new Map(groups.spots.map((s) => [s.key, s])), [groups])
  const countryByKey = useMemo(() => new Map(groups.countries.map((g) => [g.key, g])), [groups])

  const bases = useMemo(() => new Map(model.orgs.map((o) => [o.account.i, o])), [model])
  const layerCounts = useMemo(() => {
    const n = emptyCounts()
    n.activity = model.activities.filter((a) => a.place).length
    n.project = model.projects.filter((p) => p.place).length
    n.org = model.orgs.length
    n.unused = model.unused.length
    return n
  }, [model])

  // --- What's in view (for the list), recomputed at most every 150 ms. ---
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestApi = useRef<MapApi | null>(null)
  const computeInView = useCallback(() => {
    const a = latestApi.current
    if (!a) return
    const spots = new Set<string>()
    for (const s of groups.spots) if (a.isVisible(s.lng, s.lat)) spots.add(s.key)
    const countries = new Set<string>()
    const center = a.invert(a.width / 2, a.height / 2)
    const centerCountry = center ? countryAt(center[0], center[1]) : -1
    for (const g of groups.countries) {
      const c = countryCenter(g.countryFeature)
      if (g.countryFeature === centerCountry || (c && a.isVisible(c[0], c[1]))) countries.add(g.key)
    }
    setInView({ spots, countries })
  }, [groups])
  const onView = useCallback(
    (a: MapApi) => {
      latestApi.current = a
      if (viewTimer.current) return
      viewTimer.current = setTimeout(() => {
        viewTimer.current = null
        computeInView()
      }, 150)
    },
    [computeInView],
  )
  useEffect(() => {
    computeInView()
  }, [computeInView])
  useEffect(() => () => {
    if (viewTimer.current) clearTimeout(viewTimer.current)
  }, [])

  // --- Drawing ---
  const draw = useCallback(
    (a: MapApi) => {
      const { ctx, colors: c } = a
      const features = countryFeatures()

      // Places that only name a country: the country, hatched, with a count.
      const pattern = hatch(ctx, c.muted)
      for (const g of groups.countries) {
        const f = features[g.countryFeature]
        if (!f) continue
        const sel = selected?.kind === "country" && selected.key === g.key
        const hot = hoverKey === g.key
        ctx.save()
        ctx.beginPath()
        a.path(f)
        ctx.globalAlpha = sel || hot ? 0.9 : 0.5
        if (pattern) {
          ctx.fillStyle = pattern
          ctx.fill()
        }
        if (sel || hot) {
          ctx.globalAlpha = 1
          ctx.lineWidth = 1.5
          ctx.strokeStyle = c.fg
          ctx.stroke()
        }
        ctx.restore()
      }
      // Approximate places: a soft disc at their true radius.
      const kmpp = a.kmPerPx()
      for (const s of groups.spots) {
        if (s.prec !== "approx" || !s.radiusKm) continue
        const r = s.radiusKm / kmpp
        if (r < MARK_R + 3) continue
        const p = a.project(s.lng, s.lat)
        if (!p) continue
        ctx.save()
        ctx.beginPath()
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2)
        ctx.globalAlpha = 0.12
        ctx.fillStyle = s.counts.activity > 0 ? c.activity : s.counts.project > 0 ? c.project : c.muted
        ctx.fill()
        ctx.globalAlpha = 0.6
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 1
        ctx.strokeStyle = ctx.fillStyle
        ctx.stroke()
        ctx.restore()
      }

      // Drawn areas: their outline, once big enough to see.
      for (const s of groups.spots) {
        if (!s.area) continue
        const feature = { type: "MultiPolygon", coordinates: s.area } as MultiPolygon
        const [[x0, y0], [x1, y1]] = a.path.bounds(feature)
        if (!Number.isFinite(x0) || Math.max(x1 - x0, y1 - y0) < OUTLINE_PX) continue
        // A region, or bigger than the view: a thin edge only, no fill.
        const huge = (s.km2 ?? 0) > REGION_KM2 || x1 - x0 > a.width * 1.5 || y1 - y0 > a.height * 1.5
        const color = s.counts.activity > 0 ? c.activity : s.counts.project > 0 ? c.project : s.counts.org > 0 ? c.org : c.unused
        ctx.save()
        ctx.beginPath()
        a.path(feature)
        if (!huge) {
          ctx.globalAlpha = 0.16
          ctx.fillStyle = color
          ctx.fill()
        }
        const on = selected?.key === s.key || hoverKey === s.key
        ctx.globalAlpha = huge && !on ? 0.45 : 0.9
        ctx.lineWidth = on ? 2.5 : huge ? 1 : 1.5
        if (huge || (s.counts.unused > 0 && s.counts.activity + s.counts.project + s.counts.org === 0)) ctx.setLineDash([4, 3])
        ctx.strokeStyle = color
        ctx.stroke()
        ctx.restore()
      }

      // Spots and groups of spots. Greedy: the busiest spots first, each
      // joining a group whose centre is within a pill's reach, so the pills
      // (wider than tall) don't sit on top of one another.
      const cells: { x: number; y: number; cx: number; cy: number; spots: Spot[] }[] = []
      const order = groups.spots
        .map((s) => ({ s, p: a.project(s.lng, s.lat) }))
        .filter((e): e is { s: Spot; p: [number, number] } => !!e.p && e.p[0] > -40 && e.p[0] < a.width + 40 && e.p[1] > -40 && e.p[1] < a.height + 40)
        .sort((p, q) => q.s.items.length - p.s.items.length)
      for (const { s, p } of order) {
        let cell = cells.find((c) => Math.abs(c.cx - p[0]) < CLUSTER_W && Math.abs(c.cy - p[1]) < CLUSTER_H)
        if (!cell) {
          cell = { x: 0, y: 0, cx: p[0], cy: p[1], spots: [] }
          cells.push(cell)
        }
        cell.x += p[0]
        cell.y += p[1]
        cell.spots.push(s)
      }
      const marks: Drawn["marks"] = []
      const pills: Drawn["pills"] = []
      const singles: { x: number; y: number; spot: Spot }[] = []
      for (const cell of cells) {
        if (cell.spots.length === 1) {
          const s = cell.spots[0]
          const p = a.project(s.lng, s.lat)!
          singles.push({ x: p[0], y: p[1], spot: s })
          continue
        }
        const n = emptyCounts()
        for (const s of cell.spots) for (const k of LAYERS) n[k] += s.counts[k]
        const box = pill(ctx, c, cell.x / cell.spots.length, cell.y / cell.spots.length, n)
        pills.push({ ...box, spots: cell.spots })
      }
      for (const m of singles) {
        const r = spotMark(ctx, c, m.x, m.y, m.spot.counts)
        if (selected?.key === m.spot.key || hoverKey === m.spot.key) selectRing(ctx, c, m.x, m.y, r)
        marks.push({ x: m.x, y: m.y, r, spot: m.spot })
      }
      // The selected spot inside a group: still show where it is.
      if (selected?.kind === "spot" && !marks.some((m) => m.spot.key === selected.key)) {
        const s = spotByKey.get(selected.key)
        const p = s && a.project(s.lng, s.lat)
        if (p) selectRing(ctx, c, p[0], p[1], MARK_R)
      }
      // Country labels last, only where they don't cover a mark or a group.
      const taken = [
        ...pills.map((p) => ({ x0: p.x - 4, y0: p.y - 4, x1: p.x + p.w + 4, y1: p.y + p.h + 4 })),
        ...marks.map((m) => ({ x0: m.x - m.r - 4, y0: m.y - m.r - 4, x1: m.x + m.r + 4, y1: m.y + m.r + 4 })),
      ]
      ctx.font = font(600, 11)
      for (const g of groups.countries) {
        const f = features[g.countryFeature]
        const cc = countryCenter(g.countryFeature)
        if (!f || !cc || a.path.area(f) < 2500) continue
        const p = a.project(cc[0], cc[1])
        if (!p) continue
        const text = `${f.properties.name} ${g.items.length}`
        const w = ctx.measureText(text).width
        const box = { x0: p[0] - w / 2 - 3, y0: p[1] - 9, x1: p[0] + w / 2 + 3, y1: p[1] + 9 }
        if (taken.some((t) => t.x0 < box.x1 && t.x1 > box.x0 && t.y0 < box.y1 && t.y1 > box.y0)) continue
        taken.push(box)
        haloText(ctx, c, text, p[0], p[1], { size: 11, weight: 600, color: c.muted })
      }
      drawn.current = { marks, pills }
    },
    [groups, selected, hoverKey, spotByKey],
  )

  // --- Pointer ---
  const hitAt = (x: number, y: number, a: MapApi) => {
    const d = drawn.current
    for (let i = d.marks.length - 1; i >= 0; i--) {
      const m = d.marks[i]
      if (Math.hypot(m.x - x, m.y - y) <= m.r + 5) return { type: "spot" as const, spot: m.spot }
    }
    for (let i = d.pills.length - 1; i >= 0; i--) {
      const p = d.pills[i]
      if (x >= p.x - 3 && x <= p.x + p.w + 3 && y >= p.y - 3 && y <= p.y + p.h + 3) return { type: "pill" as const, spots: p.spots }
    }
    const ll = a.invert(x, y)
    if (ll) {
      const f = countryAt(ll[0], ll[1])
      const g = f >= 0 ? groups.countries.find((c) => c.countryFeature === f) : undefined
      if (g) return { type: "country" as const, group: g }
    }
    return null
  }

  const onHover = (x: number, y: number, a: MapApi) => {
    const h = hitAt(x, y, a)
    if (!h) {
      setTip(null)
      return false
    }
    if (h.type === "spot") setTip({ x, y, title: (h.spot.name ? formatPlace(h.spot.name) : "") || "Unnamed place", detail: `${PRECISION_LABEL[h.spot.prec]} · ${countsText(h.spot.counts)}` })
    else if (h.type === "pill") {
      const n = emptyCounts()
      for (const s of h.spots) for (const k of LAYERS) n[k] += s.counts[k]
      setTip({ x, y, title: `${h.spots.length} places close together`, detail: `${countsText(n)}. Click to zoom in.` })
    } else setTip({ x, y, title: `Somewhere in ${h.group.country}`, detail: `Only the country is known · ${countsText(h.group.counts)}` })
    return true
  }

  const select = (sel: Selection) => {
    setSelected(sel)
    if (!sel) return
    // The row may be past the current page of the list.
    const rows = listOrder()
    const at = rows.findIndex((r) => r.key === sel.key)
    if (at >= limit) setLimit(Math.ceil((at + 1) / LIST_PAGE) * LIST_PAGE)
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-key="${CSS.escape(sel.key)}"]`)
      el?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    })
  }

  const onTap = (x: number, y: number, a: MapApi) => {
    const h = hitAt(x, y, a)
    if (!h) {
      setSelected(null)
      return
    }
    if (h.type === "spot") select({ kind: "spot", key: h.spot.key })
    else if (h.type === "pill") mapRef.current?.fitBounds(boundsOf(h.spots), 60)
    else select({ kind: "country", key: h.group.key })
  }

  // --- The list ---
  function listOrder(): { key: string; spot?: Spot; group?: CountryGroup }[] {
    const spots = groups.spots.filter((s) => !onlyInView || !inView || inView.spots.has(s.key))
    spots.sort((p, q) => q.items.length - p.items.length || (p.name ?? "").localeCompare(q.name ?? ""))
    const countries = groups.countries.filter((g) => !onlyInView || !inView || inView.countries.has(g.key))
    return [...spots.map((s) => ({ key: s.key, spot: s })), ...countries.map((g) => ({ key: g.key, group: g }))]
  }
  const rows = listOrder()
  const recordsShown = rows.reduce((t, r) => t + (r.spot?.items.length ?? r.group?.items.length ?? 0), 0)

  const goTo = (row: { spot?: Spot; group?: CountryGroup }) => {
    const m = mapRef.current
    if (!m) return
    if (row.spot) {
      const s = row.spot
      if (s.area) {
        const [[w, so], [e, n]] = geoBounds({ type: "MultiPolygon", coordinates: s.area } as MultiPolygon)
        m.fitBounds([[w, so], [e, n]], 60)
      } else if (s.radiusKm) {
        const d = s.radiusKm / 111
        m.fitBounds([[s.lng - d * 1.6, s.lat - d * 1.6], [s.lng + d * 1.6, s.lat + d * 1.6]], 40)
      } else m.flyTo(s.lng, s.lat, 900)
    } else if (row.group) {
      const b = countryBounds(row.group.countryFeature)
      if (b) m.fitBounds(b, 40)
    }
  }

  const empty = rows.length === 0
  const nowhere = groups.nowhere.length

  return (
    <div className="map-browse">
      <div className="map-browse__chips">
        <span className="map-browse__label" id="map-layers-label">
          Show
        </span>
        <div className="map-browse__chips-scroll">
          <ToggleGroup
            aria-label="Show on the map"
            className="map-chips"
            joined={false}
            shape="pill"
            size="md"
            value={LAYERS.filter((l) => layers.has(l))}
            onValueChange={(next) => {
              const set = new Set(next)
              const changed = LAYERS.find((l) => layers.has(l) !== set.has(l))
              if (changed) toggle(changed)
            }}
            options={LAYERS.map((l) => ({
              value: l,
              icon: <span className={`map-swatch map-swatch--${l}`} aria-hidden />,
              label: (
                <>
                  {LAYER_LABEL[l]}
                  <span className="map-chips__count">{layerCounts[l].toLocaleString("en-US")}</span>
                </>
              ),
            }))}
          />
        </div>
      </div>

      <div className="map-browse__body">
        <aside className="map-list" aria-label="What's on the map">
          <div className="map-list__tools">
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(LIST_PAGE)
              }}
              placeholder="Search titles, places, organizations"
              aria-label="Search the map"
              leadingIcon={<Search size={15} aria-hidden />}
            />
            <div className="map-list__toolrow">
              <Switch checked={onlyInView} onCheckedChange={setOnlyInView} label="Only what's on the map" />
              <span className="map-list__count" aria-live="polite">
                {rows.length.toLocaleString("en-US")} {rows.length === 1 ? "place" : "places"} ·{" "}
                {recordsShown.toLocaleString("en-US")} {recordsShown === 1 ? "record" : "records"}
              </span>
            </div>
          </div>
          <div className="map-list__scroll" ref={listRef} style={{ "--map-list-max": `${height - 92}px` } as CSSProperties}>
            {empty ? (
              <p className="map-list__empty">
                {layers.size === 0
                  ? "Turn on a layer above to see it here."
                  : query
                    ? "Nothing matches that search here. Try another word, or turn off Only what's on the map."
                    : "Nothing here. Zoom out or move the map."}
              </p>
            ) : (
              <ul className="map-list__rows">
                {rows.slice(0, limit).map((row) => (
                  <ListRow
                    key={row.key}
                    row={row}
                    open={selected?.key === row.key}
                    onOpen={() => {
                      const next: Selection = row.spot ? { kind: "spot", key: row.key } : { kind: "country", key: row.key }
                      setSelected(selected?.key === row.key ? null : next)
                      if (selected?.key !== row.key) goTo(row)
                    }}
                    onHover={(on) => setHoverKey(on ? row.key : null)}
                    bases={bases}
                  />
                ))}
              </ul>
            )}
            {rows.length > limit ? (
              <div className="map-list__more">
                <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + LIST_PAGE)}>
                  Show {Math.min(LIST_PAGE, rows.length - limit)} more
                </Button>
              </div>
            ) : null}
            {nowhere > 0 && !query ? (
              <p className="map-list__note">
                {nowhere} {nowhere === 1 ? "record names" : "records name"} a country that can&apos;t be placed, so{" "}
                {nowhere === 1 ? "it isn't" : "they aren't"} on the map.
              </p>
            ) : null}
          </div>
        </aside>

        <div className="map-browse__map">
          <WorldMap
            ref={mapRef}
            kind={kind}
            height={height}
            label="Map of activities, projects and places"
            draw={draw}
            drawKey={draw}
            onHover={onHover}
            onLeave={() => setTip(null)}
            onTap={onTap}
            onView={onView}
            resize={resize}
          >
            {tip ? (
              <div className="map-tip" style={{ left: tip.x, top: tip.y }} role="presentation">
                <b>{tip.title}</b>
                <span>{tip.detail}</span>
              </div>
            ) : null}
          </WorldMap>
          <MapLegend />
        </div>
      </div>
    </div>
  )
}

function boundsOf(spots: readonly Spot[]): [[number, number], [number, number]] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const p of spots) {
    w = Math.min(w, p.lng)
    e = Math.max(e, p.lng)
    s = Math.min(s, p.lat)
    n = Math.max(n, p.lat)
  }
  const pad = 0.02
  return [[w - pad, s - pad], [e + pad, n + pad]]
}

export function countsText(n: LayerCounts): string {
  const parts: string[] = []
  if (n.activity) parts.push(`${n.activity} ${n.activity === 1 ? "activity" : "activities"}`)
  if (n.project) parts.push(`${n.project} ${n.project === 1 ? "project" : "projects"}`)
  if (n.org) parts.push(`${n.org} ${n.org === 1 ? "organization based here" : "organizations based here"}`)
  if (n.unused) parts.push(`${n.unused} ${n.unused === 1 ? "place not used yet" : "places not used yet"}`)
  return parts.join(", ")
}

function SpotGlyph({ counts }: { counts: LayerCounts }) {
  const cls =
    counts.project > 0 && counts.activity > 0
      ? "ringdot"
      : counts.project > 0
        ? "project"
        : counts.activity > 0
          ? "activity"
          : counts.org > 0
            ? "org"
            : "unused"
  return <span className={`map-swatch map-swatch--${cls}`} aria-hidden />
}

function ListRow({
  row,
  open,
  onOpen,
  onHover,
  bases,
}: {
  row: { key: string; spot?: Spot; group?: CountryGroup }
  open: boolean
  onOpen: () => void
  onHover: (on: boolean) => void
  bases: ReadonlyMap<number, Org>
}) {
  const counts = row.spot?.counts ?? row.group!.counts
  const items = row.spot?.items ?? row.group!.items
  const title = row.spot ? (row.spot.name ? formatPlace(row.spot.name) : "") || "Unnamed place" : `Somewhere in ${row.group!.country}`
  const prec = row.spot ? PRECISION_LABEL[row.spot.prec] : PRECISION_LABEL.country
  const extra = row.spot?.km2 ? ` · ${formatArea(row.spot.km2)}` : row.spot?.prec === "approx" && row.spot.radiusKm ? ` · within ${Math.round(row.spot.radiusKm)} km` : ""
  const id = `map-row-${row.key.replace(/[^a-zA-Z0-9]/g, "-")}`
  return (
    <li className={`map-row${open ? " map-row--open" : ""}`} data-key={row.key} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <button type="button" className="map-row__head" aria-expanded={open} aria-controls={id} onClick={onOpen} onFocus={() => onHover(true)} onBlur={() => onHover(false)}>
        <SpotGlyph counts={counts} />
        <span className="map-row__text">
          <span className="map-row__title">{title}</span>
          <span className="map-row__meta">
            <span className={`map-prec map-prec--${row.spot?.prec ?? "country"}`}>{prec}</span>
            {extra}
            {row.spot?.country && !row.spot.name?.includes(row.spot.country) ? ` · ${row.spot.country}` : ""}
          </span>
          <span className="map-row__counts">{countsText(counts)}</span>
        </span>
      </button>
      {open ? (
        <div className="map-row__body" id={id}>
          <PlaceChain items={items} here={row.spot ?? null} bases={bases} />
        </div>
      ) : null}
    </li>
  )
}

/** What is at a spot, as a chain: projects with their activities here, then
 *  other activities, organizations based here, and places not used yet. */
function PlaceChain({ items, here, bases }: { items: Spot["items"]; here: Spot | null; bases: ReadonlyMap<number, Org> }) {
  const chain = chainOf(items)
  return (
    <div className="map-chain">
      {chain.projects.map(({ project, activities }) => (
        <div className="map-chain__group" key={`p${project.i}`}>
          <ChainItem kind="project" href={project.href} title={project.title} who={project.account} note={`Project${project.activities.length > activities.length ? ` · ${project.activities.length} activities in all` : ""}`} />
          {activities.length > 0 ? (
            <ul className="map-chain__nested">
              {activities.map((a) => (
                <li key={`a${a.i}`}>
                  <ChainItem kind="activity" href={a.href} title={a.title} note={a.date ? formatDate(a.date) : "Activity"} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {chain.loose.map((a) => (
        <ChainItem
          key={`a${a.i}`}
          kind="activity"
          href={a.href}
          title={a.title}
          who={a.account}
          note={a.project ? `Activity in ${a.project.title}${a.via === "project" ? " · placed by its project" : ""}` : `Activity${a.date ? ` · ${formatDate(a.date)}` : ""}`}
        />
      ))}
      {chain.orgs.map((o) => (
        <ChainItem key={`o${o.i}`} kind="org" href={o.href} title={o.account.name ?? "Unnamed organization"} who={o.account} note="Based here" />
      ))}
      {chain.unused.map((u) => (
        <ChainItem key={`u${u.i}`} kind="unused" href={u.account.href} title={u.account.name ?? "Unnamed account"} who={u.account} note="Saved this place, not used yet" />
      ))}
      {here && chain.orgs.length === 0 ? <ElsewhereBases items={items} here={here} bases={bases} /> : null}
    </div>
  )
}

/** Organizations of the work here that are based somewhere else, with how far. */
function ElsewhereBases({ items, here, bases }: { items: Spot["items"]; here: Spot; bases: ReadonlyMap<number, Org> }) {
  const seen = new Set<number>()
  const out: ReactNode[] = []
  for (const it of items) {
    if (it.kind !== "project" && it.kind !== "activity") continue
    if (seen.has(it.account.i)) continue
    seen.add(it.account.i)
    const org = bases.get(it.account.i)
    if (org) out.push(<BaseNote key={it.account.i} org={org} here={here} />)
  }
  return <>{out}</>
}

function BaseNote({ org, here }: { org: Org; here: Spot }) {
  const km = distanceKm(here, org.place)
  if (km < 1) return null
  return (
    <p className="map-chain__base">
      {org.account.name ?? "The organization"} is based in {(org.place.name ? formatPlace(org.place.name) : "") || org.place.country || "another place"}, {km < 100 ? `${Math.round(km)} km` : `${(Math.round(km / 10) * 10).toLocaleString("en-US")} km`} away.
    </p>
  )
}

function ChainItem({
  kind,
  href,
  title,
  who,
  note,
}: {
  kind: Layer
  href: string
  title: string
  who?: MapModel["accounts"][number]
  note: string
}) {
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
              {who.name ?? "Unnamed account"}
            </span>
          ) : null}
          <span>{note}</span>
        </span>
      </span>
    </div>
  )
}

function MapLegend() {
  return (
    <div className="map-legend" aria-label="Legend">
      <span>
        <span className="map-swatch map-swatch--ringdot" aria-hidden /> A project and its activities at one spot
      </span>
      <span>
        <span className="map-swatch map-swatch--disc" aria-hidden /> Approximate, drawn at its true size
      </span>
      <span>
        <span className="map-swatch map-swatch--hatch" aria-hidden /> Only the country is known
      </span>
      <span>
        <span className="map-swatch map-swatch--area" aria-hidden /> Drawn area
      </span>
    </div>
  )
}

export function formatArea(km2: number): string {
  if (km2 < 1) {
    const ha = km2 * 100
    return `${ha < 10 ? ha.toFixed(1).replace(/\.0$/, "") : Math.round(ha).toLocaleString("en-US")} ha`
  }
  return `${km2 < 10 ? km2.toFixed(1).replace(/\.0$/, "") : Math.round(km2).toLocaleString("en-US")} km²`
}

export function formatDate(d: string): string {
  const t = new Date(`${d}T00:00:00Z`)
  return Number.isNaN(t.getTime())
    ? d
    : t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

