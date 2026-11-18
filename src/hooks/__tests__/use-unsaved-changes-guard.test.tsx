import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

const router = { back: vi.fn(), push: vi.fn(), replace: vi.fn() }
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/create",
  useSearchParams: () => new URLSearchParams(),
}))

import {
  confirmLeaveUnsavedChanges,
  hasUnsavedChanges,
  useUnsavedChangesGuard,
} from "../use-unsaved-changes-guard"
import { ViewTransitionProvider, useViewTransition } from "@/lib/view-transitions"

const PROMPT = "You have unsaved changes. Leave and discard them?"

function Form({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty)
  return null
}

/** The phone top bar's "Go back", as navbar.tsx calls it. */
function GoBack() {
  const { transitionBack } = useViewTransition()
  return (
    <button type="button" onClick={() => transitionBack()}>
      Go back
    </button>
  )
}

/** The form inside the root layout's provider, which adds the back /
 *  forward guard. */
function renderInApp(dirty: boolean) {
  return render(
    <ViewTransitionProvider>
      <Form dirty={dirty} />
    </ViewTransitionProvider>,
  )
}

function renderWithBack(dirty: boolean) {
  return render(
    <ViewTransitionProvider>
      <GoBack />
      <Form dirty={dirty} />
    </ViewTransitionProvider>,
  )
}

let confirmSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  history.replaceState(null, "", "/create")
  confirmSpy = vi.spyOn(window, "confirm")
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  router.back.mockReset()
  router.push.mockReset()
})

describe("useUnsavedChangesGuard: the shared dirty state", () => {
  it("is registered while the form is dirty, and cleared when clean or gone", () => {
    const { rerender, unmount } = render(<Form dirty={false} />)
    expect(hasUnsavedChanges()).toBe(false)
    rerender(<Form dirty />)
    expect(hasUnsavedChanges()).toBe(true)
    rerender(<Form dirty={false} />)
    expect(hasUnsavedChanges()).toBe(false)
    rerender(<Form dirty />)
    unmount()
    expect(hasUnsavedChanges()).toBe(false)
  })

  it("asks only when something is dirty", () => {
    expect(confirmLeaveUnsavedChanges()).toBe(true)
    expect(confirmSpy).not.toHaveBeenCalled()

    render(<Form dirty />)
    confirmSpy.mockReturnValueOnce(false)
    expect(confirmLeaveUnsavedChanges()).toBe(false)
    expect(confirmSpy).toHaveBeenCalledWith(PROMPT)
  })
})

// WS-01: the phone top bar's "Go back" left a dirty form without asking.
describe("transitionBack with a dirty form", () => {
  it("asks first, and stays when the viewer cancels", () => {
    confirmSpy.mockReturnValue(false)
    renderWithBack(true)
    fireEvent.click(screen.getByRole("button", { name: "Go back" }))
    expect(confirmSpy).toHaveBeenCalledWith(PROMPT)
    expect(router.back).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it("leaves once confirmed, without asking again", () => {
    confirmSpy.mockReturnValue(true)
    renderWithBack(true)
    fireEvent.click(screen.getByRole("button", { name: "Go back" }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    // Entered the app on this page (no in-app history): home.
    expect(router.push).toHaveBeenCalledWith("/")
  })

  it("doesn't ask for a clean form", () => {
    renderWithBack(false)
    fireEvent.click(screen.getByRole("button", { name: "Go back" }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith("/")
  })
})

describe("browser / OS back with a dirty form", () => {
  /** Stands in for the App Router's own popstate listener, which it adds
   *  after the root layout's ViewTransitionProvider has added the guard
   *  (Chrome calls a window's listeners in the order they were added). */
  function routerListener() {
    const onPop = vi.fn()
    window.addEventListener("popstate", onPop)
    return { onPop, remove: () => window.removeEventListener("popstate", onPop) }
  }

  /** The browser has moved back to the previous entry, then fires popstate. */
  function pressBack() {
    history.replaceState({ __NA: true }, "", "/records")
    window.dispatchEvent(new PopStateEvent("popstate", { state: { __NA: true } }))
  }

  it("stays: the router never sees it, and the browser returns to the form", () => {
    confirmSpy.mockReturnValue(false)
    const go = vi.spyOn(history, "go").mockImplementation(() => {})
    renderInApp(true)
    const { onPop, remove } = routerListener()
    pressBack()
    expect(confirmSpy).toHaveBeenCalledWith(PROMPT)
    expect(onPop).not.toHaveBeenCalled()
    expect(go).toHaveBeenCalledWith(1)
    // That return trip's popstate is swallowed too.
    history.replaceState(null, "", "/create")
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
    expect(onPop).not.toHaveBeenCalled()
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    remove()
  })

  it("leaves: the router gets the event, with the entry's state", () => {
    confirmSpy.mockReturnValue(true)
    renderInApp(true)
    const { onPop, remove } = routerListener()
    pressBack()
    expect(onPop).toHaveBeenCalledTimes(1)
    expect((onPop.mock.calls[0][0] as PopStateEvent).state).toEqual({ __NA: true })
    remove()
  })

  it("lets a back through untouched when the form is clean", () => {
    renderInApp(false)
    const { onPop, remove } = routerListener()
    pressBack()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onPop).toHaveBeenCalledTimes(1)
    remove()
  })

  it("doesn't ask twice after a confirmed Cancel (confirmDiscard, then router.back)", () => {
    confirmSpy.mockReturnValue(true)
    renderInApp(true)
    expect(confirmLeaveUnsavedChanges()).toBe(true)
    const { onPop, remove } = routerListener()
    pressBack()
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(onPop).toHaveBeenCalledTimes(1)
    remove()
  })
})

describe("the back / forward guard's place", () => {
  it("is added by the provider, and asks only while a form is dirty", () => {
    const { rerender } = render(
      <ViewTransitionProvider>
        <Form dirty={false} />
      </ViewTransitionProvider>,
    )
    const onPop = vi.fn()
    window.addEventListener("popstate", onPop)
    confirmSpy.mockReturnValue(false)
    vi.spyOn(history, "go").mockImplementation(() => {})
    history.replaceState(null, "", "/records")
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
    expect(onPop).toHaveBeenCalledTimes(1)

    history.replaceState(null, "", "/create")
    rerender(
      <ViewTransitionProvider>
        <Form dirty />
      </ViewTransitionProvider>,
    )
    history.replaceState(null, "", "/records")
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(onPop).toHaveBeenCalledTimes(1)
    window.removeEventListener("popstate", onPop)
  })
})
