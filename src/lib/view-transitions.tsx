"use client"

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * Directional page-slide transitions for in-app tab navigation (e.g. a
 * detail page's "Read full description" / "Show all" → sub-tab, and the
 * Back button returning). Built on the browser View Transitions API:
 *
 *   - Forward navigations slide the new view in from the right.
 *   - Back navigations reverse it (new view in from the left).
 *
 * App Router navigations are async (the DOM updates after the route
 * commits), so we hand startViewTransition a promise and resolve it from
 * a route-change effect once the new URL has rendered. A timeout backstop
 * resolves the promise if the route never changes, so the page can never
 * stay frozen. Browsers without the API — and reduced-motion users — get
 * a plain, instant navigation.
 */

type Direction = "forward" | "back"

interface ViewTransitionApi {
  /** Navigate forward to `href` with a slide-from-right transition. */
  transitionTo: (href: string, options?: { scroll?: boolean }) => void
  /** Navigate back with the reverse slide. Pass a custom navigate fn
   *  (defaults to router.back()). */
  transitionBack: (navigate?: () => void) => void
}

const ViewTransitionContext = createContext<ViewTransitionApi | null>(null)

type StartViewTransition = (callback: () => void | Promise<void>) => {
  finished: Promise<void>
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/** Renders nothing; fires `onChange` whenever the path or query changes.
 *  Isolated under its own Suspense boundary so useSearchParams can't
 *  suspend the whole app during static rendering. */
function RouteWatcher({ onChange }: { onChange: () => void }) {
  const pathname = usePathname()
  const search = useSearchParams()
  useEffect(() => {
    onChange()
  }, [pathname, search, onChange])
  return null
}

export function ViewTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const finishRef = useRef<(() => void) | null>(null)

  // In-app navigation depth, so the default Back action never walks out
  // of the app. We patch history.pushState (Next's router calls it for
  // every forward navigation, including query-only tab switches) to
  // increment, and popstate (back/forward) to decrement, clamped at 0.
  // router.replace uses replaceState, so URL canonicalization (did→handle)
  // isn't counted. When the depth is 0 the user entered the app on this
  // page (direct link, external referrer, or refresh), so `router.back()`
  // would leave the app — we push "/" instead. Lives here (single,
  // app-wide mount) rather than per-chrome component so every
  // `transitionBack()` caller — mobile navbar and desktop top bar — gets
  // the same guard without double-patching history.
  const inAppDepthRef = useRef(0)
  useEffect(() => {
    const origPushState = history.pushState.bind(history)
    history.pushState = (...args: Parameters<typeof origPushState>) => {
      inAppDepthRef.current += 1
      return origPushState(...args)
    }
    const onPop = () => {
      inAppDepthRef.current = Math.max(0, inAppDepthRef.current - 1)
    }
    window.addEventListener("popstate", onPop)
    return () => {
      history.pushState = origPushState
      window.removeEventListener("popstate", onPop)
    }
  }, [])

  const handleRouteChange = useCallback(() => {
    if (finishRef.current) {
      finishRef.current()
      finishRef.current = null
    }
  }, [])

  const run = useCallback((direction: Direction, navigate: () => void) => {
    const start = (
      document as Document & { startViewTransition?: StartViewTransition }
    ).startViewTransition?.bind(document)
    // The full-page root slide is a mobile affordance. On desktop (≥800px,
    // BP_GT_MOBILE) it drags the persistent chrome (top bar, nav rail)
    // sideways for what are really tab switches — so desktop navigates
    // plainly and the per-tab content animates locally instead (see
    // TabPanelTransition). Mobile keeps the directional page slide.
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 800px)").matches
    if (!start || prefersReducedMotion() || isDesktop) {
      navigate()
      return
    }
    document.documentElement.dataset.vtDir = direction
    const transition = start(
      () =>
        new Promise<void>((resolve) => {
          finishRef.current = resolve
          navigate()
          // Backstop: never leave the page frozen if the route doesn't
          // actually change (e.g. navigating to the current URL). Only clear
          // the shared ref when it's still THIS transition's resolver (a
          // newer navigation may have replaced it); resolve this
          // transition's own promise unconditionally — settling a superseded
          // transition is harmless and avoids leaking a pending promise.
          window.setTimeout(() => {
            if (finishRef.current === resolve) {
              finishRef.current = null
            }
            resolve()
          }, 500)
        }),
    )
    transition.finished.finally(() => {
      delete document.documentElement.dataset.vtDir
    })
  }, [])

  const transitionTo = useCallback(
    (href: string, options?: { scroll?: boolean }) =>
      run("forward", () => router.push(href, options)),
    [run, router],
  )

  const transitionBack = useCallback(
    (navigate?: () => void) =>
      run(
        "back",
        navigate ??
          (() => {
            if (inAppDepthRef.current > 0) {
              // Real in-app history — safe to pop (popstate decrements).
              router.back()
            } else {
              // Entered the app on this page; router.back() would exit to
              // an external page. Go home instead.
              router.push("/")
            }
          }),
      ),
    [run, router],
  )

  // Stable context value — the callbacks are themselves memoized, so
  // consumers don't re-render on every provider render.
  const api = useMemo<ViewTransitionApi>(
    () => ({ transitionTo, transitionBack }),
    [transitionTo, transitionBack],
  )

  return (
    <ViewTransitionContext.Provider value={api}>
      <Suspense fallback={null}>
        <RouteWatcher onChange={handleRouteChange} />
      </Suspense>
      {children}
    </ViewTransitionContext.Provider>
  )
}

export function useViewTransition(): ViewTransitionApi {
  const ctx = useContext(ViewTransitionContext)
  if (!ctx) {
    throw new Error(
      "useViewTransition must be used within a <ViewTransitionProvider>",
    )
  }
  return ctx
}

/** Drop-in <Link> that plays the forward slide transition on click while
 *  preserving normal link behaviour (modifier-click opens a new tab). */
export function TransitionLink({
  href,
  className,
  children,
  scroll = true,
  ...rest
}: {
  href: string
  className?: string
  children: ReactNode
  scroll?: boolean
} & Omit<
  React.ComponentProps<typeof Link>,
  "href" | "className" | "onClick" | "scroll"
>) {
  const { transitionTo } = useViewTransition()
  return (
    <Link
      href={href}
      className={className}
      scroll={scroll}
      onClick={(e) => {
        if (
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          e.button !== 0
        ) {
          return
        }
        e.preventDefault()
        transitionTo(href, { scroll })
      }}
      {...rest}
    >
      {children}
    </Link>
  )
}
