"use client"

/**
 * Canvas force-directed endorsement graph. Loaded client-only (it touches
 * `window`/`canvas`) — the parent imports it via `next/dynamic({ ssr: false })`.
 *
 * Nodes are user avatars sized by degree; edges are directed badges (arrow
 * points issuer -> subject) of two kinds, toggled by a checkbox pair (at
 * least one always on). Endorsement edges: mutual ones render in the accent
 * colour with a slight curvature so the two directions bow apart into a
 * clearly bidirectional lens; one-way ones are a single muted straight
 * arrow. Award edges render in the warning (amber) colour and always carry
 * a small curvature so they never hide under a parallel endorsement edge
 * between the same pair.
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
import Checkbox from "@/components/ui/checkbox"
import Input from "@/components/ui/input"
import SegmentedControl from "@/components/ui/segmented-control"
import { getInitials } from "@/lib/utils/initials"
import { profileUrl } from "@/lib/urls"
import { useTrustedEvaluators } from "@/hooks/use-trusted-evaluators"
import type {
  GraphNode,
  GraphLink,
  EndorsementGraph as EndorsementGraphData,
} from "@/hooks/use-endorsement-graph"

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
  /** Whether the source dataset was capped — forwarded into the stats
   *  the sidebar shows for the filtered view. */
  truncated?: boolean
  /** Emits the stats of the CURRENTLY-VISIBLE (filtered) graph so the
   *  sidebar can mirror the active scope/mutual filters. */
  onStats?: (stats: EndorsementGraphData) => void
}

/**
 * Recompute sidebar stats over the visible (filtered) graph: per-node
 * given/received/mutual within the shown edges, total shown edges per
 * kind, and mutual pairs. Node metrics stay endorsement-scoped (matching
 * the hook and the endorsement-worded labels that consume them); award
 * edges only feed `totalAwards`. New node objects (not the canvas's) so
 * the force simulation isn't disturbed.
 */
function computeFilteredStats(
  nodes: GraphNode[],
  links: GraphLink[],
  truncated: boolean,
): EndorsementGraphData {
  const given = new Map<string, Set<string>>()
  const received = new Map<string, Set<string>>()
  const mutualCount = new Map<string, number>()
  let mutualLinks = 0
  let endorsementLinks = 0
  let awardLinks = 0
  for (const l of links) {
    const s = linkEndId(l.source)
    const t = linkEndId(l.target)
    if (!s || !t) continue
    if (l.kind === "award") {
      awardLinks++
      continue
    }
    endorsementLinks++
    ;(given.get(s) ?? given.set(s, new Set()).get(s)!).add(t)
    ;(received.get(t) ?? received.set(t, new Set()).get(t)!).add(s)
    if (l.mutual) {
      mutualLinks++
      mutualCount.set(s, (mutualCount.get(s) ?? 0) + 1)
    }
  }
  return {
    nodes: nodes.map((n) => ({
      ...n,
      given: given.get(n.id)?.size ?? 0,
      received: received.get(n.id)?.size ?? 0,
      mutual: mutualCount.get(n.id) ?? 0,
    })),
    links,
    totalEndorsements: endorsementLinks,
    totalAwards: awardLinks,
    mutualPairs: Math.round(mutualLinks / 2),
    truncated,
  }
}

interface ThemeColors {
  fg: string
  muted: string
  border: string
  disc: string
  discText: string
  accent: string
  /** Award-typed edges — amber, distinct from both endorsement colours. */
  award: string
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
    award: get("--color-warning"),
    link: get("--fg-muted"),
    bg: get("--bg-sunken"),
  }
}

function nodeRadius(n: { given: number; received: number }): number {
  return Math.min(22, 4 + Math.sqrt(n.given + n.received) * 1.4)
}

// --- layout modes -----------------------------------------------------------
// The graph ships several arrangements behind a switcher so the best-looking
// one can be picked per dataset. Every mode runs a collision force so avatars
// never overlap (the original default had none — hence the overlapping logos).

export type LayoutMode = "network" | "spread" | "radial"

export const LAYOUT_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: "network", label: "Network" },
  { value: "spread", label: "Spread" },
  { value: "radial", label: "Radial" },
]

/** Minimal mutable node shape the custom d3 forces read/write. */
interface SimNode {
  id: string
  given: number
  received: number
  x?: number
  y?: number
  vx?: number
  vy?: number
}

/**
 * Position-based collision force (mirrors d3-force's `forceCollide` so we
 * don't add a dependency — `react-force-graph` bundles its own d3 and exposes
 * only the simulation, not the force constructors). Each tick, any two nodes
 * closer than the sum of their radii (+ padding) are pushed apart. O(n²) is
 * fine for the few-hundred-node network.
 */
function makeCollideForce(padding: number) {
  let ns: SimNode[] = []
  const force = () => {
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i]
      if (a.x == null || a.y == null) continue
      const ra = nodeRadius(a) + padding
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j]
        if (b.x == null || b.y == null) continue
        const min = ra + nodeRadius(b) + padding
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6
        if (dist < min) {
          const shift = ((min - dist) / dist) * 0.5 * 0.8 // 0.8 = strength
          const sx = dx * shift
          const sy = dy * shift
          a.x -= sx
          a.y -= sy
          b.x += sx
          b.y += sy
        }
      }
    }
  }
  force.initialize = (nodes: SimNode[]) => {
    ns = nodes
  }
  return force
}

/**
 * Radial force pulling each node toward a ring whose radius is set by its
 * influence (given + received): the most-endorsed accounts settle near the
 * centre, leaf accounts on the outer ring. Centre is the simulation origin
 * (0,0), where `forceCenter` already pins the graph.
 */
function makeRadialForce(
  maxDegree: number,
  innerR: number,
  outerR: number,
  strength: number,
) {
  let ns: SimNode[] = []
  const force = (alpha: number) => {
    for (const n of ns) {
      if (n.x == null || n.y == null) continue
      const deg = n.given + n.received
      const target =
        innerR + (1 - (maxDegree > 0 ? deg / maxDegree : 0)) * (outerR - innerR)
      const dist = Math.sqrt(n.x * n.x + n.y * n.y) || 1e-6
      const k = ((target - dist) / dist) * strength * alpha
      n.vx = (n.vx ?? 0) + n.x * k
      n.vy = (n.vy ?? 0) + n.y * k
    }
  }
  force.initialize = (nodes: SimNode[]) => {
    ns = nodes
  }
  return force
}

/**
 * Gentle gravity toward the origin (0,0). Disconnected components have no
 * links pulling them together, so the charge force alone flings them far
 * apart; a small inward pull keeps separate clusters near the centre and
 * close to each other.
 */
function makeGravityForce(strength: number) {
  let ns: SimNode[] = []
  const force = (alpha: number) => {
    for (const n of ns) {
      if (n.x == null || n.y == null) continue
      n.vx = (n.vx ?? 0) - n.x * strength * alpha
      n.vy = (n.vy ?? 0) - n.y * strength * alpha
    }
  }
  force.initialize = (nodes: SimNode[]) => {
    ns = nodes
  }
  return force
}

function linkEndId(end: string | NodeObject<GraphNode> | undefined): string | null {
  if (end == null) return null
  if (typeof end === "string") return end
  return typeof end.id === "string" ? end.id : null
}

export default function EndorsementGraph({ nodes, links, focusReq, truncated = false, onStats }: EndorsementGraphProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined)
  const colorsRef = useRef<ThemeColors | null>(null)
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map())

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  // Background is read during render (a prop), so it lives in state rather
  // than the colours ref; updated alongside the ref on theme changes.
  const [bgColor, setBgColor] = useState<string | undefined>(undefined)
  // Bumped when a repaint is needed for reasons React can't see: an avatar
  // image finishing loading, or a theme flip updating colorsRef. Carried in
  // the painter callbacks' deps — force-graph repaints once per new painter
  // identity, so the canvas stays paused when idle (autoPauseRedraw).
  const [repaintEpoch, setRepaintEpoch] = useState(0)
  const [onlyMutual, setOnlyMutual] = useState(false)
  // Badge-kind checkboxes. Both on by default; the UI disables the last
  // checked one so at least one kind is always shown.
  const [showEndorsements, setShowEndorsements] = useState(true)
  const [showAwards, setShowAwards] = useState(true)
  const [layout, setLayout] = useState<LayoutMode>("network")
  // Default on: only show the web reachable from the trusted evaluators
  // (any number of endorsement hops). Also hides stray disconnected
  // clusters that otherwise float far out in empty space.
  const [evaluatorConnectedOnly, setEvaluatorConnectedOnly] = useState(true)
  const { evaluatorDids } = useTrustedEvaluators()
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
      // The painters read colorsRef (a ref), so a theme flip needs an
      // explicit repaint or nodes/links keep the stale theme's colours.
      setRepaintEpoch((e) => e + 1)
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
  // Coalesce repaint bumps to one per animation frame: image load events
  // fire as separate tasks (React can't batch them), so a graph with
  // hundreds of avatar nodes would otherwise re-render this component
  // once per image in a burst after mount. The pending rAF is cancelled
  // on unmount so a mid-burst unmount can't fire a stray callback.
  const repaintRafRef = useRef<number | null>(null)
  const scheduleRepaint = useCallback(() => {
    if (repaintRafRef.current !== null) return
    repaintRafRef.current = requestAnimationFrame(() => {
      repaintRafRef.current = null
      setRepaintEpoch((e) => e + 1)
    })
  }, [])
  useEffect(
    () => () => {
      if (repaintRafRef.current !== null) {
        cancelAnimationFrame(repaintRafRef.current)
      }
    },
    [],
  )

  // Preload into a stable map so the paint loop never mints a new Image per
  // frame. Each image that finishes (or fails) schedules a coalesced
  // repaintEpoch bump so the paused canvas repaints and the avatar appears
  // — the ref has no public refresh(), and load events fire asynchronously
  // even for cached images, so hooking them here misses nothing.
  useEffect(() => {
    const map = imagesRef.current
    for (const n of nodes) {
      if (!n.avatarUrl || map.has(n.id)) continue
      const img = new Image()
      img.decoding = "async"
      img.onload = scheduleRepaint
      img.onerror = scheduleRepaint
      img.src = n.avatarUrl
      map.set(n.id, img)
    }
  }, [nodes, scheduleRepaint])

  // --- filtered working data (kind checkboxes + scope + mutual) ----------
  const data = useMemo(() => {
    let nds = nodes
    let lks = links

    // 0. badge-kind filter — the endorsement/award checkbox pair. Runs
    //    FIRST so the downstream filters (evaluator reachability, mutual-
    //    only) only ever see edges of the kinds the user wants: with
    //    awards unchecked the view is exactly the pre-award graph, and
    //    reachability never flows through a hidden edge. Nodes left
    //    without any visible edge drop out with their edges.
    if (!showEndorsements || !showAwards) {
      lks = lks.filter((l) => (l.kind === "award" ? showAwards : showEndorsements))
      const keep = new Set<string>()
      for (const l of lks) {
        keep.add(linkEndId(l.source) ?? "")
        keep.add(linkEndId(l.target) ?? "")
      }
      nds = nds.filter((n) => keep.has(n.id))
    }

    // 1. connected-to-evaluators filter — keep only the nodes reachable
    //    from a trusted evaluator by following endorsements OUTWARD
    //    (issuer → subject): an evaluator, everyone they endorse, everyone
    //    those accounts endorse, and so on to any depth. Edges pointing
    //    *into* the evaluator network don't pull a node in. Skipped until
    //    the evaluator set has loaded, or if none of them appear in the
    //    current graph (so we never blank the view out).
    //
    //    Reachability is computed over the kind-filtered graph — all its
    //    nodes and edges — and runs BEFORE the mutual-only filter. Otherwise
    //    mutual-only would drop one-way edges first, and an evaluator who
    //    only endorses one-way would vanish from the seed set, leaving
    //    `seen` empty and this whole filter a silent no-op (the reported
    //    bug).
    if (evaluatorConnectedOnly && evaluatorDids.length > 0) {
      const fullNodeIds = new Set(nds.map((n) => n.id))
      const adj = new Map<string, string[]>()
      const link2 = (k: string, v: string) => {
        const arr = adj.get(k)
        if (arr) arr.push(v)
        else adj.set(k, [v])
      }
      for (const l of lks) {
        const s = linkEndId(l.source)
        const t = linkEndId(l.target)
        if (!s || !t) continue
        // Directed: only follow issuer (source) -> subject (target).
        link2(s, t)
      }
      const seen = new Set<string>()
      const queue: string[] = []
      for (const d of evaluatorDids) {
        if (fullNodeIds.has(d) && !seen.has(d)) {
          seen.add(d)
          queue.push(d)
        }
      }
      if (seen.size > 0) {
        for (let i = 0; i < queue.length; i++) {
          for (const nb of adj.get(queue[i]) ?? []) {
            if (!seen.has(nb)) {
              seen.add(nb)
              queue.push(nb)
            }
          }
        }
        nds = nds.filter((n) => seen.has(n.id))
        lks = lks.filter((l) => {
          const s = linkEndId(l.source)
          const t = linkEndId(l.target)
          return s != null && t != null && seen.has(s) && seen.has(t)
        })
      }
    }

    // 2. mutual-only filter — applied last, a pure display constraint on the
    //    (possibly evaluator-scoped) graph: keep mutual edges and the nodes
    //    they touch. Award edges never carry the mutual flag (mutuality is
    //    an endorsement concept), so this filter hides them all — matching
    //    the sidebar's endorsement-scoped "Mutual pairs" count.
    if (onlyMutual) {
      lks = lks.filter((l) => l.mutual)
      const keep = new Set<string>()
      for (const l of lks) {
        keep.add(linkEndId(l.source) ?? "")
        keep.add(linkEndId(l.target) ?? "")
      }
      nds = nds.filter((n) => keep.has(n.id))
    }

    return { nodes: nds, links: lks }
  }, [nodes, links, onlyMutual, showEndorsements, showAwards, evaluatorConnectedOnly, evaluatorDids])

  // Mirror the visible (filtered) graph's stats up to the sidebar so its
  // counts + rankings track the active scope / mutual filters.
  const filteredStats = useMemo(
    () => computeFilteredStats(data.nodes, data.links, truncated),
    [data, truncated],
  )
  useEffect(() => {
    onStats?.(filteredStats)
  }, [filteredStats, onStats])

  // --- layout forces -----------------------------------------------------
  // Configure the simulation per layout mode. Re-runs when the mode or the
  // working data changes (react-force-graph rebuilds its default charge/link/
  // center forces on a graphData swap, so we re-apply our additions after) and
  // once `graphMounted` flips true — that's the render where the graph mounts
  // and `fgRef.current` becomes available. A boolean dep (not `size.w`) so
  // later container resizes never re-apply forces or reheat the simulation.
  // Collision is on in every mode so avatars don't overlap.
  const graphMounted = size.w > 0
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !graphMounted) return
    const charge = fg.d3Force("charge")
    const link = fg.d3Force("link")
    const count = data.nodes.length
    const maxDegree = data.nodes.reduce(
      (m, n) => Math.max(m, n.given + n.received),
      0,
    )

    // Padding leaves room for the name label drawn beneath each node so
    // text mostly clears its neighbours — a moderate gap (some overlap is
    // fine; over-spreading just shrinks the avatars at overview zoom).
    // Spread mode gets a bit more.
    fg.d3Force("collide", makeCollideForce(layout === "spread" ? 18 : 10))

    if (layout === "spread") {
      charge?.strength?.(-200)
      link?.distance?.(100)
      fg.d3Force("radial", null)
      // Pull disconnected clusters back toward the centre so they don't
      // drift into empty space (no links bind separate components).
      fg.d3Force("gravity", makeGravityForce(0.05))
    } else if (layout === "radial") {
      charge?.strength?.(-45)
      link?.distance?.(60)
      const outerR = Math.max(180, Math.sqrt(count) * 40)
      fg.d3Force("radial", makeRadialForce(maxDegree, 30, outerR, 0.6))
      // Radial already pulls toward rings around the origin — no gravity.
      fg.d3Force("gravity", null)
    } else {
      // network (compact, the default)
      charge?.strength?.(-70)
      link?.distance?.(48)
      fg.d3Force("radial", null)
      fg.d3Force("gravity", makeGravityForce(0.09))
    }
    fg.d3ReheatSimulation?.()
  }, [layout, data, graphMounted])

  // --- adjacency for hover/selection highlight ---------------------------
  // Built from the FILTERED links so hover dimming, focus zoom and the
  // detail panel all agree with the active kind/scope/mutual filters —
  // a hidden edge never keeps a neighbour lit or drags it into view.
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
    for (const l of data.links) {
      const s = linkEndId(l.source)
      const t = linkEndId(l.target)
      if (s && t) {
        add(s, t)
        add(t, s)
      }
    }
    return map
  }, [data.links])

  const activeId = hoverId ?? selectedId
  const highlightNodes = useMemo(() => {
    if (!activeId) return null
    const set = new Set<string>([activeId])
    for (const n of adjacency.get(activeId) ?? []) set.add(n)
    return set
  }, [activeId, adjacency])

  // Visible nodes only — so a selection or search can't resolve to a node
  // the active filters removed from the canvas.
  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>()
    for (const n of data.nodes) m.set(n.id, n)
    return m
  }, [data.nodes])

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

  // VISIBLE accounts matching the search box, ranked by degree. Drives the
  // results dropdown; filtered-out accounts don't appear (selecting one
  // would zoom to nothing).
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [] as GraphNode[]
    return data.nodes
      .filter(
        (n) =>
          (n.handle && n.handle.toLowerCase().includes(q)) ||
          (n.displayName && n.displayName.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.given + b.received - (a.given + a.received))
      .slice(0, 8)
  }, [search, data.nodes])

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
        const label = getInitials(node.displayName, node.handle)
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
        const raw = node.displayName || (node.handle ? `@${node.handle}` : node.id.slice(0, 12))
        // Cap label width so a long name doesn't sprawl across neighbours.
        const name = raw.length > 18 ? `${raw.slice(0, 17)}…` : raw
        ctx.font = `500 ${Math.max(3, 11 / globalScale)}px Inter, sans-serif`
        ctx.fillStyle = c.fg
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.fillText(name, node.x, node.y + r + 1.5)
      }
      ctx.restore()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- repaintEpoch forces one repaint when refs the painter reads change (avatar loads, theme flip)
    [activeId, highlightNodes, repaintEpoch],
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
      if (link.kind === "award") return c.award
      return link.mutual ? c.accent : c.link
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- repaintEpoch forces one repaint when colorsRef changes on a theme flip
    [highlightNodes, repaintEpoch],
  )

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null
  const hoverNode = hoverId ? nodeById.get(hoverId) ?? null : null
  const panelNode = hoverNode ?? selectedNode

  // Panel neighbour strips, split by badge kind so the "Endorsed" headings
  // stay truthful and an account connected by both an endorsement AND an
  // award shows up once per section (unique keys within each strip).
  // Derived from the filtered links, like the adjacency map above.
  const neighbourList = useMemo(() => {
    const empty = {
      endorsed: [] as GraphNode[],
      endorsedBy: [] as GraphNode[],
      awarded: [] as GraphNode[],
      awardedBy: [] as GraphNode[],
    }
    if (!panelNode) return empty
    const { endorsed, endorsedBy, awarded, awardedBy } = empty
    for (const l of data.links) {
      const s = linkEndId(l.source)
      const t = linkEndId(l.target)
      if (s === panelNode.id && t) {
        const n = nodeById.get(t)
        if (n) (l.kind === "award" ? awarded : endorsed).push(n)
      } else if (t === panelNode.id && s) {
        const n = nodeById.get(s)
        if (n) (l.kind === "award" ? awardedBy : endorsedBy).push(n)
      }
    }
    return { endorsed, endorsedBy, awarded, awardedBy }
  }, [panelNode, data.links, nodeById])

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
      {graphMounted && (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor={bgColor}
          nodeRelSize={4}
          nodeLabel={() => ""}
          cooldownTicks={120}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          linkColor={linkColor}
          linkWidth={(l: FGLink) => (l.kind === "award" ? 1.1 : l.mutual ? 1.6 : 0.8)}
          // Award edges always curve a little so they never draw exactly on
          // top of a parallel endorsement edge between the same pair. A
          // reciprocal award pair bows apart naturally: curvature is
          // relative to each link's direction, so the two opposite arrows
          // bend to opposite sides (award edges never carry `mutual`).
          linkCurvature={(l: FGLink) =>
            l.kind === "award" ? 0.14 : l.mutual ? 0.2 : 0
          }
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
                      fallbackInitials={getInitials(n.displayName, n.handle)}
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
          <SegmentedControl
            className="viz__layout-toggle"
            aria-label="Graph layout"
            value={layout}
            onValueChange={(v) => setLayout(v as LayoutMode)}
            size="sm"
            options={LAYOUT_OPTIONS}
          />
        </div>
        <div className="viz__control-row">
          <SegmentedControl
            className="viz__scope-toggle"
            aria-label="Network scope"
            value={evaluatorConnectedOnly ? "evaluator" : "everything"}
            onValueChange={(v) => setEvaluatorConnectedOnly(v === "evaluator")}
            size="sm"
            options={[
              { value: "evaluator", label: "Evaluator network" },
              { value: "everything", label: "Everything" },
            ]}
          />
        </div>
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
        {/* Badge-kind toggles. The last checked box is disabled so at
            least one kind is always visible. */}
        <div className="viz__control-row viz__kind-toggles">
          <Checkbox
            label="Endorsements"
            checked={showEndorsements}
            disabled={showEndorsements && !showAwards}
            onChange={(e) => setShowEndorsements(e.target.checked)}
          />
          <Checkbox
            label="Awards"
            checked={showAwards}
            disabled={showAwards && !showEndorsements}
            onChange={(e) => setShowAwards(e.target.checked)}
          />
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
          <div className="viz__legend-row">
            <span className="viz__legend-swatch viz__legend-swatch--award" />
            <span>Award</span>
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
              fallbackInitials={getInitials(panelNode.displayName, panelNode.handle)}
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

          {(
            [
              ["Endorsed", neighbourList.endorsed],
              ["Endorsed by", neighbourList.endorsedBy],
              ["Awarded", neighbourList.awarded],
              ["Awarded by", neighbourList.awardedBy],
            ] as const
          ).map(([title, list]) =>
            list.length > 0 ? (
              <div key={title}>
                <div className="viz__panel-section-title">
                  {title} ({list.length})
                </div>
                <div className="viz__neighbours">
                  {list.slice(0, 12).map((n) => (
                    <span key={n.id} className="viz__neighbour" title={n.displayName || n.id}>
                      <Avatar
                        src={n.avatarUrl || undefined}
                        size="sm"
                        fallbackInitials={getInitials(n.displayName, n.handle)}
                      />
                    </span>
                  ))}
                </div>
              </div>
            ) : null,
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
