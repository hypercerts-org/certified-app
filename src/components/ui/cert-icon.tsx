"use client"

import { IconCertificate } from "@tabler/icons-react"

/**
 * Single source of truth for the cert icon used across the app.
 *
 * Wraps `@tabler/icons-react`'s `IconCertificate` (`ti-certificate`)
 * with the same prop names lucide-react icons use elsewhere
 * (`strokeWidth`, not tabler's native `stroke`) so call sites can
 * swap `Award` → `CertIcon` without changing any other prop.
 *
 * Touch this file to change the cert icon everywhere.
 */
interface CertIconProps {
  size?: number | string
  strokeWidth?: number | string
  className?: string
  "aria-hidden"?: boolean | "true" | "false"
}

export default function CertIcon({
  size = 24,
  strokeWidth = 1.75,
  className,
  "aria-hidden": ariaHidden,
}: CertIconProps) {
  return (
    <IconCertificate
      size={size}
      stroke={strokeWidth}
      className={className}
      aria-hidden={ariaHidden}
    />
  )
}
