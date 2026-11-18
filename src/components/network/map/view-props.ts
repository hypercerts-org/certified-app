import type { MapModel } from "@/lib/map/model"
import type { MapKind } from "./world-map"

/** What the /map page hands each view. */
export interface MapViewProps {
  model: MapModel
  kind: MapKind
  /** The map's height; the views' side panels follow it. */
  height: number
  /** The bar under the map that drags it taller (pass to WorldMap). */
  resize: { min: number; max: number; onResize: (height: number) => void }
  /** The latitudes the places are in (world-map.tsx latitudeBand): where a
   *  phone's flat map starts. */
  startBand?: readonly [number, number] | null
  /** Where a view puts its phone Filters button: a slot in the page's bar,
   *  beside the flat / globe switch (shown only on phones). */
  filtersHost?: HTMLElement | null
}
