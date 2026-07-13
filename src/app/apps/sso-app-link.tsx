"use client"

import { useSession } from "@/hooks/use-session"

/**
 * Client island wrapping one app tile's outbound link. Silent SSO:
 * if the partner exposes an ePDS handle-login endpoint AND the
 * viewer is signed in, deep-link them via the shared Certified PDS
 * session so they land already signed in. Otherwise (and on the
 * server-rendered first paint, before the session resolves) fall
 * through to the marketing URL. Keeping only this wrapper client-side
 * lets the /apps grid itself render as a server component.
 */
export default function SsoAppLink({
  url,
  ssoHandleUrl,
  ariaLabel,
  children,
}: {
  url: string
  ssoHandleUrl?: string
  ariaLabel: string
  children: React.ReactNode
}) {
  const { handle } = useSession()
  const href =
    handle && ssoHandleUrl ? ssoHandleUrl + encodeURIComponent(handle) : url

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="apps-store__tile"
      aria-label={ariaLabel}
    >
      {children}
    </a>
  )
}
