"use client"

/**
 * Canvas force-directed endorsement graph. Loaded client-only (it touches
 * `window`/`canvas`) — the parent imports it via `next/dynamic({ ssr: false })`.
 *
 * Nodes are user avatars sized by degree; edges are directed endorsements
 * (arrow points issuer -> subject). Mutual edges render in the accent colour
 * with a slight curvature so the two directions bow apart into a clearly
 * bidirectional lens; one-way edges are a single muted straight arrow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from "react-force-graph-2d"
import Link from "next/link"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import { getInitials } from "@/lib/utils/initials"
import { profileUrl } from "@/lib/urls"
import type { GraphNode, GraphLink } from "@/hooks/use-endorsement-graph"

type FGNode = NodeObject<GraphNode>
type FGLink = LinkObject<GraphNode, GraphLink>

export interface FocusRequest {
  did: string | null
  /** Bumped each time so repeated clicks on the same node re-focus. */
  nonce: number
}

interface EndorsementGraphProps {
  nodes: GraphNode[]
  links: GraphLink[]
  focusReq: FocusRequest
}

interface ThemeColors {
  fg: string
  muted: string
  border: string
  disc: string
  discText: string
  accent: string
  link: string
  bg: string
}

function readThemeColors(): ThemeColors {
  const s = getComputedStyle(document.documentElement)
  const get = (name: string) => s.getPropertyValue(name).trim()
  return {
    fg: get("--fg-primary"),
    muted: get("--fg-muted"),
    border: get("--border-default"),
    disc: get("--bg-raised"),
    discText: get("--fg-secondary"),
    accent: get("--color-success"),
    link: get("--fg-muted"),
    bg: get("--bg-sunken"),
  }
}

function nodeRadius(n: GraphNode): number {
  return Math.min(22, 4 + Math.sqrt(n.given + n.received) * 1.4)
}

function linkEndId(end: string | NodeObject<GraphNode> | undefined): string | null {
  if (end == null) return null
  if (typeof end === "string") return end
  return typeof end.id === "string" ? end.id : null
}

export default function EndorsementGraph({ nodes, links, focusReq }: EndorsementGraphProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined)
  const colorsRef = useRef<ThemeColors | null>(null)
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map())

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  // Background is read during render (a prop), so it lives in state rather
  // than the colours ref; updated alongside the ref on theme changes.
  const [bgColor, setBgColor] = useState<string | undefined>(undefined)
  const [onlyMutual, setOnlyMutual] = useState(false)
  const [search, setSearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Draggable + collapsible details panel.
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ sx: number; sy: number; bx: number; by: number } | null>(null)
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(true)

  // --- theme colours (re-read on dark-mode flip) -------------------------
  useEffect(() => {
    const apply = () => {
      const c = readThemeColors()
      colorsRef.current = c
      setBgColor(c.bg)
    }
    apply()
    const obs = new MutationObserver(apply)
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    })
    return () => obs.disconnect()
  }, [])

  // --- responsive sizing -------------------------------------------------
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ w: Math.round(rect.width), h: Math.round(rect.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // --- preload avatars ---------------------------------------------------
  // The canvas runs with autoPauseRedraw disabled (see the ForceGraph2D
  // props below), so it keeps repainting every frame and avatars appear as
  // their images finish loading — no manual repaint needed. We still
  // preload into a stable map so the paint loop never mints a new Image per
  // frame.
  useEffect(() => {
    const map = imagesRef.current
    for (const n of nodes) {
      if (!n.avatarUrl || map.has(n.id)) continue
      const img = new Image()
      img.decoding = "async"
      img.src = n.avatarUrl
      map.set(n.id, img)
    }
  }, [nodes])

  // --- filtered working data (mutual-only toggle) ------------------------
  const data = useMemo(() => {
    if (!onlyMutual) return { nodes, links }
    const mutualLinks = links.filter((l) => l.mutual)
    const keep = new Set<string>()
    for (const l of mutualLinks) {
      keep.add(linkEndId(l.source) ?? "")
      keep.add(linkEndId(l.target) ?? "")
    }
    return {
      nodes: nodes.filter((n) => keep.has(n.id)),
      links: mutualLinks,
    }
  }, [nodes, links, onlyMutual])

  // --- adjacency for hover/selection highlight ---------------------------
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const add = (a: string, b: string) => {
      let s = map.get(a)
      if (!s) {
        s = new Set()
        map.set(a, s)
      }
      s.add(b)
    }
    for (const l of links) {
      const s = linkEndId(l.source)
      const t = linkEndId(l.target)
      if (s && t) {
        add(s, t)
        add(t, s)
      }
    }
    return map
  }, [links])

  const activeId = hoverId ?? selectedId
  const highlightNodes = useMemo(() => {
    if (!activeId) return null
    const set = new Set<string>([activeId])
    for (const n of adjacency.get(activeId) ?? []) set.add(n)
    return set
  }, [activeId, adjacency])

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  // --- focus requests from the sidebar / search --------------------------
  // Fit the clicked node together with everyone it's connected to into
  // view. The neighbourhood is derived dynamically from the adjacency map,
  // so the zoom adapts to how many connections the account has.
  const focusNode = useCallback(
    (did: string | null) => {
      if (!did) return
      const fg = fgRef.current
      if (!fg) return
      setSelectedId(did)
      const inView = new Set<string>([did])
      for (const n of adjacency.get(did) ?? []) inView.add(n)
      // zoomToFit's third arg filters which nodes must fit in the viewport.
      fg.zoomToFit(700, 60, (n: FGNode) => inView.has(n.id as string))
    },
    [adjacency],
  )

  useEffect(() => {
    if (focusReq.did) focusNode(focusReq.did)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq.nonce])

  // Accounts matching the search box, ranked by degree. Drives the
  // results dropdown.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [] as GraphNode[]
    return nodes
      .filter(
        (n) =>
          (n.handle && n.handle.toLowerCase().includes(q)) ||
          (n.displayName && n.displayName.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.given + b.received - (a.given + a.received))
      .slice(0, 8)
  }, [search, nodes])

  const selectSearchResult = useCallback(
    (did: string) => {
      focusNode(did)
      setSearch("")
      setSearchOpen(false)
    },
    [focusNode],
  )

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (searchResults[0]) selectSearchResult(searchResults[0].id)
    },
    [searchResults, selectSearchResult],
  )

  // --- canvas painters ---------------------------------------------------
  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const c = colorsRef.current
      if (!c || typeof node.x !== "number" || typeof node.y !== "number") return
      const r = nodeRadius(node)
      const isActive = activeId === node.id
      const dim = highlightNodes ? !highlightNodes.has(node.id) : false

      ctx.save()
      ctx.globalAlpha = dim ? 0.12 : 1

      // avatar (clipped circle) or initials disc
      const img = imagesRef.current.get(node.id)
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save()
        ctx.clip()
        ctx.drawImage(img, node.x - r, node.y - r, r * 2, r * 2)
        ctx.restore()
      } else {
        ctx.fillStyle = c.disc
        ctx.fill()
        const label = getInitials(node.displayName, node.id)
        ctx.fillStyle = c.discText
        ctx.font = `600 ${r * 0.9}px Inter, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(label, node.x, node.y)
      }

      // ring — accent when active, otherwise subtle border
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.lineWidth = isActive ? 2.5 : 1
      ctx.strokeStyle = isActive ? c.accent : c.border
      ctx.stroke()

      // name label when zoomed in or active
      if (globalScale > 1.6 || isActive) {
        const name = node.displayName || (node.handle ? `@${node.handle}` : node.id.slice(0, 12))
        ctx.font = `500 ${Math.max(3, 11 / globalScale)}px Inter, sans-serif`
        ctx.fillStyle = c.fg
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.fillText(name, node.x, node.y + r + 1.5)
      }
      ctx.restore()
    },
    [activeId, highlightNodes],
  )

  const paintPointerArea = useCallback(
    (node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
      if (typeof node.x !== "number" || typeof node.y !== "number") return
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x, node.y, nodeRadius(node) + 1, 0, 2 * Math.PI)
      ctx.fill()
    },
    [],
  )

  const linkColor = useCallback(
    (link: FGLink) => {
      const c = colorsRef.current
      if (!c) return "transparent"
      if (highlightNodes) {
        const s = linkEndId(link.source)
        const t = linkEndId(link.target)
        const on = s != null && t != null && highlightNodes.has(s) && highlightNodes.has(t)
        if (!on) return c.border
      }
      return link.mutual ? c.accent : c.link
    },
    [highlightNodes],
  )

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null
  const hoverNode = hoverId ? nodeById.get(hoverId) ?? null : null
  const panelNode = hoverNode ?? selectedNode

  const neighbourList = useMemo(() => {
    if (!panelNode) return { endorsed: [] as GraphNode[], endorsedBy: [] as GraphNode[] }
    const endorsed: GraphNode[] = []
    const endorsedBy: GraphNode[] = []
    for (const l of links) {
      const s = linkEndId(l.source)
      const t = linkEndId(l.target)
      if (s === panelNode.id && t) {
        const n = nodeById.get(t)
        if (n) endorsed.push(n)
      } else if (t === panelNode.id && s) {
        const n = nodeById.get(s)
        if (n) endorsedBy.push(n)
      }
    }
    return { endorsed, endorsedBy }
  }, [panelNode, links, nodeById])

  // --- draggable panel ---------------------------------------------------
  const onPanelPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Don't start a drag from the collapse button or any control.
      if ((e.target as HTMLElement).closest("button, a")) return
      const el = panelRef.current
      if (!el) return
      const base = panelPos ?? { x: el.offsetLeft, y: el.offsetTop }
      dragRef.current = { sx: e.clientX, sy: e.clientY, bx: base.x, by: base.y }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [panelPos],
  )

  const onPanelPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setPanelPos({ x: d.bx + (e.clientX - d.sx), y: d.by + (e.clientY - d.sy) })
  }, [])

  const onPanelPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  // --- fullscreen --------------------------------------------------------
  // Fullscreen the whole `.viz` container (graph + stats sidebar), not just
  // the canvas — the sidebar's rankings and search stay usable. The host
  // lives a few levels under `.viz`, so walk up to it.
  const fullscreenTarget = useCallback(
    () => hostRef.current?.closest(".viz") ?? hostRef.current,
    [],
  )

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(
        !!document.fullscreenElement &&
          !!hostRef.current &&
          document.fullscreenElement.contains(hostRef.current),
      )
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
    } else {
      void fullscreenTarget()?.requestFullscreen?.()
    }
  }, [fullscreenTarget])

  return (
    <div ref={hostRef} className="viz__canvas-host">
      {size.w > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor={bgColor}
          // Keep repainting when idle so avatars appear as their images
          // finish loading (the ref has no public refresh()).
          autoPauseRedraw={false}
          nodeRelSize={4}
          nodeLabel={() => ""}
          cooldownTicks={120}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          linkColor={linkColor}
          linkWidth={(l: FGLink) => (l.mutual ? 1.6 : 0.8)}
          linkCurvature={(l: FGLink) => (l.mutual ? 0.2 : 0)}
          linkDirectionalArrowLength={3.2}
          linkDirectionalArrowRelPos={1}
          onNodeHover={(n: FGNode | null) => setHoverId(n ? (n.id as string) : null)}
          onNodeClick={(n: FGNode) => focusNode(n.id as string)}
          onBackgroundClick={() => setSelectedId(null)}
        />
      )}

      {/* controls */}
      <div className="viz__controls">
        <form onSubmit={handleSearch} className="viz__search-wrap">
          <Input
            className="viz__search"
            placeholder="Find account"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
            aria-label="Find an account in the graph"
          />
          {searchOpen && searchResults.length > 0 && (
            <ul className="viz__search-results" role="listbox">
              {searchResults.map((n) => (
                <li key={n.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="viz__search-result"
                    // Fire before the input's blur so the dropdown doesn't
                    // close out from under the click.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectSearchResult(n.id)
                    }}
                  >
                    <Avatar
                      src={n.avatarUrl || undefined}
                      size="sm"
                      fallbackInitials={getInitials(n.displayName, n.id)}
                    />
                    <span className="viz__search-result-name">
                      <span className="viz__search-result-primary">
                        {n.displayName ||
                          (n.handle ? `@${n.handle}` : n.id.slice(0, 16) + "…")}
                      </span>
                      {n.handle && n.displayName && (
                        <span className="viz__search-result-secondary">@{n.handle}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        <div className="viz__control-row">
          <Button
            variant={onlyMutual ? "primary" : "secondary"}
            size="sm"
            pressed={onlyMutual}
            onClick={() => setOnlyMutual((v) => !v)}
          >
            Mutual only
          </Button>
        </div>
        <div className="viz__legend" aria-hidden="true">
          <div className="viz__legend-row">
            <span className="viz__legend-swatch viz__legend-swatch--uni" />
            <span>One-way endorsement</span>
          </div>
          <div className="viz__legend-row">
            <span className="viz__legend-swatch viz__legend-swatch--mutual" />
            <span>Mutual endorsement</span>
          </div>
        </div>
      </div>

      {/* zoom controls */}
      <div className="viz__zoom">
        <Button
          size="icon"
          variant="secondary"
          aria-label="Zoom in"
          onClick={() => {
            const fg = fgRef.current
            if (fg) fg.zoom(fg.zoom() * 1.4, 300)
          }}
        >
          +
        </Button>
        <Button
          size="icon"
          variant="secondary"
          aria-label="Zoom out"
          onClick={() => {
            const fg = fgRef.current
            if (fg) fg.zoom(fg.zoom() / 1.4, 300)
          }}
        >
          −
        </Button>
        <Button
          size="icon"
          variant="secondary"
          aria-label="Fit graph to view"
          onClick={() => fgRef.current?.zoomToFit(400, 40)}
        >
          ⤢
        </Button>
        <Button
          size="icon"
          variant="secondary"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          onClick={toggleFullscreen}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {isFullscreen ? (
              <>
                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </>
            ) : (
              <>
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </>
            )}
          </svg>
        </Button>
      </div>

      {/* hover / selected info panel — draggable + collapsible */}
      {panelNode && (
        <div
          ref={panelRef}
          className="viz__panel"
          data-collapsed={panelCollapsed || undefined}
          style={panelPos ? { left: panelPos.x, top: panelPos.y, right: "auto" } : undefined}
        >
          <div
            className="viz__panel-head"
            onPointerDown={onPanelPointerDown}
            onPointerMove={onPanelPointerMove}
            onPointerUp={onPanelPointerUp}
          >
            <Avatar
              src={panelNode.avatarUrl || undefined}
              size="md"
              fallbackInitials={getInitials(panelNode.displayName, panelNode.id)}
              bordered
            />
            <div className="viz__panel-id">
              <span className="viz__panel-name">
                {panelNode.displayName || (panelNode.handle ? `@${panelNode.handle}` : "Unknown")}
              </span>
              {panelNode.handle && <span className="viz__panel-handle">@{panelNode.handle}</span>}
            </div>
            <button
              type="button"
              className="viz__panel-collapse"
              aria-label={panelCollapsed ? "Expand details" : "Collapse details"}
              aria-expanded={!panelCollapsed}
              onClick={() => setPanelCollapsed((v) => !v)}
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>

          {!panelCollapsed && (
          <>
          <div className="viz__panel-counts">
            <div className="viz__panel-count">
              <span className="viz__panel-count-value">{panelNode.given}</span>
              <span className="viz__panel-count-label">Endorsed</span>
            </div>
            <div className="viz__panel-count">
              <span className="viz__panel-count-value">{panelNode.received}</span>
              <span className="viz__panel-count-label">Endorsed by</span>
            </div>
            <div className="viz__panel-count">
              <span className="viz__panel-count-value">{panelNode.mutual}</span>
              <span className="viz__panel-count-label">Mutual</span>
            </div>
          </div>

          {neighbourList.endorsed.length > 0 && (
            <div>
              <div className="viz__panel-section-title">Endorsed ({neighbourList.endorsed.length})</div>
              <div className="viz__neighbours">
                {neighbourList.endorsed.slice(0, 12).map((n) => (
                  <span key={n.id} className="viz__neighbour" title={n.displayName || n.id}>
                    <Avatar
                      src={n.avatarUrl || undefined}
                      size="sm"
                      fallbackInitials={getInitials(n.displayName, n.id)}
                    />
                  </span>
                ))}
              </div>
            </div>
          )}

          {neighbourList.endorsedBy.length > 0 && (
            <div>
              <div className="viz__panel-section-title">
                Endorsed by ({neighbourList.endorsedBy.length})
              </div>
              <div className="viz__neighbours">
                {neighbourList.endorsedBy.slice(0, 12).map((n) => (
                  <span key={n.id} className="viz__neighbour" title={n.displayName || n.id}>
                    <Avatar
                      src={n.avatarUrl || undefined}
                      size="sm"
                      fallbackInitials={getInitials(n.displayName, n.id)}
                    />
                  </span>
                ))}
              </div>
            </div>
          )}

          <Link
            href={profileUrl(panelNode.handle || panelNode.id)}
            className="viz__profile-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>View profile</span>
            <svg
              className="viz__profile-link-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17 17 7" />
              <path d="M9 7h8v8" />
            </svg>
          </Link>
          </>
          )}
        </div>
      )}
    </div>
  )
}
