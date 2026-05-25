"use client"

import { useEffect, useState } from "react"

/**
 * Returns `true` only after the component has mounted on the client.
 *
 * Use to gate render of code that must NOT participate in SSR — typical
 * cases in this app are `createPortal(...)` calls and any read of
 * `document` / `window` during render. With this hook, the first
 * render returns `false` (matching the server render), the post-mount
 * commit flips it to `true`, and the portal renders into the real DOM.
 *
 * The standard pattern of `const [mounted, setMounted] = useState(false)
 * + useEffect(() => setMounted(true), [])` was duplicated across the
 * three layout chrome components (`navbar`, `desktop-left-rail`,
 * `desktop-top-bar`'s portaled switcher menus, plus `mobile-sidebar`'s
 * portal). Consolidate here.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  return mounted
}
