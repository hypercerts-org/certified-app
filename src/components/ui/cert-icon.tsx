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
  /**
   * Hidden from assistive tech by default — the icon is almost always
   * decorative (it sits beside a text label). Pass `aria-hidden={false}`
   * together with `title`/`aria-label` when the icon is the only label.
   */
  "aria-hidden"?: boolean | "true" | "false"
  /**
   * Accessible name for standalone, labelled use. When provided, the icon is
   * exposed to assistive tech (role="img") with this name instead of being
   * hidden. `aria-label` takes precedence over `title` when both are set.
   */
  title?: string
  "aria-label"?: string
}

export default function CertIcon({
  size = 24,
  strokeWidth = 1.75,
  className,
  "aria-hidden": ariaHidden,
  title,
  "aria-label": ariaLabel,
}: CertIconProps) {
  const label = ariaLabel ?? title
  // Default to hidden unless the caller opts into a label or explicitly
  // overrides aria-hidden. A label implies the icon carries meaning, so it
  // must not be hidden.
  const hidden = label ? false : ariaHidden ?? true

  return (
    <IconCertificate
      size={size}
      stroke={strokeWidth}
      className={className}
      aria-hidden={hidden}
      role={label ? "img" : undefined}
      title={title}
      aria-label={label}
    />
  )
}
