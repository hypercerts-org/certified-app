"use client"

import { useState, type ReactNode } from "react"

/** Row thumbnail: the record image, or the type icon when there is no
 *  image or it fails to load (so a broken blob never leaves an empty
 *  grey tile). Decorative — the row's label already names the link.
 *  `className` owns the tile size and chrome (e.g. `home-row__thumb`). */
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
    <span className={className}>
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        icon
      )}
    </span>
  )
}
