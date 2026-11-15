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
}
