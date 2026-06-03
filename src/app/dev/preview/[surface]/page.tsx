"use client"

/**
 * Dev-only auth-mock PREVIEW HARNESS.
 *
 * Renders an auth-gated composed surface (profile / feed / settings /
 * workspace) against fixture data so Playwright can screenshot it
 * logged-out. The surface components are the REAL production ones — the
 * only thing swapped is the network layer (`MockFetchProvider` patches
 * `window.fetch`) and a NESTED copy of the real provider stack so the
 * fixture session is the one the subtree reads.
 *
 * Why a nested stack: the global providers in `app/layout.tsx` mount at
 * app boot, before this page (and its `MockFetchProvider`) exist, so
 * their `/api/auth/session` call already resolved to "signed out". We
 * re-instantiate the SAME real providers here, nested under
 * `MockFetchProvider`; React context resolves to the nearest provider,
 * so the composed surface reads the fixture-backed auth/org state. The
 * providers are imported, never faked — the surfaces stay byte-identical
 * to production.
 *
 * Gated to non-production via `notFound()`.
 *
 * Routes:
 *   /dev/preview/profile        — own individual profile
 *   /dev/preview/profile-org    — own organization profile
 *   /dev/preview/feed           — signed-in home feed
 *   /dev/preview/settings       — settings panel
 *   /dev/preview/workspace      — workspace explorer
 *
 * `?fixture=empty` switches every list/connection to its empty variant.
 */

import { Suspense, useMemo } from "react"
import { notFound, useParams, useSearchParams } from "next/navigation"

// Real providers — same imports app/layout.tsx uses.
import { Providers } from "@/lib/providers"
import { AuthProvider } from "@/lib/auth/auth-context"
import { OrgProvider } from "@/lib/groups/org-context"
import { OnboardingProvider } from "@/lib/onboarding/onboarding-context"
import { NotificationsProvider } from "@/lib/notifications-context"
import { NavbarProvider } from "@/lib/navbar-context"
import { FeedbackProvider } from "@/lib/feedback-context"
import { ToastProvider } from "@/components/ui/toast"

import MockFetchProvider, {
  type MockScenario,
} from "@/components/dev/mock-fetch-provider"
import type { ProfileScenario } from "@/lib/dev/fixtures/profile"

// Real composed surfaces.
import UserProfilePage from "@/app/profile/[handle]/page"
import Home from "@/components/home/home"
import SettingsPanel from "@/components/settings/settings-panel"
import Workspace from "@/components/workspace/workspace"

const SURFACES = [
  "profile",
  "profile-org",
  "feed",
  "settings",
  "workspace",
] as const
type Surface = (typeof SURFACES)[number]

function isSurface(v: string | undefined): v is Surface {
  return !!v && (SURFACES as readonly string[]).includes(v)
}

/** The real composed surface for a given preview slug. */
function SurfaceBody({ surface }: { surface: Surface }) {
  switch (surface) {
    case "profile":
    case "profile-org":
      // UserProfilePage reads the handle from useParams(); in this route
      // the param is `surface`, but the page only uses it to seed the
      // resolve-did call, which the mock ignores (it always returns the
      // viewer's own profile). isOwnProfile resolves true because the
      // resolved DID equals the fixture session DID.
      return <UserProfilePage />
    case "feed":
      return <Home />
    case "settings":
      return <SettingsPanel />
    case "workspace":
      return (
        <div className="workspace-page">
          <Suspense fallback={null}>
            <Workspace />
          </Suspense>
        </div>
      )
  }
}

export default function PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound()

  const params = useParams()
  const searchParams = useSearchParams()
  const rawSurface =
    typeof params.surface === "string" ? params.surface : undefined

  const fixture = searchParams?.get("fixture")
  const scenario: MockScenario = fixture === "empty" ? "empty" : "populated"

  const profileScenario: ProfileScenario = useMemo(
    () => (rawSurface === "profile-org" ? "org" : "individual"),
    [rawSurface],
  )

  if (!isSurface(rawSurface)) notFound()

  return (
    <MockFetchProvider profileScenario={profileScenario} scenario={scenario}>
      {/* SAME provider order as app/layout.tsx, re-instantiated under the
          fetch mock so the fixture session is the one this subtree reads. */}
      <Providers>
        <ToastProvider>
          <AuthProvider>
            <OrgProvider>
              <OnboardingProvider>
                <NotificationsProvider>
                  <NavbarProvider>
                    <FeedbackProvider>
                      <main
                        id="preview-main"
                        data-preview-surface={rawSurface}
                        className="flex-1"
                      >
                        <SurfaceBody surface={rawSurface} />
                      </main>
                    </FeedbackProvider>
                  </NavbarProvider>
                </NotificationsProvider>
              </OnboardingProvider>
            </OrgProvider>
          </AuthProvider>
        </ToastProvider>
      </Providers>
    </MockFetchProvider>
  )
}
