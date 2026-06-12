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
 *   /dev/preview/create         — cert/activity CREATE form
 *   /dev/preview/profile-edit   — profile inline-edit form
 *   /dev/preview/activity-edit  — activity EDIT form (hydrated from a fixture)
 *
 * `?fixture=empty` switches every list/connection to its empty variant.
 */

import { Suspense, useMemo } from "react"
import { notFound, useParams, useSearchParams } from "next/navigation"
// Next resolves `useParams()` from this client context. The /dev/preview
// route's own param is `{ surface }`, so inside the profile surface
// `useParams().handle` is undefined — which makes `useUserProfile(null)`
// short-circuit (no resolve-did call) and the page render "Profile not
// found". We re-provide the param context with the fixture handle around
// the profile surface ONLY, so the real page resolves the own-profile
// identity through the unchanged mocked /api/resolve-did path. This is the
// single handle/identity entry point — the surface internals stay
// byte-identical to production.
import {
  PathParamsContext,
  NavigationPromisesContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime"

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
import {
  type ProfileScenario,
  certsProfileRecord,
} from "@/lib/dev/fixtures/profile"
import { MOCK_HANDLE } from "@/lib/dev/fixtures/session"
import { MOCK_ACTIVITY_RKEY } from "@/lib/dev/fixtures/feed"
import type { UploadedBlob } from "@/lib/atproto/profile"

// Real composed surfaces.
import UserProfilePage from "@/app/[actor]/page"
import Home from "@/components/home/home"
import SettingsPanel from "@/components/settings/settings-panel"
import Workspace from "@/components/workspace/workspace"
// Real auth-gated forms (CREATE / EDIT). Their READ dependencies are all
// mocked; the WRITE paths (createRecord / putRecord / blob upload) only
// fire on submit, which a screenshot pass never triggers.
import CreatePage from "@/app/create/page"
import RecordEditPage from "@/app/[actor]/[type]/[rkey]/edit/page"
import ProfileEditForm from "@/components/profile/profile-edit-form"

const SURFACES = [
  "profile",
  "profile-org",
  "feed",
  "settings",
  "workspace",
  "create",
  "profile-edit",
  "activity-edit",
] as const
type Surface = (typeof SURFACES)[number]

/** No-op blob upload for the profile-edit preview — the form only invokes
 *  it on a user file-pick, never on render, so the screenshot never hits
 *  it. Returns a structurally-valid {@link UploadedBlob} just in case. */
async function noopUpload(): Promise<UploadedBlob> {
  return {
    $type: "blob",
    ref: { $link: "bafyblobpreview000000000000000000000000000000000000000000" },
    mimeType: "image/png",
    size: 0,
  }
}

function isSurface(v: string | undefined): v is Surface {
  return !!v && (SURFACES as readonly string[]).includes(v)
}

/** The real composed surface for a given preview slug. */
function SurfaceBody({
  surface,
  profileScenario,
}: {
  surface: Surface
  profileScenario: ProfileScenario
}) {
  switch (surface) {
    case "profile":
    case "profile-org":
      // UserProfilePage reads the viewed actor from `useParams().actor`.
      // This route's real param is `{ surface }`, so without an override the
      // actor is undefined → `useUserProfile(null)` short-circuits (no
      // resolve-did fetch) → `!did` → "Profile not found". We re-provide the
      // param context with the fixture handle so the page resolves the
      // own-profile identity through the mocked /api/resolve-did. The mock
      // resolves both profile + profile-org to the SESSION DID, so
      // `isOwnProfile` (and `canEditInline`) hold and the owner-only
      // affordances render; `profileScenario` controls the org marker.
      // In dev, Next's `useParams`/`useSearchParams`/`usePathname` first
      // read `NavigationPromisesContext`; when it's non-null they return
      // ITS promise-backed values, ignoring the plain `PathParamsContext`.
      // So we null that context out (the hooks then fall through to the
      // plain contexts) AND supply `PathParamsContext` with the fixture
      // handle. `useSearchParams`/`usePathname` fall back to the plain
      // SearchParams/Pathname contexts the app-router still mounts above,
      // so the real ?tab= + pathname keep working — only `actor` is
      // synthesized.
      return (
        <NavigationPromisesContext.Provider value={null}>
          <PathParamsContext.Provider value={{ actor: MOCK_HANDLE }}>
            <UserProfilePage />
          </PathParamsContext.Provider>
        </NavigationPromisesContext.Provider>
      )
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
    case "create":
      // Self-contained page (no route params). Reads the rights list +
      // contributor typeahead (/api/search-actors) through the mock; the
      // contributor Combobox returns fixture results when typed into.
      return <CreatePage />
    case "activity-edit":
      // RecordEditPage reads `{ actor, type, rkey }` from useParams(). We
      // synthesize them the same way the profile surface synthesizes
      // `actor`: null out NavigationPromisesContext so the hooks fall
      // through to the plain PathParamsContext we supply. `useActivity`
      // then loads the fixture activity record (mock getRecord) to edit.
      return (
        <NavigationPromisesContext.Provider value={null}>
          <PathParamsContext.Provider
            value={{
              actor: MOCK_HANDLE,
              type: "activity",
              rkey: MOCK_ACTIVITY_RKEY,
            }}
          >
            <RecordEditPage />
          </PathParamsContext.Provider>
        </NavigationPromisesContext.Provider>
      )
    case "profile-edit":
      // The inline-edit form mounted by profile-sidebar when isEditing.
      // It's fully controlled by props and fetches nothing itself (the
      // parent page orchestrates saves), so we feed it the fixture
      // profile + no-op callbacks directly. Previews the individual
      // variant; the org variant (with the additional-URLs editor) is
      // covered by the profile-org screenshot of the read surface.
      return (
        <div className="profile-edit-page">
          <ProfileEditForm
            initialProfile={certsProfileRecord(profileScenario).value}
            isOrg={profileScenario === "org"}
            initialOrgUrls={
              profileScenario === "org"
                ? [{ url: "https://earthfund.example/docs", label: "Docs" }]
                : []
            }
            handle={MOCK_HANDLE}
            onSave={async () => {}}
            isSaving={false}
            saveError={null}
            onAvatarUpload={noopUpload}
            onBannerUpload={noopUpload}
            currentAvatarUrl={null}
            currentBannerUrl={null}
            fallbackInitials="AP"
          />
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

  // `?managed=1` opts the surface into the managed scenario — the mock
  // session owns/admins groups and the indexer serves the org-aggregation
  // connections — so the inline "by {group}" aggregation on Home + the
  // profile tabs can be verified with groups present.
  const managedScenario = searchParams?.get("managed") === "1"

  if (!isSurface(rawSurface)) notFound()

  return (
    <MockFetchProvider
      profileScenario={profileScenario}
      scenario={scenario}
      managedScenario={managedScenario}
    >
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
                        <SurfaceBody
                          surface={rawSurface}
                          profileScenario={profileScenario}
                        />
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
