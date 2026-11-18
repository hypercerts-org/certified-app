import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react"

const router = { back: vi.fn(), push: vi.fn(), replace: vi.fn() }
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/create",
  useSearchParams: () => new URLSearchParams(),
}))

import {
  confirmLeave,
  hasUnsavedChanges,
  useUnsavedChangesGuard,
} from "../use-unsaved-changes-guard"
import { ViewTransitionProvider, useViewTransition } from "@/lib/view-transitions"

/** Another page in the app (a plain anchor stands in for any link). */
const ELSEWHERE = "/elsewhere"

/** The browser's own prompt: only without the in-app dialog's host. */
const NATIVE_PROMPT = "You have unsaved changes. Leave and discard them?"

function Form({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty)
  return null
}

/** The in-app question (a ConfirmDialog mounted by the provider). */
function prompt() {
  // jsdom doesn't open a <dialog>, so it is queried as hidden (and its
  // name isn't computed there): the title says which question it is.
  const dialog = screen.queryByRole("alertdialog", { hidden: true })
  if (dialog) expect(dialog).toHaveTextContent("Discard your changes?")
  return dialog
}
function answer(label: "Discard changes" | "Keep editing") {
  fireEvent.click(screen.getByRole("button", { name: label, hidden: true }))
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

  it("goes at once when nothing is dirty", () => {
    const proceed = vi.fn()
    confirmLeave(proceed)
    expect(proceed).toHaveBeenCalledTimes(1)
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it("falls back to the browser's prompt outside the app's provider", () => {
    render(<Form dirty />)
    confirmSpy.mockReturnValueOnce(false)
    const proceed = vi.fn()
    confirmLeave(proceed)
    expect(confirmSpy).toHaveBeenCalledWith(NATIVE_PROMPT)
    expect(proceed).not.toHaveBeenCalled()
  })
})

// P1-3 / F13: in the app, the question is a ConfirmDialog, never window.confirm.
describe("the in-app question", () => {
  it("asks in a dialog and goes only after Discard changes", () => {
    renderInApp(true)
    const proceed = vi.fn()
    act(() => confirmLeave(proceed))
    expect(prompt()).not.toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(proceed).not.toHaveBeenCalled()
    answer("Discard changes")
    expect(proceed).toHaveBeenCalledTimes(1)
    expect(prompt()).toBeNull()
  })

  it("stays on Keep editing", () => {
    renderInApp(true)
    const proceed = vi.fn()
    act(() => confirmLeave(proceed))
    answer("Keep editing")
    expect(proceed).not.toHaveBeenCalled()
    expect(prompt()).toBeNull()
  })

  it("holds a link click and replays it once leaving is confirmed", () => {
    const followed = vi.fn((e: React.MouseEvent) => e.preventDefault())
    render(
      <ViewTransitionProvider>
        <Form dirty />
        <a href={ELSEWHERE} onClick={followed}>
          Elsewhere
        </a>
      </ViewTransitionProvider>,
    )
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }))
    expect(followed).not.toHaveBeenCalled()
    expect(prompt()).not.toBeNull()
    answer("Discard changes")
    expect(followed).toHaveBeenCalledTimes(1)
  })

  it("lets an in-page link through without asking", () => {
    const followed = vi.fn((e: React.MouseEvent) => e.preventDefault())
    render(
      <ViewTransitionProvider>
        <Form dirty />
        <a href="#main-content" onClick={followed}>
          Skip
        </a>
      </ViewTransitionProvider>,
    )
    fireEvent.click(screen.getByRole("link", { name: "Skip" }))
    expect(followed).toHaveBeenCalledTimes(1)
    expect(prompt()).toBeNull()
  })

  it("lets links in an ignored area through (the inline editor's own bar)", () => {
    function InlineEditor() {
      useUnsavedChangesGuard(true, { ignoreLinksWithin: ".edit-banner" })
      return null
    }
    const followed = vi.fn((e: React.MouseEvent) => e.preventDefault())
    render(
      <ViewTransitionProvider>
        <InlineEditor />
        <div className="edit-banner">
          <a href={ELSEWHERE} onClick={followed}>
            Elsewhere
          </a>
        </div>
      </ViewTransitionProvider>,
    )
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }))
    expect(followed).toHaveBeenCalledTimes(1)
    expect(prompt()).toBeNull()
  })

  it("Cancel's confirmDiscard runs the navigation at once for a clean form", () => {
    const go = vi.fn()
    function CleanForm() {
      const { confirmDiscard } = useUnsavedChangesGuard(false)
      return (
        <button type="button" onClick={() => confirmDiscard(go)}>
          Cancel
        </button>
      )
    }
    render(
      <ViewTransitionProvider>
        <CleanForm />
      </ViewTransitionProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(go).toHaveBeenCalledTimes(1)
    expect(prompt()).toBeNull()
  })
})

// WS-01: the phone top bar's "Go back" left a dirty form without asking.
describe("transitionBack with a dirty form", () => {
  it("asks first, and stays when the viewer keeps editing", () => {
    renderWithBack(true)
    fireEvent.click(screen.getByRole("button", { name: "Go back" }))
    expect(prompt()).not.toBeNull()
    answer("Keep editing")
    expect(router.back).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it("leaves once confirmed, without asking again", () => {
    renderWithBack(true)
    fireEvent.click(screen.getByRole("button", { name: "Go back" }))
    answer("Discard changes")
    // Entered the app on this page (no in-app history): home.
    expect(router.push).toHaveBeenCalledWith("/")
    fireEvent.click(screen.getByRole("button", { name: "Go back" }))
    expect(prompt()).toBeNull()
    expect(router.push).toHaveBeenCalledTimes(2)
  })

  it("doesn't ask for a clean form", () => {
    renderWithBack(false)
    fireEvent.click(screen.getByRole("button", { name: "Go back" }))
    expect(prompt()).toBeNull()
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
    act(() => {
      history.replaceState({ __NA: true }, "", "/records")
      window.dispatchEvent(new PopStateEvent("popstate", { state: { __NA: true } }))
    })
  }

  it("stays: the router never sees it, and the browser returns to the form", () => {
    const go = vi.spyOn(history, "go").mockImplementation(() => {})
    renderInApp(true)
    const { onPop, remove } = routerListener()
    pressBack()
    expect(prompt()).not.toBeNull()
    expect(onPop).not.toHaveBeenCalled()
    answer("Keep editing")
    expect(onPop).not.toHaveBeenCalled()
    expect(go).toHaveBeenCalledWith(1)
    // That return trip's popstate is swallowed too.
    history.replaceState(null, "", "/create")
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
    expect(onPop).not.toHaveBeenCalled()
    expect(prompt()).toBeNull()
    remove()
  })

  it("leaves: the router gets the event, with the entry's state", () => {
    renderInApp(true)
    const { onPop, remove } = routerListener()
    pressBack()
    expect(onPop).not.toHaveBeenCalled()
    answer("Discard changes")
    expect(onPop).toHaveBeenCalledTimes(1)
    expect((onPop.mock.calls[0][0] as PopStateEvent).state).toEqual({ __NA: true })
    remove()
  })

  it("lets a back through untouched when the form is clean", () => {
    renderInApp(false)
    const { onPop, remove } = routerListener()
    pressBack()
    expect(prompt()).toBeNull()
    expect(onPop).toHaveBeenCalledTimes(1)
    remove()
  })

  it("doesn't ask twice after a confirmed Cancel (confirmDiscard, then router.back)", () => {
    renderInApp(true)
    const proceed = vi.fn()
    act(() => confirmLeave(proceed))
    answer("Discard changes")
    expect(proceed).toHaveBeenCalledTimes(1)
    const { onPop, remove } = routerListener()
    pressBack()
    expect(prompt()).toBeNull()
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
    act(() => {
      history.replaceState(null, "", "/records")
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
    })
    expect(prompt()).not.toBeNull()
    expect(onPop).toHaveBeenCalledTimes(1)
    answer("Keep editing")
    window.removeEventListener("popstate", onPop)
  })
})
