"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react"
import Link from "next/link"
import { ArrowDown, ArrowLeft } from "lucide-react"
import SegmentedControl from "@/components/ui/segmented-control"
import Button from "@/components/ui/button"
import Avatar from "@/components/ui/avatar"
import Tooltip from "@/components/ui/tooltip"
import { getInitials } from "@/lib/utils/initials"
import { formatPlace } from "@/lib/funding/format"
import { countryAt, countryFeatures } from "@/lib/map/countries"
import {
  PRECISION_LABEL,
  groupItems,
  type Account,
  type Activity,
  type Org,
  type Project,
  type Spot,
} from "@/lib/map/model"
import {
  COUNT_KINDS,
  NO_COUNTRY,
  REGIONS,
  REGION_BOUNDS,
  STEPS,
  STEP_PAINT,
  buildCountryRows,
  countryFitBounds,
  countryLabel,
  isCountryOnly,
  ordinal,
  rankRows,
  stepOf,
  type CountKind,
  type Counted,
  type CountryRow,
  type Region,
} from "@/lib/map/countries-view"
import WorldMap, { type MapApi, type WorldMapHandle } from "./world-map"
import type { MapViewProps } from "./view-props"
import { hatch } from "./marks"
import { NO_HITS, drawApproxDiscs, drawAreaOutlines, drawSpotMarks, hitSpots, spotsBounds, sumCounts, type SpotHits } from "./draw-spots"
import { countsText, formatDate } from "./map-browse"

/**
 * The Countries view: each country shaded by how many activities, projects
 * or organizations it holds (the visitor picks which), with region totals
 * and a ranked table beside the map. A place that only names the country
 * counts in full here. Picking a country fits the map to it and turns the
 * panel into that country: what is placed more exactly (drawn as marks)
 * and what only names the country (listed, not drawn).
 */

const KIND: Record<CountKind, { label: string; column: string; one: string; many: string; by: string }> = {
  activity: { label: "Activities", column: "Activities", one: "activity", many: "activities", by: "activities" },
  project: { label: "Projects", column: "Projects", one: "project", many: "projects", by: "projects" },
  org: {
    label: "Organizations based here",
    column: "Organizations",
    one: "organization",
    many: "organizations",
    by: "organizations based there",
  },
}

const fmt = (n: number) => n.toLocaleString("en-US")
const plural = (n: number, k: CountKind) => `${fmt(n)} ${n === 1 ? KIND[k].one : KIND[k].many}`

/** List entries shown at first, per group. */
const LIST_PAGE = 30
/** `hi` while a country-only item is pointed at: the country itself. */
const HI_COUNTRY = "~country"
const SPHERE = { type: "Sphere" } as const

type Sort = "count" | "name"

interface Tip {
  /** Where the card is anchored, from the map's edges. */
  pos: CSSProperties
  title: string
  lines: string[]
  left: boolean
  up: boolean
}


export default function MapCountries({ model, kind, height, resize }: MapViewProps) {
  const [measure, setMeasure] = useState<CountKind>("activity")
  const [sort, setSort] = useState<Sort>("count")
  const [region, setRegion] = useState<Region | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hoverCountry, setHoverCountry] = useState<string | null>(null)
  /** A spot (or HI_COUNTRY) pointed at in the list. */
  const [hi, setHi] = useState<string | null>(null)
  /** A spot picked on the map. */
  const [picked, setPicked] = useState<string | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const mapRef = useRef<WorldMapHandle>(null)
  const drawn = useRef<SpotHits>(NO_HITS)
  /** Move focus to the panel's heading after the next switch (keyboard and list use). */
  const focusPanel = useRef(false)
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focusPanel.current) return
    focusPanel.current = false
    panelRef.current?.querySelector<HTMLElement>(".map-cx__title")?.focus({ preventScroll: true })
  }, [selected, region])

  const { rows, none, byKey, byFeature } = useMemo(() => buildCountryRows(model), [model])
  const totals = useMemo(() => {
    const t = { activity: 0, project: 0, org: 0 }
    for (const r of [...rows, none]) for (const k of COUNT_KINDS) t[k] += r.n[k]
    return t
  }, [rows, none])
  const ranked = useMemo(() => rankRows(rows.filter((r) => r.n[measure] > 0), measure), [rows, measure])
  const rank = useMemo(() => new Map(ranked.map((r, i) => [r.key, i + 1])), [ranked])

  const sel = selected ? (byKey.get(selected) ?? null) : null
  const selItems = useMemo<Counted[]>(() => (sel ? [...sel.items.project, ...sel.items.activity, ...sel.items.org] : []), [sel])
  const selSpots = useMemo(() => groupItems(selItems.filter((it) => !isCountryOnly(it))).spots, [selItems])
  const spotOf = useMemo(() => {
    const m = new Map<Counted, string>()
    for (const s of selSpots) for (const it of s.items) m.set(it as Counted, s.key)
    return m
  }, [selSpots])

  // --- Drawing ---
  const draw = useCallback(
    (a: MapApi) => {
      const { ctx, colors: c } = a
      const features = countryFeatures()
      drawn.current = NO_HITS

      if (!sel) {
        // Each country in its step of the counted kind's hue.
        const hue = c[measure]
        for (const r of rows) {
          const step = stepOf(r.n[measure])
          const f = features[r.feature]
          if (step < 0 || !f) continue
          const paint = STEP_PAINT[step]
          ctx.beginPath()
          a.path(f)
          ctx.globalAlpha = paint.hue
          ctx.fillStyle = hue
          ctx.fill()
          if (paint.ink > 0) {
            ctx.globalAlpha = paint.ink
            ctx.fillStyle = c.fg
            ctx.fill()
          }
          // Outside the chosen region: stepped back towards the land.
          if (region && r.region !== region) {
            ctx.globalAlpha = 0.72
            ctx.fillStyle = c.land
            ctx.fill()
          }
          ctx.globalAlpha = 1
          ctx.lineWidth = 0.75
          ctx.strokeStyle = c.halo
          ctx.stroke()
        }
        const hot = hoverCountry ? byKey.get(hoverCountry) : null
        const hf = hot ? features[hot.feature] : null
        if (hf) {
          ctx.beginPath()
          a.path(hf)
          ctx.lineWidth = 1.5
          ctx.strokeStyle = c.fg
          ctx.stroke()
        }
        return
      }

      // One country: the rest of the world steps back.
      const f = sel.feature >= 0 ? features[sel.feature] : null
      if (f) {
        ctx.save()
        ctx.beginPath()
        if (a.kind === "globe") a.path(SPHERE)
        else ctx.rect(0, 0, a.width, a.height)
        a.path(f)
        ctx.globalAlpha = 0.5
        ctx.fillStyle = c.sea
        ctx.fill("evenodd")
        ctx.restore()
        // Pointing at something that only names the country: all of it.
        const pattern = hi === HI_COUNTRY ? hatch(ctx, c.muted) : null
        ctx.beginPath()
        a.path(f)
        if (pattern) {
          ctx.save()
          ctx.globalAlpha = 0.8
          ctx.fillStyle = pattern
          ctx.fill()
          ctx.restore()
        }
        ctx.lineWidth = 1.5
        ctx.strokeStyle = c.fg
        ctx.stroke()
      }
      const other = hoverCountry && hoverCountry !== sel.key ? byKey.get(hoverCountry) : null
      const of = other ? features[other.feature] : null
      if (of) {
        ctx.beginPath()
        a.path(of)
        ctx.lineWidth = 1.25
        ctx.strokeStyle = c.muted
        ctx.stroke()
      }

      const highlight = [picked, hi]
      drawApproxDiscs(a, selSpots)
      drawAreaOutlines(a, selSpots, highlight)
      drawn.current = drawSpotMarks(a, selSpots, highlight)
    },
    [sel, rows, measure, region, hoverCountry, byKey, hi, picked, selSpots],
  )

  // --- Moving between the world and a country ---
  const openCountry = useCallback(
    (key: string, focus: boolean) => {
      const r = byKey.get(key)
      if (!r) return
      focusPanel.current = focus
      setSelected(key)
      setPicked(null)
      setHi(null)
      setHoverCountry(null)
      setTip(null)
      const b = r.feature >= 0 ? countryFitBounds(r.feature) : null
      if (b) mapRef.current?.fitBounds(b, 40)
      else mapRef.current?.reset()
    },
    [byKey],
  )

  const toWorld = useCallback(
    (nextRegion: Region | null, focus: boolean) => {
      focusPanel.current = focus
      setSelected(null)
      setPicked(null)
      setHi(null)
      setTip(null)
      setRegion(nextRegion)
      if (nextRegion) mapRef.current?.fitBounds(REGION_BOUNDS[nextRegion], 24)
      else mapRef.current?.reset()
    },
    [],
  )

  // Stable handlers, so the panel doesn't re-render as the pointer moves.
  const onSort = useCallback((s: Sort, k?: CountKind) => {
    setSort(s)
    if (k) setMeasure(k)
  }, [])
  const onRegion = useCallback((rg: Region) => toWorld(rg === region ? null : rg, false), [region, toWorld])
  const onOpenRow = useCallback((key: string) => openCountry(key, true), [openCountry])
  const onBack = useCallback(() => toWorld(region, true), [region, toWorld])

  // --- Pointer ---
  const hitAt = (x: number, y: number, a: MapApi) => {
    const hit = hitSpots(drawn.current, x, y)
    if (hit) return hit
    const ll = a.invert(x, y)
    const f = ll ? countryAt(ll[0], ll[1]) : -1
    if (f >= 0) return { type: "country" as const, feature: f, row: byFeature.get(f) ?? null }
    return null
  }

  const onHover = (x: number, y: number, a: MapApi) => {
    const h = hitAt(x, y, a)
    // Near the right or bottom edge the card turns the other way, anchored
    // to that edge so it keeps its width.
    const left = x > a.width - 280
    const up = y > a.height - 110
    const place = {
      left,
      up,
      pos: { ...(left ? { right: a.width - x } : { left: x }), ...(up ? { bottom: a.height - y } : { top: y }) },
    }
    if (!h) {
      setTip(null)
      setHoverCountry(null)
      return false
    }
    if (h.type === "spot") {
      setHoverCountry(null)
      setTip({
        ...place,
        title: (h.spot.name ? formatPlace(h.spot.name) : "") || "Unnamed place",
        lines: [`${PRECISION_LABEL[h.spot.prec]} · ${countsText(h.spot.counts)}`],
      })
      return true
    }
    if (h.type === "pill") {
      setHoverCountry(null)
      setTip({ ...place, title: `${h.spots.length} places close together`, lines: [`${countsText(sumCounts(h.spots))}. Click to zoom in.`] })
      return true
    }
    const r = h.row
    if (r && r.key === selected) {
      setTip(null)
      setHoverCountry(null)
      return false
    }
    setHoverCountry(r?.key ?? null)
    if (!r) {
      const name = countryFeatures()[h.feature]?.properties.name ?? ""
      setTip({ ...place, title: countryLabel(name), lines: ["Nothing recorded here yet"] })
      return false
    }
    setTip({ ...place, title: r.label, lines: countryLines(r, measure) })
    return true
  }

  const onTap = (x: number, y: number, a: MapApi) => {
    const h = hitAt(x, y, a)
    if (h?.type === "spot") {
      setPicked((p) => (p === h.spot.key ? null : h.spot.key))
      return
    }
    if (h?.type === "pill") {
      mapRef.current?.fitBounds(spotsBounds(h.spots), 60)
      return
    }
    if (h?.type === "country" && h.row && h.row.key !== selected) {
      openCountry(h.row.key, false)
      return
    }
    setPicked(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return
    if (picked) setPicked(null)
    else if (selected) toWorld(region, true)
    else if (region) toWorld(null, true)
    else return
    e.preventDefault()
  }

  const onlyCountry = sel ? sel.countryOnly[measure] : 0

  return (
    <div className={`map-cx map-cx--${measure}`} onKeyDown={onKeyDown}>
      <div className="map-cx__bar">
        <div className="map-cx__measure">
          <SegmentedControl
            aria-label="What to count"
            value={measure}
            onValueChange={(v) => setMeasure(v as CountKind)}
            options={COUNT_KINDS.map((k) => ({
              value: k,
              icon: <span className={`map-swatch map-swatch--${k}`} aria-hidden />,
              label: (
                <>
                  {KIND[k].label}
                  <span className="map-chips__count">{fmt(totals[k])}</span>
                </>
              ),
            }))}
          />
        </div>
        {sel ? <MarksLegend /> : <StepLegend measure={measure} />}
      </div>

      <div className="map-cx__body" style={{ "--cx-h": `${height}px` } as CSSProperties}>
        <div className="map-cx__map">
          <WorldMap
            ref={mapRef}
            kind={kind}
            height={height}
            label={sel ? `Map of ${sel.label}` : `Map of countries, shaded by ${KIND[measure].many}`}
            draw={draw}
            drawKey={draw}
            onHover={onHover}
            onLeave={() => {
              setTip(null)
              setHoverCountry(null)
            }}
            onTap={onTap}
            resize={resize}
          >
            {sel && onlyCountry > 0 ? (
              <p className="map-cx__note">
                {plural(onlyCountry, measure)} only {onlyCountry === 1 ? "names" : "name"}{" "}
                {sel.key === NO_COUNTRY ? "a rough spot" : sel.label}: counted and listed, not drawn.
              </p>
            ) : null}
            {tip ? (
              <div
                className={`map-tip map-cx__tip${tip.left ? " map-cx__tip--left" : ""}${tip.up ? " map-cx__tip--up" : ""}`}
                style={tip.pos}
                role="presentation"
              >
                <b>{tip.title}</b>
                {tip.lines.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            ) : null}
          </WorldMap>
        </div>

        <aside ref={panelRef} className="map-cx__panel" aria-label={sel ? sel.label : "Countries"}>
          {sel ? (
            <CountryPanel
              key={sel.key}
              row={sel}
              measure={measure}
              rank={rank.get(sel.key) ?? 0}
              of={ranked.length}
              backLabel={region ? `Back to ${region}` : "All countries"}
              onBack={onBack}
              spotOf={spotOf}
              picked={picked}
              onHi={setHi}
            />
          ) : (
            <WorldPanel
              rows={rows}
              none={none}
              measure={measure}
              sort={sort}
              region={region}
              hover={hoverCountry}
              onSort={onSort}
              onRegion={onRegion}
              onOpen={onOpenRow}
              onHover={setHoverCountry}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

function countryLines(r: CountryRow, measure: CountKind): string[] {
  const lines = [COUNT_KINDS.filter((k) => r.n[k] > 0).map((k) => plural(r.n[k], k)).join(" · ")]
  const n = r.n[measure]
  const co = r.countryOnly[measure]
  if (n > 0 && co > 0) lines.push(`${fmt(co)} of the ${plural(n, measure)} only ${co === 1 ? "names" : "name"} the country`)
  return lines
}


// --- Legends ------------------------------------------------------------------

function StepLegend({ measure }: { measure: CountKind }) {
  return (
    <div className="map-cx__legend" aria-label={`${KIND[measure].column} per country`}>
      <span className="map-cx__legend-label">{KIND[measure].column} per country</span>
      <ol className="map-cx__steps">
        <li>
          <i className="map-cx__step map-cx__step--zero" aria-hidden />0
        </li>
        {STEPS.map((s, i) => (
          <li key={s.label}>
            <i className={`map-cx__step map-cx__step--${i}`} aria-hidden />
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  )
}

function MarksLegend() {
  return (
    <div className="map-cx__legend map-cx__legend--marks" aria-label="Legend">
      <span>
        <span className="map-swatch map-swatch--activity" aria-hidden /> Activity
      </span>
      <span>
        <span className="map-swatch map-swatch--project" aria-hidden /> Project
      </span>
      <span>
        <span className="map-swatch map-swatch--ringdot" aria-hidden /> A project and its activities
      </span>
      <span>
        <span className="map-swatch map-swatch--org" aria-hidden /> Organization based here
      </span>
    </div>
  )
}

// --- The world: regions and the table -----------------------------------------

const WorldPanel = memo(function WorldPanel({
  rows,
  none,
  measure,
  sort,
  region,
  hover,
  onSort,
  onRegion,
  onOpen,
  onHover,
}: {
  rows: readonly CountryRow[]
  none: CountryRow
  measure: CountKind
  sort: Sort
  region: Region | null
  hover: string | null
  onSort: (sort: Sort, measure?: CountKind) => void
  onRegion: (region: Region) => void
  onOpen: (key: string) => void
  onHover: (key: string | null) => void
}) {
  const inRegion = region ? rows.filter((r) => r.region === region) : rows
  const list =
    sort === "name" ? [...inRegion].sort((a, b) => a.label.localeCompare(b.label)) : rankRows(inRegion, measure)
  const withAny = inRegion.filter((r) => r.n[measure] > 0)
  const rank = new Map(rankRows(withAny, measure).map((r, i) => [r.key, i + 1]))
  const sum = withAny.reduce((t, r) => t + r.n[measure], 0)
  const co = withAny.reduce((t, r) => t + r.countryOnly[measure], 0)
  const regions = REGIONS.map((rg) => ({
    rg,
    n: rows.reduce((t, r) => t + (r.region === rg ? r.n[measure] : 0), 0),
  }))
  const most = Math.max(1, ...regions.map((x) => x.n))
  const verb = measure === "org" ? "are based in" : "have a place in"

  return (
    <>
      <div className="map-cx__head">
        <p className="map-cx__eyebrow">{region ?? "World"}</p>
        <h2 tabIndex={-1} className="map-cx__title font-headline text-h3">
          {fmt(withAny.length)} {withAny.length === 1 ? "country" : "countries"}
        </h2>
        <p className="map-cx__sub">
          {plural(sum, measure)} {verb} {withAny.length === 1 ? "it" : "them"}.
          {co > 0 ? ` ${fmt(co)} of these only name the country and still count in full.` : ""}
        </p>
      </div>

      <div className="map-cx__regions" role="group" aria-label="Regions">
        {regions.map(({ rg, n }) => (
          <button
            key={rg}
            type="button"
            className="map-cx__region"
            aria-pressed={region === rg}
            onClick={() => onRegion(rg)}
          >
            <span className="map-cx__region-name">{rg}</span>
            <b>{fmt(n)}</b>
            <i style={{ "--w": `${(n / most) * 100}%` } as CSSProperties} aria-hidden />
          </button>
        ))}
      </div>

      <div className="map-cx__table-wrap" onMouseLeave={() => onHover(null)}>
        <table className="map-cx__table">
          <colgroup>
            <col className="map-cx__col-rank" />
            <col />
            <col className="map-cx__col-n" />
            <col className="map-cx__col-n" />
            <col className="map-cx__col-n" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="map-cx__rank">
                <span aria-hidden>#</span>
                <span className="sr-only">Rank by {KIND[measure].many}</span>
              </th>
              <th scope="col" aria-sort={sort === "name" ? "ascending" : undefined}>
                <button type="button" className="map-cx__sort" aria-pressed={sort === "name"} onClick={() => onSort("name")}>
                  Country
                  <ArrowDown size={11} strokeWidth={2.25} className="map-cx__sort-arrow" aria-hidden />
                </button>
              </th>
              {COUNT_KINDS.map((k) => {
                const on = sort === "count" && measure === k
                return (
                  <th key={k} scope="col" className="map-cx__num" aria-sort={on ? "descending" : undefined}>
                    <Tooltip label={`Sort by ${KIND[k].column.toLowerCase()}`}>
                      <button
                        type="button"
                        className="map-cx__sort map-cx__sort--num"
                        aria-pressed={on}
                        aria-label={`${KIND[k].column}, sort by most`}
                        onClick={() => onSort("count", k)}
                      >
                        <ArrowDown size={11} strokeWidth={2.25} className="map-cx__sort-arrow" aria-hidden />
                        <span className={`map-swatch map-swatch--${k}`} aria-hidden />
                      </button>
                    </Tooltip>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <TableRow key={r.key} row={r} measure={measure} rank={rank.get(r.key)} hot={hover === r.key} onOpen={onOpen} onHover={onHover} />
            ))}
          </tbody>
          <tfoot>
            <TableRow row={none} measure={measure} note="In the sea or off a coast" hot={false} onOpen={onOpen} onHover={onHover} />
          </tfoot>
        </table>
      </div>
    </>
  )
})

function TableRow({
  row,
  measure,
  rank,
  note,
  hot,
  onOpen,
  onHover,
}: {
  row: CountryRow
  measure: CountKind
  rank?: number
  note?: string
  hot: boolean
  onOpen: (key: string) => void
  onHover: (key: string | null) => void
}) {
  return (
    <tr
      className={hot ? "is-hot" : undefined}
      onMouseEnter={() => onHover(row.key === NO_COUNTRY ? null : row.key)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return
        onOpen(row.key)
      }}
    >
      <td className="map-cx__rank">{rank ?? ""}</td>
      <td className="map-cx__name">
        <button type="button" onClick={() => onOpen(row.key)}>
          {row.label}
        </button>
        {note ? <small>{note}</small> : null}
      </td>
      {COUNT_KINDS.map((k) => (
        <td key={k} className={`map-cx__num${k === measure ? " is-on" : ""}`}>
          {row.n[k] > 0 ? fmt(row.n[k]) : <span className="map-cx__zero">0</span>}
        </td>
      ))}
    </tr>
  )
}

// --- One country ----------------------------------------------------------------

type Entry =
  | { type: "project"; project: Project; activities: Activity[] }
  | { type: "activity"; activity: Activity }
  | { type: "org"; org: Org }

/** A group's items as list entries: each project with its activities in the
 *  group nested under it, then other activities, then organizations; the
 *  organizations first when they are what is counted. */
function entriesOf(items: readonly Counted[], measure: CountKind): Entry[] {
  const projects = new Map<number, { type: "project"; project: Project; activities: Activity[] }>()
  for (const it of items) if (it.kind === "project") projects.set(it.i, { type: "project", project: it, activities: [] })
  const loose: Activity[] = []
  const orgs: Org[] = []
  for (const it of items) {
    if (it.kind === "activity") {
      const host = it.project ? projects.get(it.project.i) : undefined
      if (host) host.activities.push(it)
      else loose.push(it)
    } else if (it.kind === "org") orgs.push(it)
  }
  const byDate = (a: Activity, b: Activity) => (b.date ?? "").localeCompare(a.date ?? "")
  const p = [...projects.values()]
  for (const e of p) e.activities.sort(byDate)
  p.sort((a, b) => b.activities.length - a.activities.length || a.project.title.localeCompare(b.project.title))
  const work: Entry[] = [...p, ...loose.sort(byDate).map((activity) => ({ type: "activity" as const, activity }))]
  const based: Entry[] = orgs
    .sort((a, b) => (a.account.name ?? "").localeCompare(b.account.name ?? ""))
    .map((org) => ({ type: "org" as const, org }))
  return measure === "org" ? [...based, ...work] : [...work, ...based]
}

const CountryPanel = memo(function CountryPanel({
  row,
  measure,
  rank,
  of,
  backLabel,
  onBack,
  spotOf,
  picked,
  onHi,
}: {
  row: CountryRow
  measure: CountKind
  rank: number
  of: number
  backLabel: string
  onBack: () => void
  spotOf: ReadonlyMap<Counted, string>
  picked: string | null
  onHi: (key: string | null) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  const none = row.key === NO_COUNTRY
  const all = useMemo(() => [...row.items.project, ...row.items.activity, ...row.items.org], [row])
  const placed = useMemo(() => entriesOf(all.filter((it) => !isCountryOnly(it)), measure), [all, measure])
  const loose = useMemo(() => entriesOf(all.filter(isCountryOnly), measure), [all, measure])
  const [limits, setLimits] = useState({ placed: LIST_PAGE, loose: LIST_PAGE })

  // A spot picked on the map: its entries shown and scrolled to, inside the
  // list only (the page itself doesn't jump).
  const pickedAt = picked ? placed.findIndex((e) => entryKeys(e, spotOf).includes(picked)) : -1
  const shownPlaced = Math.max(limits.placed, pickedAt + 1)
  useEffect(() => {
    if (!picked) return
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(".map-cx__item.is-on")
    if (!list || !el) return
    const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
    list.scrollTo({ top: Math.max(0, top - 48), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }, [picked])

  const showLoose = !none || COUNT_KINDS.some((k) => row.countryOnly[k] > 0)
  const sub = none
    ? "In the sea, or off a coast the world outline is too coarse to catch. They count here and are drawn where they were recorded."
    : row.n[measure] > 0
      ? `${ordinal(rank)} of ${fmt(of)} countries by ${KIND[measure].by}`
      : `No ${KIND[measure].many} here yet`

  return (
    <>
      <div className="map-cx__head">
        <div className="map-cx__back">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden />
            {backLabel}
          </Button>
        </div>
        {row.region ? <p className="map-cx__eyebrow">{row.region}</p> : null}
        <h2 tabIndex={-1} className="map-cx__title font-headline text-h3">
          {row.label}
        </h2>
        <p className="map-cx__sub">{sub}</p>
      </div>

      <table className="map-cx__prec">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Kind</span>
            </th>
            <th scope="col">On the map</th>
            {showLoose ? <th scope="col">{none ? "Too rough to draw" : "Only the country"}</th> : null}
          </tr>
        </thead>
        <tbody>
          {COUNT_KINDS.map((k) => (
            <tr key={k} className={k === measure ? "is-on" : undefined}>
              <th scope="row">
                <span className={`map-swatch map-swatch--${k}`} aria-hidden />
                {KIND[k].column}
              </th>
              <td>{fmt(row.n[k] - row.countryOnly[k])}</td>
              {showLoose ? <td>{fmt(row.countryOnly[k])}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="map-cx__list" ref={listRef}>
        {placed.length === 0 && loose.length === 0 ? <p className="map-cx__empty">Nothing recorded here yet.</p> : null}
        {placed.length > 0 ? (
          <EntryGroup
            title="On the map"
            entries={placed}
            shown={shownPlaced}
            onMore={() => setLimits((l) => ({ ...l, placed: shownPlaced + LIST_PAGE }))}
            spotOf={spotOf}
            picked={picked}
            onHi={onHi}
          />
        ) : null}
        {loose.length > 0 ? (
          <EntryGroup
            title={none ? "Too rough to draw" : `Only says ${row.label}`}
            note={none ? "Listed, not drawn" : "Counted here, not drawn"}
            entries={loose}
            shown={limits.loose}
            onMore={() => setLimits((l) => ({ ...l, loose: l.loose + LIST_PAGE }))}
            spotOf={spotOf}
            picked={null}
            onHi={onHi}
            countryOnly
          />
        ) : null}
      </div>
    </>
  )
})

function entryKeys(e: Entry, spotOf: ReadonlyMap<Counted, string>): string[] {
  const items: Counted[] = e.type === "project" ? [e.project, ...e.activities] : e.type === "activity" ? [e.activity] : [e.org]
  return items.map((it) => spotOf.get(it)).filter((k): k is string => !!k)
}

function EntryGroup({
  title,
  note,
  entries,
  shown,
  onMore,
  spotOf,
  picked,
  onHi,
  countryOnly = false,
}: {
  title: string
  note?: string
  entries: Entry[]
  shown: number
  onMore: () => void
  spotOf: ReadonlyMap<Counted, string>
  picked: string | null
  onHi: (key: string | null) => void
  countryOnly?: boolean
}) {
  const count = entries.reduce((t, e) => t + (e.type === "project" ? 1 + e.activities.length : 1), 0)
  const item = (it: Counted, nested = false, shownHere = 0) => {
    const key = countryOnly ? HI_COUNTRY : (spotOf.get(it) ?? null)
    return (
      <Item
        key={`${it.kind}${it.i}`}
        it={it}
        nested={nested}
        shownHere={shownHere}
        on={!!picked && key === picked}
        onHi={(on) => onHi(on ? key : null)}
      />
    )
  }
  return (
    <section className="map-cx__group">
      <h3 className="map-cx__group-head">
        <span>{title}</span>
        <span className="map-cx__group-n">{fmt(count)}</span>
        {note ? <small>{note}</small> : null}
      </h3>
      <ul className="map-cx__entries">
        {entries.slice(0, shown).map((e) =>
          e.type === "project" ? (
            <li key={`p${e.project.i}`} className="map-chain__group">
              {item(e.project, false, e.activities.length)}
              {e.activities.length > 0 ? (
                <ul className="map-chain__nested">{e.activities.map((a) => <li key={`a${a.i}`}>{item(a, true)}</li>)}</ul>
              ) : null}
            </li>
          ) : (
            <li key={e.type === "activity" ? `a${e.activity.i}` : `o${e.org.i}`}>{item(e.type === "activity" ? e.activity : e.org)}</li>
          ),
        )}
      </ul>
      {entries.length > shown ? (
        <div className="map-cx__more">
          <Button variant="secondary" size="sm" onClick={onMore}>
            Show {Math.min(LIST_PAGE, entries.length - shown)} more
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function Item({
  it,
  nested,
  shownHere,
  on,
  onHi,
}: {
  it: Counted
  nested: boolean
  /** A project: how many of its activities are listed under it. */
  shownHere: number
  on: boolean
  onHi: (on: boolean) => void
}) {
  const p = it.place
  const where = p && p.prec !== "country" ? [PRECISION_LABEL[p.prec], p.name ? formatPlace(p.name) : ""].filter(Boolean).join(" · ") : ""
  let title: string
  let who: Account | null = null
  let note: string
  if (it.kind === "project") {
    title = it.title
    who = it.account
    const n = it.activities.length
    note = ["Project", n > shownHere ? `${n} ${n === 1 ? "activity" : "activities"} in all` : "", where].filter(Boolean).join(" · ")
  } else if (it.kind === "activity") {
    title = it.title
    who = nested ? null : it.account
    note = [it.date ? formatDate(it.date) : "Activity", where, it.via === "project" ? "placed by its project" : ""].filter(Boolean).join(" · ")
  } else {
    title = it.account.name ?? "Unnamed organization"
    note = ["Based here", where].filter(Boolean).join(" · ")
  }
  return (
    <div
      className={`map-chain__item map-cx__item${on ? " is-on" : ""}`}
      onMouseEnter={() => onHi(true)}
      onMouseLeave={() => onHi(false)}
      onFocus={() => onHi(true)}
      onBlur={() => onHi(false)}
    >
      <span className={`map-swatch map-swatch--${it.kind}`} aria-hidden />
      <span className="map-chain__text">
        <Link href={it.href} className="map-chain__title">
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
