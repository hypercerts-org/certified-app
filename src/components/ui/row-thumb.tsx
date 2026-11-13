"use client"

import { useState, type ReactNode } from "react"

/** Row thumbnail: the record image over the type icon. The icon is always
 *  there underneath, so the tile is never an empty grey square: not while
 *  the image loads (blobs come through the xrpc proxy and can take a
 *  moment), not when it is transparent, and not when it fails or turns out
 *  empty (an error or a 0–1px image drops it). Decorative — the row's
 *  label already names the link. `className` owns the tile size and chrome
 *  (e.g. `home-record__thumb`), including the `img` sizing. */
export default function RowThumb({
  src,
  icon,
  className,
}: {
  src: string | null
  icon: ReactNode
  className: string
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = !!src && failedSrc !== src
  return (
    <span className={`relative ${className}`}>
      {icon}
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0"
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth <= 1) setFailedSrc(src)
          }}
          onError={() => setFailedSrc(src)}
        />
      ) : null}
    </span>
  )
}
