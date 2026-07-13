"use client"

import { useSyncExternalStore } from "react"

// Never fires: mount state only changes once, at hydration, which
// useSyncExternalStore models via the server/client snapshot split.
const emptySubscribe = () => () => {}

/**
 * Returns `true` only after the component has mounted on the client.
 *
 * Use to gate render of code that must NOT participate in SSR — typical
 * cases in this app are `createPortal(...)` calls and any read of
 * `document` / `window` during render. The first render returns `false`
 * (matching the server render via the server snapshot), and the
 * post-hydration client snapshot flips it to `true`, so the portal
 * renders into the real DOM.
 *
 * The standard pattern of `const [mounted, setMounted] = useState(false)
 * + useEffect(() => setMounted(true), [])` was duplicated across the
 * layout chrome components (`navbar`, `desktop-top-bar`'s portaled
 * switcher menus, plus `mobile-sidebar`'s portal). Consolidate here.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}
