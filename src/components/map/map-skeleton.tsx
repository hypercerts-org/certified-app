import React from "react"

interface MapSkeletonProps {
  height?: number | string
  className?: string
}

/**
 * Loading placeholder shown while the Leaflet chunk is being
 * downloaded and the Map component is mounting. Uses a subtle pulse
 * that honors `prefers-reduced-motion`.
 */
export default function MapSkeleton({
  height = 220,
  className = "",
}: MapSkeletonProps) {
  return (
    <div
      className={`map-skeleton ${className}`}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
      aria-hidden="true"
    />
  )
}
