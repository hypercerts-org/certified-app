"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ResponsiveDialog from "@/components/ui/responsive-dialog"
import { AppDialogHeader } from "@/components/ui/app-dialog"
import { profileUrl, recordUrlFromAtUri } from "@/lib/urls"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import { dailyTotals, type ProjectTotal } from "@/lib/funding/select"
import { formatCount, formatShortDay, formatUsd, formatUsdShort, formatPlace } from "@/lib/funding/format"
import { useElementWidth } from "./use-element-width"

/** How many projects get a tile; the rest share the avatar strip. */
const TILE_COUNT = 24
const MOSAIC_HEIGHT = 480
const PANEL_WIDTH = 320
/** Below this container width the mosaic becomes a two-column card grid. */
const STACK_BELOW = 760

/**
 * Projects first: a wall of the work, each project a tile sized by the
 * money it received, with its banner photo. Picking a tile (or an avatar in
 * the strip) shows that project's funding in the panel beside the wall.
 *
 * Narrow (phones, and a narrow desktop window) the wall is a two-column
 * card grid with no room beside it: picking a card opens its funding in a
 * sheet (a dialog from 800px) over the page, so the reader stays where they
 * picked it, and the projects past the first cards are a "Show the other N
 * projects" list of rows (name and amount) rather than a strip of tiny
 * marks.
 */
export default function FundingMosaic({
  ds,
  totals,
  idx,
  selected,
  onSelect,
  onShowReceipts,
}: {
  ds: FundingDataset
  totals: ProjectTotal[]
  idx: readonly number[]
  /** Selected project (index into ds.projects), or -1 for the largest. */
  selected: number
  onSelect: (project: number) => void
  onShowReceipts: (project: number) => void
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const stacked = width > 0 && width < STACK_BELOW
  // Narrow: the picked project's funding in a sheet, and the rest of the
  // projects behind a button.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [tailOpen, setTailOpen] = useState(false)
  // The button that showed the list is gone: its first row takes focus.
  const tailListRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (tailOpen) tailListRef.current?.querySelector("button")?.focus({ preventScroll: true })
  }, [tailOpen])
  const pick = (project: number) => {
    onSelect(project)
    if (stacked) setSheetOpen(true)
  }
  const tiles = totals.slice(0, TILE_COUNT)
  const tail = totals.slice(TILE_COUNT)
  const current = totals.find((t) => t.project === selected) ?? totals[0] ?? null
  const tailTotal = tail.reduce((s, t) => s + t.total, 0)

  const mosaicWidth = stacked ? width : Math.max(0, width - PANEL_WIDTH - 20)
  const layout = useMemo(() => {
    if (stacked || mosaicWidth <= 0 || tiles.length === 0) return []
    const root = hierarchy<{ children?: ProjectTotal[]; total?: number }>({ children: tiles })
      .sum((d) => d.total ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    treemap<{ children?: ProjectTotal[]; total?: number }>()
      .tile(treemapSquarify.ratio(1.2))
      .size([mosaicWidth, MOSAIC_HEIGHT])
      .paddingInner(4)
      .round(true)(root)
    return root.leaves().map((leaf) => {
      const l = leaf as typeof leaf & { x0: number; y0: number; x1: number; y1: number }
      return { t: leaf.data as unknown as ProjectTotal, x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0 }
    })
  }, [stacked, mosaicWidth, tiles])

  if (totals.length === 0) {
    return (
      <div ref={ref} className="funding-empty">
        <p>No project funding in this selection.</p>
      </div>
    )
  }

  return (
    <div ref={ref} className={`funding-mosaic${stacked ? " funding-mosaic--stacked" : ""}`}>
      <div className="funding-mosaic__main">
        {stacked ? (
          <div className="funding-mosaic__cards">
            {tiles.map((t) => (
              <ProjectCard key={t.project} ds={ds} t={t} selected={sheetOpen && current?.project === t.project} onSelect={pick} />
            ))}
          </div>
        ) : (
          <div className="funding-mosaic__tiles" style={{ height: MOSAIC_HEIGHT }}>
            {layout.map(({ t, x, y, w, h }) => (
              <ProjectTile
                key={t.project}
                ds={ds}
                t={t}
                box={{ x, y, w, h }}
                selected={current?.project === t.project}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
        {tail.length > 0 && stacked ? (
          tailOpen ? (
            <>
              <div className="funding-mosaic__tail-caption">
                <span>
                  The other {formatCount(tail.length)} projects · {formatUsd(tailTotal)}
                </span>
                <span>Largest first</span>
              </div>
              <ul ref={tailListRef} className="funding-mosaic__tail-list">
                {tail.map((t) => (
                  <li key={t.project}>
                    <TailRow ds={ds} t={t} onSelect={pick} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Button
              variant="secondary"
              size="md"
              className="funding-mosaic__tail-more"
              onClick={() => setTailOpen(true)}
            >
              Show the other {formatCount(tail.length)} projects
            </Button>
          )
        ) : tail.length > 0 ? (
          <>
            <div className="funding-mosaic__tail-caption">
              <span>
                The other {formatCount(tail.length)} projects · {formatUsd(tailTotal)}
              </span>
              <span>Largest first</span>
            </div>
            <div className="funding-mosaic__tail">
              {tail.map((t) => {
                const p = ds.projects[t.project]
                const owner = ds.accounts[p.owner]
                return (
                  <button
                    key={t.project}
                    type="button"
                    className="funding-mosaic__tail-item"
                    aria-pressed={current?.project === t.project}
                    title={`${owner?.name ?? p.title ?? "Project"} · ${formatUsd(t.total)}`}
                    onClick={() => onSelect(t.project)}
                  >
                    <Avatar
                      src={owner?.avatar ?? p.avatar ?? undefined}
                      alt=""
                      size="xs"
                      shape="square"
                      seed={owner?.did}
                      fallbackInitials={initials(owner?.name ?? p.title)}
                    />
                  </button>
                )
              })}
            </div>
          </>
        ) : null}
      </div>
      {current && !stacked ? (
        <ProjectPanel ds={ds} t={current} idx={idx} onShowReceipts={onShowReceipts} />
      ) : null}
      {current && stacked ? (
        <ResponsiveDialog
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          ariaLabel={ds.projects[current.project]?.title ?? "Project"}
          header={<AppDialogHeader title="" bare onClose={() => setSheetOpen(false)} />}
          className="funding-sheet"
          maxWidth={420}
        >
          <ProjectPanel ds={ds} t={current} idx={idx} onShowReceipts={onShowReceipts} />
        </ResponsiveDialog>
      ) : null}
    </div>
  )
}

/** One of the other projects, narrow: its mark, name and amount. */
function TailRow({
  ds,
  t,
  onSelect,
}: {
  ds: FundingDataset
  t: ProjectTotal
  onSelect: (project: number) => void
}) {
  const p = ds.projects[t.project]
  const owner = ds.accounts[p.owner]
  const name = owner?.name ?? p.title ?? "Project"
  return (
    <button type="button" className="funding-mosaic__tail-row" onClick={() => onSelect(t.project)}>
      <Avatar
        src={owner?.avatar ?? p.avatar ?? undefined}
        alt=""
        size="xs"
        shape="square"
        seed={owner?.did}
        fallbackInitials={initials(owner?.name ?? p.title)}
      />
      <span className="funding-mosaic__tail-name">{name}</span>
      <span className="funding-mosaic__tail-amount">{formatUsd(t.total)}</span>
    </button>
  )
}

function initials(name: string | null | undefined): string {
  if (!name) return "?"
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")
}

/**
 * A project's banner photo, or, with none or once it fails to load, the
 * project's avatar mark (its picture, else initials on the account's ring),
 * never the browser's broken-image icon. The failure is kept per URL, so a
 * new banner gets its own try.
 */
export function useBannerFailed(src: string | null | undefined): [boolean, () => void] {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  return [!!src && failedSrc === src, () => setFailedSrc(src ?? null)]
}

function ProjectMark({ ds, t }: { ds: FundingDataset; t: ProjectTotal }) {
  const p = ds.projects[t.project]
  const owner = ds.accounts[p.owner]
  return (
    <Avatar
      src={p.avatar ?? owner?.avatar ?? undefined}
      alt=""
      size="lg"
      seed={owner?.did}
      fallbackInitials={initials(owner?.name ?? p.title)}
    />
  )
}

export function TileImage({ ds, t }: { ds: FundingDataset; t: ProjectTotal }) {
  const p = ds.projects[t.project]
  const [failed, onError] = useBannerFailed(p.banner)
  if (p.banner && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="funding-tile__photo" src={p.banner} alt="" loading="lazy" decoding="async" onError={onError} />
  }
  return (
    <span className="funding-tile__mark">
      <ProjectMark ds={ds} t={t} />
    </span>
  )
}

function ProjectTile({
  ds,
  t,
  box,
  selected,
  onSelect,
}: {
  ds: FundingDataset
  t: ProjectTotal
  box: { x: number; y: number; w: number; h: number }
  selected: boolean
  onSelect: (project: number) => void
}) {
  const p = ds.projects[t.project]
  const owner = ds.accounts[p.owner]
  const name = owner?.name ?? p.title ?? "Project"
  const roomy = box.w >= 120 && box.h >= 96
  return (
    <button
      type="button"
      className="funding-tile"
      aria-pressed={selected}
      aria-label={`${name}: ${formatUsd(t.total)} from ${formatCount(t.count)} gifts`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      onClick={() => onSelect(t.project)}
    >
      <TileImage ds={ds} t={t} />
      {roomy ? (
        <span className="funding-tile__caption">
          <span className="funding-tile__name">{name}</span>
          <span className="funding-tile__amount">{formatUsdShort(t.total)}</span>
        </span>
      ) : (
        <span className="funding-tile__tag">{formatUsdShort(t.total)}</span>
      )}
    </button>
  )
}

function ProjectCard({
  ds,
  t,
  selected,
  onSelect,
}: {
  ds: FundingDataset
  t: ProjectTotal
  selected: boolean
  onSelect: (project: number) => void
}) {
  const p = ds.projects[t.project]
  const owner = ds.accounts[p.owner]
  const name = owner?.name ?? p.title ?? "Project"
  return (
    <button
      type="button"
      className="funding-card"
      aria-pressed={selected}
      onClick={() => onSelect(t.project)}
    >
      <span className="funding-card__image">
        <TileImage ds={ds} t={t} />
      </span>
      <span className="funding-card__body">
        <span className="funding-card__name">{name}</span>
        <span className="funding-card__meta">
          {formatUsd(t.total)} · {formatCount(t.count)} gifts
        </span>
      </span>
    </button>
  )
}

function ProjectPanel({
  ds,
  t,
  idx,
  onShowReceipts,
}: {
  ds: FundingDataset
  t: ProjectTotal
  idx: readonly number[]
  onShowReceipts: (project: number) => void
}) {
  const p = ds.projects[t.project]
  const owner = ds.accounts[p.owner]
  const href = recordUrlFromAtUri(p.uri)
  const days = useMemo(
    () => dailyTotals(ds, idx, (i) => ds.receipts.project[i] === t.project),
    [ds, idx, t.project],
  )
  const anonShare = t.count > 0 ? Math.round((t.anonymous / t.count) * 100) : 0
  const [bannerFailed, onBannerError] = useBannerFailed(p.banner)
  return (
    <aside className="funding-panel" aria-label="Selected project">
      <div className="funding-panel__banner">
        {p.banner && !bannerFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.banner} alt="" loading="lazy" decoding="async" onError={onBannerError} />
        ) : (
          <ProjectMark ds={ds} t={t} />
        )}
      </div>
      <div className="funding-panel__body">
        {owner ? (
          <Link href={profileUrl(owner.did)} className="funding-panel__owner">
            <Avatar src={owner.avatar ?? undefined} alt="" size="xs" seed={owner.did} fallbackInitials={initials(owner.name)} />
            <span className="funding-panel__owner-text">
              <span className="funding-panel__owner-name">{owner.name ?? "Organization"}</span>
              {p.place ? <span className="funding-panel__place">{formatPlace(p.place)}</span> : null}
            </span>
          </Link>
        ) : null}
        <h3 className="font-headline text-h4 funding-panel__title" dir="auto">
          {p.title ?? "Untitled project"}
        </h3>
        <dl className="funding-panel__stats">
          <div>
            <dt>Received</dt>
            <dd>{formatUsd(t.total)}</dd>
          </div>
          <div>
            <dt>Gifts</dt>
            <dd>{formatCount(t.count)}</dd>
          </div>
          <div>
            <dt>Named donors</dt>
            <dd>{formatCount(t.donors)}</dd>
          </div>
          <div>
            <dt>Anonymous</dt>
            <dd>{anonShare}%</dd>
          </div>
        </dl>
        <Sparkline days={days} first={t.first} last={t.last} />
        <div className="funding-panel__actions">
          {href ? (
            <Button href={href} size="sm" variant="primary">
              Open project
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => onShowReceipts(t.project)}>
            Its receipts
          </Button>
        </div>
      </div>
    </aside>
  )
}

/** Gifts per day for one project, as bars. */
function Sparkline({ days, first, last }: { days: { day: number; count: number }[]; first: number; last: number }) {
  if (days.length === 0) return null
  const W = 280
  const H = 44
  const d0 = days[0].day
  const d1 = Math.max(days[days.length - 1].day, d0 + 1)
  const max = Math.max(...days.map((d) => d.count))
  const bw = Math.max(1.5, Math.min(6, W / (d1 - d0 + 1) - 0.5))
  return (
    <figure className="funding-panel__spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {days.map((d) => {
          const x = ((d.day - d0) / (d1 - d0)) * (W - bw)
          const h = Math.max(1.5, (d.count / max) * (H - 2))
          return <rect key={d.day} x={x} y={H - h} width={bw} height={h} fill="currentColor" />
        })}
      </svg>
      <figcaption>
        <span>{formatShortDay(first)}</span>
        <span>Gifts per day</span>
        <span>{formatShortDay(last)}</span>
      </figcaption>
    </figure>
  )
}
