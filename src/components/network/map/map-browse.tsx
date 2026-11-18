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
  placeTitle,
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
import { font, hatch, haloText } from "./marks"
import { NO_HITS, drawApproxDiscs, drawAreaOutlines, drawSpotMarks, hitSpots, spotsBounds, sumCounts, type SpotHits } from "./draw-spots"
import type { MapLayers } from "./use-map-layers"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { useOverflowEdges } from "@/hooks/use-overflow-edges"
import TabStripFades from "@/components/ui/tab-strip-fades"

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

/** Rows per "Show more": the desktop list scrolls beside the map; on phones
 *  the list runs in the page under it, so it grows in smaller steps. */
const LIST_PAGE = 40
const LIST_PAGE_PHONE = 20

type Selection = { kind: "spot"; key: string } | { kind: "country"; key: string } | null


interface Hover {
  x: number
  y: number
  title: string
  detail: string
}

/** How many records each layer holds: the counts on the layer chips. */
export function layerCountsOf(model: MapModel): LayerCounts {
  const n = emptyCounts()
  n.activity = model.activities.filter((a) => a.place).length
  n.project = model.projects.filter((p) => p.place).length
  n.org = model.orgs.length
  n.unused = model.unused.length
  return n
}

/**
 * The layer chips ("Show"): one per layer, with its mark and count. In the
 * page above the map from 800px; in the Filters sheet on phones, where they
 * wrap (map-page.tsx).
 */
export function MapLayerChips({
  layers,
  toggle,
  counts,
}: {
  layers: ReadonlySet<Layer>
  toggle: (layer: Layer) => void
  counts: LayerCounts
}) {
  return (
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
            <span className="map-chips__count">{counts[l].toLocaleString("en-US")}</span>
          </>
        ),
      }))}
    />
  )
}

export default function MapBrowse({
  model,
  kind,
  height,
  resize,
  layerState,
  startBand,
}: MapViewProps & {
  /** The layer chips' state, held by the page so the phone Filters sheet
   *  and the chips in the page are one control. */
  layerState: MapLayers
}) {
  const { layers, toggle } = layerState
  const { isDesktop } = useLayoutBreakpoints()
  const pageSize = isDesktop ? LIST_PAGE : LIST_PAGE_PHONE
  const [query, setQuery] = useState("")
  const [onlyInView, setOnlyInView] = useState(true)
  const [selected, setSelected] = useState<Selection>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [tip, setTip] = useState<Hover | null>(null)
  // Pages of the list shown (each `pageSize` rows).
  const [pages, setPages] = useState(1)
  const limit = pages * pageSize
  const [inView, setInView] = useState<{ spots: Set<string>; countries: Set<string> } | null>(null)
  const mapRef = useRef<WorldMapHandle>(null)
  const drawn = useRef<SpotHits>(NO_HITS)
  const listRef = useRef<HTMLDivElement>(null)

  const all = useMemo(() => itemsFor(model, layers), [model, layers])
  const items = useMemo(() => (query ? all.filter((it) => matchesQuery(it, query)) : all), [all, query])
  const groups = useMemo(() => groupItems(items), [items])

  const bases = useMemo(() => new Map(model.orgs.map((o) => [o.account.i, o])), [model])
  const layerCounts = useMemo(() => layerCountsOf(model), [model])

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
      // Fading as the map closes in: inside a country it says nothing new.
      const pattern = hatch(ctx, c.muted)
      const hatchAlpha = a.zoom <= 4 ? 0.5 : a.zoom >= 40 ? 0 : 0.5 * (1 - Math.log(a.zoom / 4) / Math.log(10))
      for (const g of groups.countries) {
        const f = features[g.countryFeature]
        if (!f) continue
        const sel = selected?.kind === "country" && selected.key === g.key
        const hot = hoverKey === g.key
        ctx.save()
        ctx.beginPath()
        a.path(f)
        ctx.globalAlpha = sel || hot ? Math.max(0.35, hatchAlpha * 1.8) : hatchAlpha
        if (pattern && ctx.globalAlpha > 0) {
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
      const highlight = [selected?.key, hoverKey]
      drawApproxDiscs(a, groups.spots)
      drawAreaOutlines(a, groups.spots, highlight)
      const hits = drawSpotMarks(a, groups.spots, highlight)
      const { marks, pills } = hits

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
      drawn.current = hits
    },
    [groups, selected, hoverKey],
  )

  // --- Pointer ---
  const hitAt = (x: number, y: number, a: MapApi) => {
    const hit = hitSpots(drawn.current, x, y)
    if (hit) return hit
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
    if (h.type === "spot") setTip({ x, y, title: placeTitle(h.spot.name ? formatPlace(h.spot.name) : null, h.spot.country), detail: `${PRECISION_LABEL[h.spot.prec]} · ${countsText(h.spot.counts)}` })
    else if (h.type === "pill") {
      setTip({ x, y, title: `${h.spots.length} places close together`, detail: `${countsText(sumCounts(h.spots))}. Click to zoom in.` })
    } else setTip({ x, y, title: `Somewhere in ${h.group.country}`, detail: `Only the country is known · ${countsText(h.group.counts)}` })
    return true
  }

  const select = (sel: Selection) => {
    setSelected(sel)
    if (!sel) return
    // The row may be past the current page of the list.
    const rows = listOrder()
    const at = rows.findIndex((r) => r.key === sel.key)
    if (at >= limit) setPages(Math.ceil((at + 1) / pageSize))
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
    else if (h.type === "pill") mapRef.current?.fitBounds(spotsBounds(h.spots), 60)
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

  // The layer chips scroll sideways when wider than the page; a fade over
  // the cut edge says there are more.
  const chipsRef = useRef<HTMLDivElement>(null)
  const chipEdges = useOverflowEdges(chipsRef)

  return (
    <div className="map-browse">
      {/* From 800px; phones have them in the Filters sheet (map-page.tsx). */}
      <div className="map-browse__chips">
        <span className="map-browse__label" aria-hidden="true">
          Show
        </span>
        <div className="map-browse__chips-frame">
          <div className="map-browse__chips-scroll" ref={chipsRef}>
            <MapLayerChips layers={layers} toggle={toggle} counts={layerCounts} />
          </div>
          <TabStripFades start={chipEdges.start} end={chipEdges.end} />
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
                setPages(1)
              }}
              placeholder="Search titles, places, accounts"
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
                  ? isDesktop
                    ? "Turn on a layer above to see it here."
                    : "Turn on a layer in Filters to see it here."
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
                <Button variant="secondary" size="sm" onClick={() => setPages((n) => n + 1)}>
                  Show {Math.min(pageSize, rows.length - limit)} more
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
            startBand={startBand}
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

export function countsText(n: LayerCounts): string {
  const parts: string[] = []
  if (n.activity) parts.push(`${n.activity} ${n.activity === 1 ? "activity" : "activities"}`)
  if (n.project) parts.push(`${n.project} ${n.project === 1 ? "project" : "projects"}`)
  if (n.org) parts.push(`${n.org} ${n.org === 1 ? "account based here" : "accounts based here"}`)
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
  const title = row.spot ? placeTitle(row.spot.name ? formatPlace(row.spot.name) : null, row.spot.country) : `Somewhere in ${row.group!.country}`
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
        <ChainItem key={`o${o.i}`} kind="org" href={o.href} title={o.account.name ?? "Unnamed account"} who={o.account} note="Based here" />
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
      {org.account.name ?? "The account"} is based in {(org.place.name ? formatPlace(org.place.name) : "") || org.place.country || "another place"}, {km < 100 ? `${Math.round(km)} km` : `${(Math.round(km / 10) * 10).toLocaleString("en-US")} km`} away.
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

