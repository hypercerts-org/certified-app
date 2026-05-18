"use client"

import dynamic from "next/dynamic"
import MapSkeleton from "./map-skeleton"
import type { MapProps } from "./map"

/**
 * Dynamic import wrapper around the Leaflet map. Use THIS from any
 * caller — never `./map` directly, because Leaflet touches `window`
 * on import and will crash SSR.
 *
 *   import Map from "@/components/map/map-dynamic"
 */
const Map = dynamic<MapProps>(() => import("./map"), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

export default Map
export type { MapProps, MapPin } from "./map"
