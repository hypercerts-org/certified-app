/**
 * Treemap layout for the Contributor Board — ports hyperboards-v2's
 * d3.treemapSquarify approach using just `d3-hierarchy` (no full d3 bundle).
 * Tile area is proportional to each entry's `value` (the contribution weight).
 */
import {
  hierarchy,
  treemap,
  treemapSquarify,
  type HierarchyRectangularNode,
} from "d3-hierarchy"
import type { BoardEntry } from "@/lib/atproto/hyperboard-types"

export interface TreemapTile {
  x: number
  y: number
  width: number
  height: number
  entry: BoardEntry
}

interface TreemapNode {
  value: number
  entry?: BoardEntry
  children?: TreemapNode[]
}

/**
 * Compute absolutely-positioned tiles for the given entries within a
 * width×height box. Zero/negative-weight entries are dropped (D3 gives them
 * 0-area tiles); entries are sorted by weight descending for a stable layout.
 */
export function layoutTreemap(
  entries: BoardEntry[],
  width: number,
  height: number,
  padding = 2,
): TreemapTile[] {
  if (!entries.length || width <= 0 || height <= 0) return []

  const valid = entries.filter((e) => e.value > 0)
  if (!valid.length) return []

  const sorted = [...valid].sort((a, b) => b.value - a.value)
  const root: TreemapNode = {
    value: 0,
    children: sorted.map((entry) => ({ value: entry.value, entry })),
  }

  const root2 = hierarchy<TreemapNode>(root).sum((d) =>
    d.children ? 0 : d.value,
  )

  const layout = treemap<TreemapNode>()
    .tile(treemapSquarify)
    .size([width, height])
    .paddingInner(padding)

  const laid = layout(root2)

  return laid
    .leaves()
    .map((leaf: HierarchyRectangularNode<TreemapNode>) => ({
      x: leaf.x0,
      y: leaf.y0,
      width: leaf.x1 - leaf.x0,
      height: leaf.y1 - leaf.y0,
      entry: leaf.data.entry as BoardEntry,
    }))
    .filter((tile) => tile.entry !== undefined)
}

/** Adaptive avatar + font sizing for a tile of the given pixel dimensions. */
export function tileSizing(
  width: number,
  height: number,
): { avatarSize: number; fontSize: number; showAvatar: boolean; showLabel: boolean } {
  const min = Math.min(width, height)
  const avatarSize = Math.max(20, Math.min(96, Math.round(min * 0.4)))
  const fontSize = Math.max(9, Math.min(14, Math.round(min * 0.12)))
  return {
    avatarSize,
    fontSize,
    showAvatar: min >= 36,
    showLabel: width > 56 && height > 36,
  }
}
