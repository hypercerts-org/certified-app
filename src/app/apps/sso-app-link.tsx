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
  children,
}: {
  url: string
  ssoHandleUrl?: string
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
    >
      {children}
      {/* The tile's visible text (name, tag, description) is its name. */}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  )
}
